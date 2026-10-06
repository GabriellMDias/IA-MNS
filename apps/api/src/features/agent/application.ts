import type { AiTraceLevel, TraceRecorder } from "../../ai/trace.js";
import type {
  AgentCapability,
  AgentReply,
  ProgressStage,
} from "./capabilities.js";
import {
  agentRouterVersion,
  type AgentPlanner,
  type AgentRoute,
} from "./planner.js";
import { AgentRepository } from "./prisma-repository.js";
import { AgentFailure } from "./errors.js";
import {
  TurnTrace,
  type TurnOutcome,
  type TurnTraceMetadata,
} from "./trace.js";
export type AgentActor = { id: string; permissions: ReadonlySet<string> };
type ReportFailure = (error: unknown, turnId: string) => string;
type ObserveTrace = (trace: TurnTraceMetadata, turnId: string) => void;
function conversationalReply(
  intent: AgentRoute["intent"],
  capabilities: readonly AgentCapability[],
): AgentReply {
  const offer = capabilities.length
    ? `Neste momento, posso ajudar com ${capabilities.map((item) => item.title.toLocaleLowerCase("pt-BR")).join(" e ")}.`
    : "Ainda não há uma capacidade de negócio disponível.";
  const messages = {
    greeting: `Olá! Sou o IA-MNS, seu agente da MNS. ${offer} Como posso ajudar?`,
    wellbeing: `Oi! Tudo certo por aqui, pronto para ajudar. E você? ${offer}`,
    thanks: "Por nada! Estou por aqui quando precisar.",
    farewell: "Até mais! Quando precisar, é só me chamar.",
    identity: `Sou o IA-MNS, o agente de IA da MNS. ${offer}`,
    help: `${offer} ${capabilities.map((item) => item.description).join(" ")} O que você gostaria de consultar?`,
    unavailable: `Ainda não tenho essa capacidade disponível. ${offer}`,
    capability: "Ainda não tenho essa capacidade disponível.",
  };
  return {
    kind: intent === "unavailable" ? "unavailable" : "conversation",
    message: messages[intent],
    capabilityId: null,
    result: null,
    suggestions: [
      "greeting",
      "wellbeing",
      "help",
      "identity",
      "unavailable",
    ].includes(intent)
      ? capabilities.flatMap((item) => [...item.examples]).slice(0, 3)
      : [],
  };
}

type AgentContext = {
  lastCapabilityId: string | null;
  pending: { capabilityId: string; awaiting: string[] } | null;
};
// Version 1 stored only the last capability; version 2 adds the capability
// that awaits an answer. Unknown capabilities are ignored, never trusted.
function agentContext(
  saved: unknown,
  capabilities: readonly AgentCapability[],
): AgentContext {
  const value =
    saved && typeof saved === "object"
      ? (saved as { lastCapabilityId?: unknown; pending?: unknown })
      : {};
  const known = (id: unknown): id is string =>
    typeof id === "string" && capabilities.some((item) => item.id === id);
  const pending = value.pending as
    { capabilityId?: unknown; awaiting?: unknown } | null | undefined;
  return {
    lastCapabilityId: known(value.lastCapabilityId)
      ? value.lastCapabilityId
      : null,
    pending:
      pending &&
      known(pending.capabilityId) &&
      Array.isArray(pending.awaiting) &&
      pending.awaiting.length <= 8 &&
      pending.awaiting.every(
        (item) => typeof item === "string" && item.length <= 40,
      )
        ? {
            capabilityId: pending.capabilityId,
            awaiting: pending.awaiting as string[],
          }
        : null,
  };
}

export type TurnInput = Readonly<{
  actor: AgentActor;
  message: string;
  history: readonly { question: string; reply: AgentReply }[];
  contexts: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  progress: (stage: ProgressStage) => Promise<void>;
  trace: TraceRecorder;
}>;

/**
 * One turn of agent orchestration, independent of persistence: route, check
 * permission, dispatch, and return the reply with the next contexts. While a
 * capability awaits an answer, a message the router cannot place is offered
 * to that capability, whose own boundary rejects unsupported requests.
 */
export async function runAgentTurn(
  planner: AgentPlanner,
  capabilities: readonly AgentCapability[],
  input: TurnInput,
): Promise<{ reply: AgentReply; contexts: Record<string, unknown> }> {
  const { actor, history, signal, trace } = input;
  const permitted = capabilities.filter((item) =>
    actor.permissions.has(item.permission),
  );
  const saved = agentContext(input.contexts._agent, capabilities);
  trace.content("agent", { contextBefore: input.contexts._agent ?? null });
  const lastCapabilityId =
    saved.lastCapabilityId ??
    history.findLast((item) => item.reply.capabilityId !== null)?.reply
      .capabilityId ??
    null;
  const route = await planner.route(
    {
      message: input.message,
      transcript: history.slice(-12).map((item) => ({
        user: item.question,
        // Answers carry business figures; only their existence is shared.
        assistant:
          item.reply.kind === "answer"
            ? `[Resposta de ${item.reply.capabilityId ?? "capacidade"} entregue]`
            : item.reply.message,
      })),
      lastCapabilityId,
      pending: saved.pending,
    },
    signal,
    trace,
  );
  signal.throwIfAborted();
  const override =
    route.intent === "unavailable" &&
    saved.pending !== null &&
    permitted.some((item) => item.id === saved.pending!.capabilityId);
  const capabilityId = override
    ? saved.pending!.capabilityId
    : route.intent === "capability"
      ? route.capabilityId
      : null;
  trace.note("agent", {
    router: agentRouterVersion,
    intent: route.intent,
    capabilityId,
    pendingCapabilityId: saved.pending?.capabilityId ?? null,
    routeOverride: override ? "pending_capability" : null,
  });
  const contexts: Record<string, unknown> = { ...input.contexts };
  if (capabilityId === null)
    return { reply: conversationalReply(route.intent, permitted), contexts };
  const capability = capabilities.find((item) => item.id === capabilityId);
  if (!capability) throw new AgentFailure("AGENT_PROVIDER_UNAVAILABLE");
  if (!actor.permissions.has(capability.permission))
    throw new AgentFailure("AGENT_ACCESS_DENIED");
  const outcome = await capability.execute({
    message: input.message,
    history,
    context: contexts[capability.id] ?? null,
    signal,
    progress: input.progress,
    trace,
  });
  if (outcome.reply.capabilityId !== capability.id)
    throw new Error("Invalid capability reply identity");
  contexts[capability.id] = outcome.context;
  contexts._agent = {
    version: 2,
    lastCapabilityId: capability.id,
    pending: outcome.awaiting?.length
      ? { capabilityId: capability.id, awaiting: [...outcome.awaiting] }
      : null,
  };
  return { reply: outcome.reply, contexts };
}

