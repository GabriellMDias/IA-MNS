import { randomUUID } from "node:crypto";
import type { Database } from "../../database.js";
import type { SourceSelection } from "../sales/sources.js";
import type { InboundEvent, StatusEvent } from "./webhook.js";

export type InboundWork = {
  id: string;
  messageId: string;
  personId: string;
  linkVersion: number;
  senderPhone: string | null;
  senderUserId: string | null;
  kind: "text" | "unsupported";
  body: string | null;
  sentAt: Date;
  attempts: number;
  conversationId: string | null;
};
export type OutboundWork = {
  id: string;
  inboundId: string;
  part: number;
  personId: string;
  linkVersion: number;
  recipientPhone: string | null;
  recipientUserId: string | null;
  body: string | null;
  attempts: number;
  kind: string;
  conversationId: string | null;
  turnId: string | null;
  /** When the person sent the message this part answers. */
  inboundSentAt: Date;
};
export type InboundEnd = {
  state: "completed" | "ignored" | "failed";
  outcome: string;
  turnId?: string | null;
};
export type ReplyPart = { kind: "answer" | "notice"; body: string };

/** Delay before a received message is processed, absorbing reordered deliveries. */
export const reorderWindowMs = 1000;
/** Processing claim; longer than the agent wait so a live claim never expires. */
const inboundLeaseSeconds = 300;
/** Send claim; an expired one means the outcome is unknown. */
const outboundLeaseSeconds = 60;
export const maxInboundAttempts = 3;
export const maxSendAttempts = 5;

type InboundRow = {
  id: string;
  message_id: string;
  person_id: string;
  link_version: number;
  sender_phone: string | null;
  sender_user_id: string | null;
  kind: string;
  body: string | null;
  sent_at: Date;
  attempts: number;
  conversation_id: string | null;
};
type OutboundRow = {
  id: string;
  inbound_id: string;
  part: number;
  person_id: string;
  link_version: number;
  recipient_phone: string | null;
  recipient_user_id: string | null;
  body: string | null;
  attempts: number;
  kind: string;
  conversation_id: string | null;
  turn_id: string | null;
  inbound_sent_at: Date;
};

// Status webhooks only move a part forward; `failed` never replaces a
// delivery or read confirmation.
const statusPredecessors: Record<StatusEvent["status"], string[]> = {
  sent: ["accepted"],
  delivered: ["accepted", "sent"],
  read: ["accepted", "sent", "delivered"],
  failed: ["accepted", "sent"],
};

/** PostgreSQL inbox, outbox and per-Person thread state of the channel. */
export class WhatsappRepository {
  private readonly database: Database;
  constructor(database: Database) {
    this.database = database;
  }

  /**
   * Records the authorized messages of one notification in one statement,
   * each once: a repeated delivery of a Meta message id records nothing. A
   * message becomes claimable only after the reorder window, so a message
   * sent earlier but delivered in a separate, slightly later notification is
   * still processed first. Returns how many were new.
   */
  async recordInbound(
    messages: readonly {
      event: InboundEvent;
      personId: string;
      linkVersion: number;
    }[],
  ): Promise<number> {
    if (!messages.length) return 0;
    const notBefore = new Date(Date.now() + reorderWindowMs);
    const created = await this.database.whatsappInboundMessage.createMany({
      data: messages.map(({ event, personId, linkVersion }) => ({
        id: randomUUID(),
        messageId: event.messageId,
        personId,
        linkVersion,
        senderPhone: event.phone,
        senderUserId: event.userId,
        kind: event.kind,
        body: event.text,
        sentAt: event.sentAt,
        notBefore,
      })),
      skipDuplicates: true,
    });
    return created.count;
  }

