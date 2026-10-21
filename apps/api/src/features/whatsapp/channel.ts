import { metrics } from "@opentelemetry/api";
import { errorDiagnostics } from "../../error-diagnostics.js";
import { AgentFailure } from "../agent/errors.js";
import { helpText, parseCommand, sourceNames } from "./commands.js";
import { splitText, turnText } from "./format.js";
import type { GraphClient } from "./graph.js";
import type { WhatsappAgent, WhatsappIdentity } from "./ports.js";
import {
  maxInboundAttempts,
  maxSendAttempts,
  reorderWindowMs,
  type InboundEnd,
  type InboundWork,
  type ReplyPart,
  type WhatsappRepository,
} from "./repository.js";
import type { Notification } from "./webhook.js";

export type ChannelLogger = {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
  error(object: object, message: string): void;
};

export type ChannelOptions = {
  repository: WhatsappRepository;
  graph: GraphClient;
  identity: WhatsappIdentity;
  /** Absent when the agent is not configured; messages then get a notice. */
  agent: WhatsappAgent | undefined;
  /** The owner-administered switch, read for every message and reply. */
  enabled: () => Promise<boolean>;
  dailyLimit: number;
  log: ChannelLogger;
  now?: () => Date;
  /** Poll interval of the workers when idle. */
  idleMs?: number;
};

/** A conversation continues while it had activity in this period. */
export const conversationIdleMs = 12 * 3600_000;
/** Replies are sent only inside Meta's 24-hour customer service window. */
const serviceWindowMs = 24 * 3600_000 - 10 * 60_000;
/** Per-Person usage limits (cost and abuse protection). */
const burst = { windowMs: 10 * 60_000, turns: 15 };
const daily = { windowMs: 24 * 3600_000, turns: 200 };
/** Longest a message waits for a busy conversation or agent capacity. */
const busyWaitMs = 10 * 60_000;
/** WhatsApp questions use the agent's question limit. */
const maxQuestionLength = 2000;
const retention = 30 * 24 * 3600_000;

const notices = {
  unsupported:
    "Por enquanto entendo apenas mensagens de texto. Envie sua pergunta escrita.",
  tooLong: `Sua mensagem passou de ${maxQuestionLength} caracteres. Envie uma pergunta mais curta.`,
  rateLimited:
    "Você enviou muitas perguntas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  dailyLimit:
    "O limite diário de perguntas pelo WhatsApp foi atingido. Tente novamente amanhã ou use o IA-MNS na web.",
  unavailable: "O IA-MNS está indisponível no momento. Tente mais tarde.",
  failed: "Não consegui concluir esta resposta. Tente novamente em instantes.",
  slow: "A resposta está demorando mais que o normal. Quando ficar pronta, ela aparecerá no IA-MNS, na mesma conversa.",
  newConversation: "Pronto, começamos uma nova conversa. Pode perguntar.",
  conversationClosed:
    "Esta conversa foi arquivada ou excluída no IA-MNS. Envie sua pergunta novamente para começar uma nova conversa.",
  unknownCommand:
    "Não conheço esse comando. Envie */ajuda* para ver as opções.",
  unknownSource:
    "Fonte não reconhecida. Use */fonte sankhya*, */fonte vrmaster* ou */fonte tudo*.",
} as const;

const meter = metrics.getMeter("@ia-mns/api");
const inboundCounter = meter.createCounter("ia_mns.whatsapp.inbound", {
  description: "WhatsApp messages by processing outcome.",
});
const outboundCounter = meter.createCounter("ia_mns.whatsapp.outbound", {
  description: "WhatsApp reply parts by send outcome.",
});
const refusedCounter = meter.createCounter("ia_mns.whatsapp.refused", {
  description: "WhatsApp senders refused at the webhook, by reason.",
});
const processingHistogram = meter.createHistogram(
  "ia_mns.whatsapp.processing.duration",
  {
    description: "From the person sending a message to its reply being queued.",
    unit: "s",
  },
);