export class CorporateAgent {
  private readonly running = new Map<
    string,
    { controller: AbortController; task: Promise<void> }
  >();
  private closing = false;
  private accepting = 0;
  readonly repository: AgentRepository;
  private readonly planner: AgentPlanner | undefined;
  readonly capabilities: readonly AgentCapability[];
  private readonly traceLevel: AiTraceLevel;
  constructor(
    repository: AgentRepository,
    planner: AgentPlanner | undefined,
    capabilities: readonly AgentCapability[],
    options: { traceLevel?: AiTraceLevel } = {},
  ) {
    this.repository = repository;
    this.planner = planner;
    this.capabilities = capabilities;
    this.traceLevel = options.traceLevel ?? "off";
    if (capabilities.some((item) => !/^[a-z][a-z0-9_]{0,79}$/.test(item.id)))
      throw new Error("Invalid agent capability identifier");
    if (
      new Set(capabilities.map((item) => item.id)).size !== capabilities.length
    )
      throw new Error("Duplicate agent capability");
  }
  async submit(
    actor: AgentActor,
    conversationId: string,
    requestId: string,
    question: string,
    reportFailure: ReportFailure,
    observe?: ObserveTrace,
  ) {
    if (!this.planner) throw new AgentFailure("AGENT_NOT_CONFIGURED");
    if (this.closing || this.running.size + this.accepting >= 3)
      throw new AgentFailure("AGENT_CONVERSATION_BUSY");
    this.accepting++;
    let claimed: Awaited<ReturnType<AgentRepository["claim"]>>;
    try {
      claimed = await this.repository.claim(
        actor.id,
        conversationId,
        requestId,
        question,
      );
    } finally {
      this.accepting--;
    }
    if (!claimed.fresh) return claimed.turn;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const task = this.execute(
      actor,
      conversationId,
      claimed,
      controller.signal,
      reportFailure,
      observe,
    ).finally(() => {
      clearTimeout(timeout);
      this.running.delete(claimed.turn.id);
    });
    this.running.set(claimed.turn.id, { controller, task });
    return claimed.turn;
  }
  private async execute(
    actor: AgentActor,
    conversationId: string,
    claimed: Awaited<ReturnType<AgentRepository["claim"]>>,
    signal: AbortSignal,
    reportFailure: ReportFailure,
    observe: ObserveTrace | undefined,
  ) {
    const trace = new TurnTrace(this.traceLevel);
    let observed = false;
    // One observation per turn; a later persistence failure is reported
    // through the failure diagnostic instead.
    const conclude = (outcome: TurnOutcome) => {
      if (this.traceLevel !== "off" && !observed)
        observe?.(trace.metadata(outcome), claimed.turn.id);
      observed = true;
      return trace.record(outcome);
    };
    try {
      const progress = async (
        stage: Parameters<AgentRepository["progress"]>[1],
      ) => {
        signal.throwIfAborted();
        await this.repository.progress(claimed.turn.id, stage);
      };
      await progress("thinking");
      const history = claimed.history
        .filter((item) => item.reply !== null)
        .map((item) => ({ question: item.question, reply: item.reply! }));
      const contexts =
        claimed.contexts &&
        typeof claimed.contexts === "object" &&
        !Array.isArray(claimed.contexts)
          ? (claimed.contexts as Record<string, unknown>)
          : {};
      const { reply, contexts: next } = await runAgentTurn(
        this.planner!,
        this.capabilities,
        {
          actor,
          message: claimed.turn.question,
          history,
          contexts,
          signal,
          progress,
          trace,
        },
      );
      signal.throwIfAborted();
      await this.repository.finish(
        actor.id,
        conversationId,
        claimed.turn.id,
        { reply, contexts: next },
        conclude({
          kind: reply.kind,
          capabilityId: reply.capabilityId,
          failureCode: null,
        }),
      );
    } catch (error) {
      const code = reportFailure(error, claimed.turn.id);
      try {
        await this.repository.finish(
          actor.id,
          conversationId,
          claimed.turn.id,
          { failureCode: code },
          conclude({ kind: "failed", capabilityId: null, failureCode: code }),
        );
      } catch (persistenceError) {
        reportFailure(persistenceError, claimed.turn.id);
      }
    }
  }
  async close() {
    this.closing = true;
    for (const item of this.running.values()) item.controller.abort();
    await Promise.allSettled(
      [...this.running.values()].map((item) => item.task),
    );
    await Promise.all(this.capabilities.map((item) => item.close()));
  }
}