  /**
   * Claims the next due message whose Person has no earlier unfinished
   * message and no live claim, so each Person's messages are processed one
   * at a time in the order they were sent. Claims serialize on a transaction
   * lock, which makes the check safe across processes; an expired claim is
   * reclaimed.
   */
  async claimInbound(): Promise<InboundWork | null> {
    const rows = await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('whatsapp_inbound_claim'))`;
      return tx.$queryRaw<InboundRow[]>`
        UPDATE whatsapp_inbound_messages SET
          state = 'processing',
          attempts = attempts + 1,
          lease_until = clock_timestamp() + make_interval(secs => ${inboundLeaseSeconds})
        WHERE id = (
          SELECT m.id FROM whatsapp_inbound_messages m
          WHERE (m.state = 'pending'
                 OR (m.state = 'processing' AND m.lease_until <= clock_timestamp()))
            AND m.not_before <= clock_timestamp()
            AND NOT EXISTS (
              SELECT 1 FROM whatsapp_inbound_messages o
              WHERE o.person_id = m.person_id AND o.id <> m.id
                AND ((o.state = 'processing' AND o.lease_until > clock_timestamp())
                  OR (o.state IN ('pending', 'processing')
                      AND (o.sent_at, o.received_at, o.id) < (m.sent_at, m.received_at, m.id))))
          ORDER BY m.sent_at, m.received_at, m.id
          LIMIT 1)
        RETURNING id, message_id, person_id, link_version, sender_phone,
          sender_user_id, kind, body, sent_at, attempts, conversation_id`;
    });
    const row = rows[0];
    return row
      ? {
          id: row.id,
          messageId: row.message_id,
          personId: row.person_id,
          linkVersion: row.link_version,
          senderPhone: row.sender_phone,
          senderUserId: row.sender_user_id,
          kind: row.kind === "text" ? "text" : "unsupported",
          body: row.body,
          sentAt: row.sent_at,
          attempts: row.attempts,
          conversationId: row.conversation_id,
        }
      : null;
  }

  /** Remembers the conversation before the turn is submitted, for replays. */
  async assignConversation(id: string, conversationId: string) {
    await this.database.whatsappInboundMessage.updateMany({
      where: { id, state: "processing" },
      data: { conversationId },
    });
  }

  /**
   * Ends processing and queues the reply parts in one transaction, so a
   * crash never leaves a finished message without its reply or a reply
   * twice. The message text is cleared; the question stays in the agent
   * conversation.
   */
  async finishInbound(
    work: InboundWork,
    end: InboundEnd,
    reply: readonly ReplyPart[] = [],
  ) {
    await this.database.$transaction(async (tx) => {
      const updated = await tx.whatsappInboundMessage.updateMany({
        where: { id: work.id, state: "processing" },
        data: {
          state: end.state,
          outcome: end.outcome,
          turnId: end.turnId ?? null,
          body: null,
          leaseUntil: null,
          finishedAt: new Date(),
        },
      });
      if (updated.count !== 1 || reply.length === 0) return;
      await tx.whatsappOutboundMessage.createMany({
        data: reply.map((item, index) => ({
          id: randomUUID(),
          inboundId: work.id,
          part: index + 1,
          personId: work.personId,
          linkVersion: work.linkVersion,
          recipientPhone: work.senderPhone,
          recipientUserId: work.senderPhone ? null : work.senderUserId,
          kind: item.kind,
          body: item.body,
        })),
        skipDuplicates: true,
      });
    });
  }

  /**
   * Returns a claimed message to the queue after `delayMs`. `counted: false`
   * gives the attempt back (the work never started, for example a busy
   * conversation or shutdown).
   */
  async releaseInbound(id: string, delayMs: number, counted: boolean) {
    await this.database.$executeRaw`
      UPDATE whatsapp_inbound_messages SET
        state = 'pending',
        lease_until = NULL,
        not_before = clock_timestamp() + make_interval(secs => ${delayMs / 1000}),
        attempts = CASE WHEN ${counted} THEN attempts ELSE GREATEST(attempts - 1, 0) END
      WHERE id = ${id}::uuid AND state = 'processing'`;
  }

  /**
   * Parts whose send claim expired may have reached Meta before the process
   * stopped; they become `unknown` and are never sent again.
   */
  async expireSending(): Promise<number> {
    return this.database.$executeRaw`
      UPDATE whatsapp_outbound_messages SET
        state = 'unknown', failure_code = 'lease_expired', body = NULL,
        lease_until = NULL, updated_at = clock_timestamp()
      WHERE state = 'sending' AND lease_until <= clock_timestamp()`;
  }

  /** Claims the next due part, in order per Person and within each reply. */
  async claimOutbound(): Promise<OutboundWork | null> {
    const rows = await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('whatsapp_outbound_claim'))`;
      return tx.$queryRaw<OutboundRow[]>`
        WITH claimed AS (
          UPDATE whatsapp_outbound_messages SET
            state = 'sending',
            attempts = attempts + 1,
            lease_until = clock_timestamp() + make_interval(secs => ${outboundLeaseSeconds}),
            updated_at = clock_timestamp()
          WHERE id = (
            SELECT o.id FROM whatsapp_outbound_messages o
            JOIN whatsapp_inbound_messages i ON i.id = o.inbound_id
            WHERE o.state = 'pending' AND o.not_before <= clock_timestamp()
              AND NOT EXISTS (
                SELECT 1 FROM whatsapp_outbound_messages p
                JOIN whatsapp_inbound_messages pi ON pi.id = p.inbound_id
                WHERE p.person_id = o.person_id AND p.id <> o.id
                  AND (p.state = 'sending'
                    OR (p.state = 'pending'
                        AND (pi.sent_at, pi.received_at, p.inbound_id, p.part)
                          < (i.sent_at, i.received_at, o.inbound_id, o.part))))
            ORDER BY i.sent_at, i.received_at, o.inbound_id, o.part
            LIMIT 1)
          RETURNING id, inbound_id, part, person_id, link_version,
            recipient_phone, recipient_user_id, body, attempts, kind)
        SELECT claimed.*, i.sent_at AS inbound_sent_at, i.conversation_id, i.turn_id
        FROM claimed JOIN whatsapp_inbound_messages i ON i.id = claimed.inbound_id`;
    });
    const row = rows[0];
    return row
      ? {
          id: row.id,
          inboundId: row.inbound_id,
          part: row.part,
          personId: row.person_id,
          linkVersion: row.link_version,
          recipientPhone: row.recipient_phone,
          recipientUserId: row.recipient_user_id,
          body: row.body,
          attempts: row.attempts,
          kind: row.kind,
          conversationId: row.conversation_id,
          turnId: row.turn_id,
          inboundSentAt: row.inbound_sent_at,
        }
      : null;
  }

  /** Records what is known after a send attempt. */
  async settleOutbound(
    id: string,
    result:
      | { state: "accepted"; providerMessageId: string }
      | { state: "pending"; code: string; delayMs: number }
      | {
          state: "failed" | "unknown" | "revoked" | "expired";
          code: string;
        },
  ) {
    const now = new Date();
    if (result.state === "pending") {
      await this.database.whatsappOutboundMessage.updateMany({
        where: { id, state: "sending" },
        data: {
          state: "pending",
          failureCode: result.code,
          leaseUntil: null,
          notBefore: new Date(now.getTime() + result.delayMs),
          updatedAt: now,
        },
      });
      return;
    }
    await this.database.whatsappOutboundMessage.updateMany({
      where: { id, state: "sending" },
      data: {
        state: result.state,
        body: null,
        leaseUntil: null,
        updatedAt: now,
        ...(result.state === "accepted"
          ? { providerMessageId: result.providerMessageId, failureCode: null }
          : { failureCode: result.code }),
      },
    });
  }

  /** Applies a delivery status to the part Meta accepted under that id. */
  async applyStatus(status: StatusEvent): Promise<boolean> {
    const updated = await this.database.whatsappOutboundMessage.updateMany({
      where: {
        providerMessageId: status.providerMessageId,
        state: { in: statusPredecessors[status.status] },
      },
      data: {
        state: status.status,
        updatedAt: new Date(),
        ...(status.status === "failed"
          ? { failureCode: status.errorCode ?? "failed" }
          : {}),
      },
    });
    return updated.count === 1;
  }

  async thread(
    personId: string,
  ): Promise<{ conversationId: string | null; source: SourceSelection }> {
    const row = await this.database.whatsappThread.findUnique({
      where: { personId },
    });
    return {
      conversationId: row?.conversationId ?? null,
      source:
        row?.source === "vrmaster" || row?.source === "all"
          ? row.source
          : "sankhya",
    };
  }

  async saveThread(
    personId: string,
    change: { conversationId?: string | null; source?: SourceSelection },
  ) {
    await this.database.whatsappThread.upsert({
      where: { personId },
      create: { personId, ...change },
      update: { ...change, updatedAt: new Date() },
    });
  }

  /** Turns submitted for a Person since a moment (usage limits). */
  async turnsSince(personId: string, since: Date): Promise<number> {
    return this.database.whatsappInboundMessage.count({
      where: { personId, turnId: { not: null }, receivedAt: { gte: since } },
    });
  }

  /** Turns submitted for everyone since a moment (daily cost ceiling). */
  async allTurnsSince(since: Date): Promise<number> {
    return this.database.whatsappInboundMessage.count({
      where: { turnId: { not: null }, receivedAt: { gte: since } },
    });
  }

  /** Whether a Person already received a notice for this outcome recently. */
  async outcomeSince(
    personId: string,
    outcome: string,
    since: Date,
  ): Promise<boolean> {
    return (
      (await this.database.whatsappInboundMessage.count({
        where: { personId, outcome, receivedAt: { gte: since } },
      })) > 0
    );
  }

  /**
   * Removes finished work older than `before` (with its replies). Unfinished
   * work is kept until it ends.
   */
  async prune(before: Date): Promise<number> {
    const removed = await this.database.whatsappInboundMessage.deleteMany({
      where: {
        receivedAt: { lt: before },
        state: { in: ["completed", "ignored", "failed"] },
        replies: { none: { state: { in: ["pending", "sending"] } } },
      },
    });
    return removed.count;
  }
}