function startOfSaoPauloDay(now: Date): Date {
  const [year, month, dayOfMonth] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  // São Paulo has no daylight saving time since 2019 (UTC-3).
  return new Date(Date.UTC(year, month - 1, dayOfMonth, 3));
}

/**
 * The WhatsApp channel: receives verified notifications, processes each
 * authorized message through the existing corporate agent, and sends replies
 * from a durable outbox. Authorization is decided by identity at receipt, at
 * processing and before every reply part, so a revoked number never receives
 * business data that was still being prepared.
 */
export class WhatsappChannel {
  private readonly options: Required<Omit<ChannelOptions, "agent">> & {
    agent: WhatsappAgent | undefined;
  };
  private readonly controller = new AbortController();
  private readonly loops: Promise<void>[] = [];
  private wakeUp: (() => void)[] = [];
  private pruning: NodeJS.Timeout | undefined;
  constructor(options: ChannelOptions) {
    this.options = {
      ...options,
      now: options.now ?? (() => new Date()),
      idleMs: options.idleMs ?? 1000,
    };
  }

  // ---------------- webhook ----------------
  /**
   * Handles one signature-verified notification. Messages of senders that
   * are not exactly one active, linked Person are dropped without a trace
   * beyond a reason counter: nothing is stored and nothing is answered.
   * Authorized messages are recorded durably before Meta is acknowledged.
   */
  async receive(notification: Notification) {
    let refused = 0;
    const enabled =
      notification.messages.length > 0 ? await this.options.enabled() : false;
    const accepted: {
      event: Notification["messages"][number];
      authorization: Extract<
        Awaited<ReturnType<WhatsappIdentity["authorize"]>>,
        { authorized: true }
      >;
    }[] = [];
    for (const event of notification.messages) {
      if (!enabled) {
        refused++;
        refusedCounter.add(1, { reason: "channel_disabled" });
        continue;
      }
      const authorization = await this.options.identity.authorize({
        phone: event.phone,
        userId: event.userId,
      });
      if (!authorization.authorized) {
        refused++;
        refusedCounter.add(1, { reason: authorization.reason });
        continue;
      }
      accepted.push({ event, authorization });
    }
    // One statement: the messages of a notification become visible together.
    const recorded = await this.options.repository.recordInbound(
      accepted.map(({ event, authorization }) => ({
        event,
        personId: authorization.personId,
        linkVersion: authorization.linkVersion,
      })),
    );
    const duplicates = accepted.length - recorded;
    for (const { authorization } of accepted)
      await this.options.identity
        .confirm(authorization)
        .catch((error) =>
          this.options.log.warn(
            { diagnostic: errorDiagnostics(error) },
            "whatsapp_link_confirmation_failed",
          ),
        );
    let statuses = 0;
    for (const status of notification.statuses)
      if (await this.options.repository.applyStatus(status)) statuses++;
    this.options.log.info(
      {
        recorded,
        refused,
        duplicates,
        statuses,
        ignored: notification.ignored,
      },
      "whatsapp_webhook_received",
    );
    if (recorded) setTimeout(() => this.wake(), reorderWindowMs + 20).unref();
  }

  // ---------------- inbound processing ----------------
  /** Processes the next due message, if any. */
  async processNext(): Promise<boolean> {
    const work = await this.options.repository.claimInbound();
    if (!work) return false;
    const started = Date.now();
    let end: InboundEnd | "released";
    try {
      end = await this.process(work);
    } catch (error) {
      if (this.controller.signal.aborted) {
        await this.options.repository.releaseInbound(work.id, 0, false);
        return true;
      }
      this.options.log.error(
        {
          inboundId: work.id,
          attempt: work.attempts,
          diagnostic: errorDiagnostics(error),
        },
        "whatsapp_processing_failed",
      );
      if (work.attempts < maxInboundAttempts) {
        await this.options.repository.releaseInbound(
          work.id,
          5000 * 2 ** work.attempts,
          true,
        );
        return true;
      }
      end = { state: "failed", outcome: "error" };
      await this.options.repository.finishInbound(work, end, [
        { kind: "notice", body: notices.failed },
      ]);
    }
    if (end !== "released") {
      inboundCounter.add(1, { outcome: end.outcome });
      this.options.log.info(
        {
          inboundId: work.id,
          outcome: end.outcome,
          attempts: work.attempts,
          durationMs: Date.now() - started,
        },
        "whatsapp_message_processed",
      );
      this.wake();
    }
    return true;
  }

