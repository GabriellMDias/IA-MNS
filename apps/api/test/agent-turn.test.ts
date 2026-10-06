import { describe, expect, it, vi } from "vitest";
import { parseServerConfig } from "../src/config.js";
import { runAgentTurn } from "../src/features/agent/application.js";
import type { AgentPlanner } from "../src/features/agent/planner.js";
import type { AgentReply } from "../src/features/agent/capabilities.js";
import { TurnTrace } from "../src/features/agent/trace.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { SalesReader } from "../src/features/sales/oracle.js";
import { interpretation } from "../evals/fixtures.js";

function harness() {
  const router: AgentPlanner = {
    route: vi.fn<AgentPlanner["route"]>(() =>
      Promise.resolve({ intent: "capability", capabilityId: "sales" }),
    ),
  };
  const interpreter: SalesInterpreter = {
    interpret: vi.fn<SalesInterpreter["interpret"]>(),
  };
  const reader: SalesReader = {
    read: vi.fn(() =>
      Promise.resolve({
        current: {
          rows: [
            { period: "total", product: null, unit: "BRL", value: "321.09" },
          ],
          products: [{ code: "7", description: "MAÇÃ FUJI" }],
          missingWeight: false,
        },
        previous: null,
      }),
    ),
    close: () => Promise.resolve(),
  };
  const sales = createSalesCapability(
    parseServerConfig({ ORION_ENV: "test" }),
    new SalesChat(
      interpreter,
      reader,
      undefined,
      () => new Date("2026-10-05T15:00:00Z"),
    ),
  );
  let contexts: Record<string, unknown> = {};
  const history: { question: string; reply: AgentReply }[] = [];
  const turn = async (message: string, trace = new TurnTrace("content")) => {
    const result = await runAgentTurn(router, [sales], {
      actor: { id: "alice", permissions: new Set(["sales:read"]) },
      message,
      history: [...history],
      contexts,
      signal: new AbortController().signal,
      progress: () => Promise.resolve(),
      trace,
    });
    contexts = result.contexts;
    history.push({ question: message, reply: result.reply });
    return { reply: result.reply, trace };
  };
  return { router, interpreter, reader, turn, contexts: () => contexts };
}

describe("agent turn orchestration", () => {
  it("records the capability awaiting an answer and offers it the next message", async () => {
    const { router, interpreter, reader, turn, contexts } = harness();
    vi.mocked(interpreter.interpret)
      .mockResolvedValueOnce(
        interpretation({ measure: "net_value", filters: { product: "maçã" } }),
      )
      .mockResolvedValueOnce(
        interpretation({
          relation: "answer_pending",
          period: { kind: "month", month: 9 },
        }),
      );
    const question = await turn("Quanto vendi de maçã?");
    expect(question.reply.kind).toBe("clarification");
    expect(contexts()._agent).toEqual({
      version: 2,
      lastCapabilityId: "sales",
      pending: { capabilityId: "sales", awaiting: ["period"] },
    });
    // A router that cannot place a bare period still reaches the waiting capability.
    vi.mocked(router.route).mockResolvedValueOnce({
      intent: "unavailable",
      capabilityId: null,
    });
    const answer = await turn("Setembro");
    expect(answer.reply.kind).toBe("answer");
    expect(vi.mocked(reader.read).mock.calls[0][0]).toMatchObject({
      productSearch: "maçã",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    const routed = vi.mocked(router.route).mock.calls[1][0];
    expect(routed.pending).toEqual({
      capabilityId: "sales",
      awaiting: ["period"],
    });
    expect(routed.transcript).toEqual([
      {
        user: "Quanto vendi de maçã?",
        assistant: "Qual período você quer consultar?",
      },
    ]);
    expect(answer.trace.metadata(answerOutcome).notes.agent).toMatchObject({
      intent: "unavailable",
      capabilityId: "sales",
      routeOverride: "pending_capability",
    });
    expect(contexts()._agent).toMatchObject({ pending: null });
  });
  it("keeps social replies social and the pending request intact", async () => {
    const { router, interpreter, turn, contexts } = harness();
    vi.mocked(interpreter.interpret).mockResolvedValueOnce(
      interpretation({ filters: { product: "maçã" } }),
    );
    await turn("Quanto vendi de maçã?");
    vi.mocked(router.route).mockResolvedValueOnce({
      intent: "thanks",
      capabilityId: null,
    });
    const thanks = await turn("Obrigado");
    expect(thanks.reply.kind).toBe("conversation");
    expect(interpreter.interpret).toHaveBeenCalledOnce();
    expect(contexts()._agent).toMatchObject({
      pending: { capabilityId: "sales" },
    });
  });
  it("shares only the existence of business answers with the router", async () => {
    const { router, interpreter, turn } = harness();
    vi.mocked(interpreter.interpret).mockResolvedValue(
      interpretation({ period: { kind: "previous", unit: "month" } }),
    );
    const answer = await turn("Quanto vendemos no mês passado?");
    expect(answer.reply.message).toContain("321,09");
    await turn("E no mês anterior?");
    const routed = vi.mocked(router.route).mock.calls[1][0];
    expect(routed.transcript[0].assistant).toBe("[Resposta de sales entregue]");
    expect(JSON.stringify(routed)).not.toContain("321");
  });
  it("keeps trace metadata free of user text, filters and results", async () => {
    const { interpreter, turn } = harness();
    vi.mocked(interpreter.interpret).mockResolvedValueOnce(
      interpretation({
        filters: { product: "maçã-confidencial" },
        period: { kind: "previous", unit: "month" },
      }),
    );
    const { trace } = await turn("Quanto vendi de maçã-confidencial?");
    const metadata = JSON.stringify(trace.metadata(answerOutcome));
    for (const secret of ["confidencial", "321", "2026-09-01"])
      expect(metadata).not.toContain(secret);
    expect(trace.metadata(answerOutcome).notes.sales).toMatchObject({
      decision: "analyze",
      appliedRelation: "new",
      outcome: "execute",
      periodKind: "previous_month",
    });
    const record = trace.record(answerOutcome)!;
    expect(record.content.sales).toMatchObject({
      today: "2026-10-05",
      query: { productSearch: "maçã-confidencial" },
    });
    expect(JSON.stringify(record)).not.toContain("321");
    expect(new TurnTrace("metadata").record(answerOutcome)).toBeNull();
  });
});
const answerOutcome = {
  kind: "answer",
  capabilityId: "sales",
  failureCode: null,
} as const;
