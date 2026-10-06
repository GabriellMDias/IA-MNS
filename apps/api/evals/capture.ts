import type { Database } from "../src/database.js";
import { businessToday } from "../src/features/sales/domain.js";
import type { EvalCase, EvalTurn, TurnExpectation } from "./dataset.js";

type StoredTrace = {
  notes?: {
    agent?: { intent?: unknown; capabilityId?: unknown };
    sales?: { clarification?: unknown };
  };
  content?: {
    agent?: { contextBefore?: unknown };
    sales?: { today?: unknown; stateBefore?: unknown; query?: unknown };
  };
};

/**
 * Converts a traced conversation, up to the given turn, into an unreviewed
 * candidate case. Expectations reproduce what was observed; a developer
 * corrects the failing turn to the intended behavior, rewrites confidential
 * wording synthetically, and only then promotes it into the curated dataset.
 */
export async function captureCandidate(
  database: Database,
  turnId: string,
  maximumTurns = 12,
): Promise<EvalCase> {
  const target = await database.agentTurn.findUnique({ where: { id: turnId } });
  if (!target) throw new Error("Turn not found");
  const rows = (
    await database.agentTurn.findMany({
      where: {
        conversationId: target.conversationId,
        sequence: { lte: target.sequence },
      },
      orderBy: { sequence: "desc" },
      take: maximumTurns,
      include: { trace: true },
    })
  ).reverse();
  const traces = rows.map(
    (row) => (row.trace?.trace ?? null) as StoredTrace | null,
  );
  if (!traces.at(-1))
    throw new Error(
      "The turn has no content trace; enable IA_MNS_AI_TRACE=content and reproduce it",
    );
  const first = traces[0];
  const sales = first?.content?.sales?.stateBefore;
  const agent = first?.content?.agent?.contextBefore;
  const today =
    typeof traces.at(-1)?.content?.sales?.today === "string"
      ? (traces.at(-1)!.content!.sales!.today as string)
      : businessToday(target.createdAt);
  const turns: EvalTurn[] = rows.map((row, index) => {
    const trace = traces[index];
    const reply = row.reply as { payload?: { kind?: string } } | null;
    const kind = reply?.payload?.kind as TurnExpectation["kind"] | undefined;
    const route =
      trace?.notes?.agent?.capabilityId ?? trace?.notes?.agent?.intent;
    const query = trace?.content?.sales?.query as
      TurnExpectation["query"] | undefined;
    const clarification = trace?.notes?.sales?.clarification;
    const expect: TurnExpectation = {
      ...(typeof route === "string" ? { route } : {}),
      ...(kind ? { kind } : {}),
      ...(kind === "clarification" && typeof clarification === "string"
        ? { clarification: clarification as TurnExpectation["clarification"] }
        : {}),
      ...(query ? { query } : {}),
    };
    return {
      user: row.question,
      ...(Object.keys(expect).length ? { expect } : {}),
    };
  });
  return {
    id: `trace/${turnId}`,
    title: "Captured conversation (rewrite before promotion)",
    status: "candidate",
    source: "trace",
    tags: ["trace"],
    today,
    notes: `Captured from turn ${target.sequence}${target.state === "failed" ? ` (failed: ${target.failureCode})` : ""}. Expectations reproduce observed behavior; correct them to the intended behavior.`,
    ...(sales || agent
      ? {
          context: {
            ...(sales ? { sales } : {}),
            ...(agent ? { _agent: agent } : {}),
          },
        }
      : {}),
    provenance: {
      reviewed: false,
      generator: "capture",
      createdAt: new Date().toISOString(),
      turnId,
    },
    turns,
  };
}