  /** The current authorization still names this message's Person and link. */
  private async stillAuthorized(work: {
    personId: string;
    linkVersion: number;
    phone: string | null;
    userId: string | null;
  }) {
    const authorization = await this.options.identity.authorize({
      phone: work.phone,
      userId: work.userId,
    });
    return authorization.authorized &&
      authorization.personId === work.personId &&
      authorization.linkVersion === work.linkVersion
      ? authorization
      : null;
  }

  private async process(work: InboundWork): Promise<InboundEnd | "released"> {
    const { repository } = this.options;
    const finish = async (end: InboundEnd, reply: ReplyPart[] = []) => {
      await repository.finishInbound(work, end, reply);
      return end;
    };
    const notice = (
      outcome: string,
      body: string,
      state: InboundEnd["state"] = "completed",
    ) => finish({ state, outcome }, [{ kind: "notice", body }]);
    if (!(await this.options.enabled()))
      return finish({ state: "ignored", outcome: "channel_disabled" });
    const now = this.options.now();
    if (now.getTime() - work.sentAt.getTime() > serviceWindowMs)
      return finish({ state: "ignored", outcome: "expired" });
    const authorization = await this.stillAuthorized({
      personId: work.personId,
      linkVersion: work.linkVersion,
      phone: work.senderPhone,
      userId: work.senderUserId,
    });
    if (!authorization) return finish({ state: "ignored", outcome: "revoked" });
    if (work.kind !== "text" || !work.body?.trim())
      return notice("unsupported", notices.unsupported);
    const question = work.body.trim();
    if (question.length > maxQuestionLength)
      return notice("too_long", notices.tooLong);
    const thread = await repository.thread(work.personId);
    const command = parseCommand(question);
    if (command) {
      if (command.kind === "new_conversation") {
        await repository.saveThread(work.personId, { conversationId: null });
        return notice("command", notices.newConversation);
      }
      if (command.kind === "source") {
        if (!command.source) return notice("command", notices.unknownSource);
        await repository.saveThread(work.personId, { source: command.source });
        return notice(
          "command",
          `Fonte das consultas de vendas: *${sourceNames[command.source]}*.`,
        );
      }
      if (command.kind === "help")
        return notice("command", helpText(thread.source));
      return notice("command", notices.unknownCommand);
    }
    // A replayed message keeps its conversation and does not count again.
    if (!work.conversationId) {
      if (
        (await repository.turnsSince(
          work.personId,
          new Date(now.getTime() - burst.windowMs),
        )) >= burst.turns ||
        (await repository.turnsSince(
          work.personId,
          new Date(now.getTime() - daily.windowMs),
        )) >= daily.turns
      )
        return (await repository.outcomeSince(
          work.personId,
          "rate_limited",
          new Date(now.getTime() - burst.windowMs),
        ))
          ? finish({ state: "ignored", outcome: "rate_limited" })
          : notice("rate_limited", notices.rateLimited, "ignored");
      if (
        (await repository.allTurnsSince(startOfSaoPauloDay(now))) >=
        this.options.dailyLimit
      )
        return (await repository.outcomeSince(
          work.personId,
          "daily_limit",
          startOfSaoPauloDay(now),
        ))
          ? finish({ state: "ignored", outcome: "daily_limit" })
          : notice("daily_limit", notices.dailyLimit, "ignored");
    }
    const agent = this.options.agent;
    if (!agent)
      return notice("agent_unavailable", notices.unavailable, "failed");
    let conversationId = work.conversationId;
    if (!conversationId) {
      const conversation = await agent.conversation(
        work.personId,
        thread.conversationId,
        new Date(now.getTime() - conversationIdleMs),
      );
      conversationId = conversation.id;
      if (conversation.id !== thread.conversationId)
        await repository.saveThread(work.personId, {
          conversationId: conversation.id,
        });
      await repository.assignConversation(work.id, conversation.id);
      void this.options.graph.markRead(work.messageId, this.controller.signal);
    }
    let turn;
    try {
      turn = await agent.ask(
        {
          id: work.personId,
          permissions: new Set(authorization.permissions),
          scopes: authorization.scopes,
        },
        conversationId,
        work.id,
        question,
        thread.source,
        this.controller.signal,
      );
    } catch (error) {
      if (!(error instanceof AgentFailure)) throw error;
      if (error.code === "AGENT_CONVERSATION_BUSY") {
        // Another turn (possibly from the web) is running, or the agent is
        // at capacity: wait for it, within a bound.
        if (this.options.now().getTime() - work.sentAt.getTime() > busyWaitMs)
          return notice("agent_busy", notices.unavailable, "failed");
        await repository.releaseInbound(work.id, 3000, false);
        return "released";
      }
      if (
        error.code === "AGENT_CONVERSATION_ARCHIVED" ||
        error.code === "AGENT_CONVERSATION_NOT_FOUND"
      ) {
        // Archived or deleted meanwhile: the next message starts a new one.
        await repository.saveThread(work.personId, { conversationId: null });
        return notice(
          "conversation_closed",
          notices.conversationClosed,
          "failed",
        );
      }
      if (error.code === "AGENT_ACCESS_DENIED")
        return finish({ state: "ignored", outcome: "revoked" });
      return notice("agent_unavailable", notices.unavailable, "failed");
    }
    if (turn.state === "running")
      return notice("unfinished", notices.slow, "failed");
    // Permissions or the link may have changed while the agent worked.
    const current = await this.stillAuthorized({
      personId: work.personId,
      linkVersion: work.linkVersion,
      phone: work.senderPhone,
      userId: work.senderUserId,
    });
    if (
      !current ||
      (turn.reply !== null &&
        !(await agent.canReadTurn(
          {
            id: work.personId,
            permissions: new Set(current.permissions),
            scopes: current.scopes,
          },
          conversationId,
          turn.id,
        )))
    )
      return finish({ state: "ignored", outcome: "revoked", turnId: turn.id });
    processingHistogram.record(
      (this.options.now().getTime() - work.sentAt.getTime()) / 1000,
    );
    return finish(
      {
        state: "completed",
        outcome: turn.state === "completed" ? "answered" : "agent_failed",
        turnId: turn.id,
      },
      splitText(turnText(turn)).map((body) => ({
        kind: turn.reply === null ? "notice" : "answer",
        body,
      })),
    );
  }

