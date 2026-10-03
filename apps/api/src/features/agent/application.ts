import type { AgentCapability, AgentReply } from "./capabilities.js";
import type { AgentPlanner, AgentRoute } from "./planner.js";
import { AgentRepository } from "./prisma-repository.js";
import { AgentFailure } from "./errors.js";
export type AgentActor = { id: string; permissions: ReadonlySet<string> };
type ReportFailure = (error: unknown, turnId: string) => string;
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
  constructor(
    repository: AgentRepository,
    planner: AgentPlanner | undefined,
    capabilities: readonly AgentCapability[],
  ) {
    this.repository = repository;
    this.planner = planner;
    this.capabilities = capabilities;
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
  ) {
    try {
      const progress = async (
        stage: Parameters<AgentRepository["progress"]>[1],
      ) => {
        signal.throwIfAborted();
        await this.repository.progress(claimed.turn.id, stage);
      };
      await progress("thinking");
      const permitted = this.capabilities.filter((item) =>
        actor.permissions.has(item.permission),
      );
      const history = claimed.history
        .filter((item) => item.reply !== null)
        .map((item) => ({ question: item.question, reply: item.reply! }));
      const savedAgent =
        claimed.contexts &&
        typeof claimed.contexts === "object" &&
        !Array.isArray(claimed.contexts)
          ? (claimed.contexts._agent as
              { lastCapabilityId?: unknown } | undefined)
          : undefined;
      const lastCapabilityId =
        (typeof savedAgent?.lastCapabilityId === "string" &&
        this.capabilities.some(
          (item) => item.id === savedAgent.lastCapabilityId,
        )
          ? savedAgent.lastCapabilityId
          : null) ??
        history.findLast((item) => item.reply.capabilityId !== null)?.reply
          .capabilityId ??
        null;
      const route = await this.planner!.route(
        {
          message: claimed.turn.question,
          history: history.map((item) => item.question),
          lastCapabilityId,
        },
        signal,
      );
      signal.throwIfAborted();
      const contexts =
        claimed.contexts &&
        typeof claimed.contexts === "object" &&
        !Array.isArray(claimed.contexts)
          ? ({ ...claimed.contexts } as Record<string, unknown>)
          : {};
      let reply: AgentReply;
      if (route.intent === "capability") {
        const capability = this.capabilities.find(
          (item) => item.id === route.capabilityId,
        );
        if (!capability) throw new AgentFailure("AGENT_PROVIDER_UNAVAILABLE");
        if (!actor.permissions.has(capability.permission))
          throw new AgentFailure("AGENT_ACCESS_DENIED");
        const outcome = await capability.execute({
          message: claimed.turn.question,
          history,
          context: contexts[capability.id] ?? null,
          signal,
          progress,
        });
        if (outcome.reply.capabilityId !== capability.id)
          throw new Error("Invalid capability reply identity");
        reply = outcome.reply;
        contexts[capability.id] = outcome.context;
        contexts._agent = { version: 1, lastCapabilityId: capability.id };
      } else reply = conversationalReply(route.intent, permitted);
      signal.throwIfAborted();
      await this.repository.finish(actor.id, conversationId, claimed.turn.id, {
        reply,
        contexts,
      });
    } catch (error) {
      const code = reportFailure(error, claimed.turn.id);
      try {
        await this.repository.finish(
          actor.id,
          conversationId,
          claimed.turn.id,
          { failureCode: code },
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