  // ---------------- outbox ----------------
  /** Sends the next due reply part, if any. */
  async sendNext(): Promise<boolean> {
    const { repository, graph } = this.options;
    const expired = await repository.expireSending();
    if (expired) {
      outboundCounter.add(expired, { outcome: "unknown" });
      this.options.log.warn(
        { count: expired },
        "whatsapp_reply_outcome_unknown",
      );
    }
    const part = await repository.claimOutbound();
    if (!part) return false;
    const settle = async (
      result: Parameters<WhatsappRepository["settleOutbound"]>[1],
      latencyMs?: number,
    ) => {
      await repository.settleOutbound(part.id, result);
      const outcome = result.state === "pending" ? "retry" : result.state;
      outboundCounter.add(1, { outcome });
      this.options.log[
        result.state === "accepted" || result.state === "pending"
          ? "info"
          : "warn"
      ](
        {
          outboundId: part.id,
          inboundId: part.inboundId,
          part: part.part,
          attempt: part.attempts,
          outcome,
          ...("code" in result ? { code: result.code } : {}),
          ...(latencyMs === undefined ? {} : { latencyMs }),
        },
        "whatsapp_reply_settled",
      );
      return true;
    };
    if (!(await this.options.enabled()))
      return settle({ state: "revoked", code: "channel_disabled" });
    const current = await this.stillAuthorized({
      personId: part.personId,
      linkVersion: part.linkVersion,
      phone: part.recipientPhone,
      userId: part.recipientUserId,
    });
    if (!current) return settle({ state: "revoked", code: "revoked" });
    // The inbox retains the original turn reference for every part and retry.
    // Its server-authored reply includes derived evidence dependencies/scopes.
    if (
      part.kind !== "notice" &&
      (part.kind !== "answer" ||
        !part.conversationId ||
        !part.turnId ||
        !this.options.agent ||
        !(await this.options.agent.canReadTurn(
          {
            id: part.personId,
            permissions: new Set(current.permissions),
            scopes: current.scopes,
          },
          part.conversationId,
          part.turnId,
        )))
    )
      return settle({ state: "revoked", code: "access_denied" });
    if (
      this.options.now().getTime() - part.inboundSentAt.getTime() >
      serviceWindowMs
    )
      return settle({ state: "expired", code: "service_window" });
    if (!part.body) return settle({ state: "failed", code: "empty" });
    const started = Date.now();
    const outcome = await graph.sendText(
      { phone: part.recipientPhone, userId: part.recipientUserId },
      part.body,
      this.controller.signal,
    );
    const latencyMs = Date.now() - started;
    if (outcome.kind === "accepted")
      return settle(
        { state: "accepted", providerMessageId: outcome.messageId },
        latencyMs,
      );
    if (outcome.kind === "retry" && part.attempts < maxSendAttempts)
      return settle(
        {
          state: "pending",
          code: outcome.code,
          delayMs: outcome.retryAfterMs ?? 2000 * 2 ** part.attempts,
        },
        latencyMs,
      );
    if (outcome.kind === "rejected" && outcome.code === "190")
      this.options.log.error(
        { outboundId: part.id, code: outcome.code },
        "whatsapp_access_token_rejected",
      );
    return settle(
      {
        state: outcome.kind === "unknown" ? "unknown" : "failed",
        code: outcome.code,
      },
      latencyMs,
    );
  }

  // ---------------- workers ----------------
  private wake() {
    const waiting = this.wakeUp;
    this.wakeUp = [];
    for (const resolve of waiting) resolve();
  }
  private pause() {
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wakeUp = this.wakeUp.filter((callback) => callback !== finish);
        resolve();
      };
      const timer = setTimeout(finish, this.options.idleMs);
      timer.unref();
      this.wakeUp.push(finish);
    });
  }
  private loop(step: () => Promise<boolean>, name: string) {
    return (async () => {
      while (!this.controller.signal.aborted) {
        let worked = false;
        try {
          worked = await step();
        } catch (error) {
          this.options.log.error(
            { worker: name, diagnostic: errorDiagnostics(error) },
            "whatsapp_worker_failed",
          );
        }
        if (!worked && !this.controller.signal.aborted) await this.pause();
      }
    })();
  }

  /** Starts two message workers, one reply sender and hourly pruning. */
  start() {
    this.loops.push(
      this.loop(() => this.processNext(), "inbound"),
      this.loop(() => this.processNext(), "inbound"),
      this.loop(() => this.sendNext(), "outbound"),
    );
    this.pruning = setInterval(() => {
      void this.options.repository
        .prune(new Date(this.options.now().getTime() - retention))
        .catch(() => undefined);
    }, 3600_000);
    this.pruning.unref();
  }

  /** Stops claiming work and releases what is in progress for a later run. */
  async close() {
    clearInterval(this.pruning);
    this.controller.abort();
    this.wake();
    await Promise.allSettled(this.loops);
  }
}
