import { randomUUID } from "node:crypto";
import { Value } from "typebox/value";
import type { Database } from "../../database.js";
import { Prisma, type AgentTurn } from "../../generated/prisma/client.js";
import { AgentFailure } from "./errors.js";
import {
  storedReplySchema,
  turnSchema,
  type TurnView,
  type ConversationScope,
  type ConversationPatch,
} from "./contracts.js";
import type { AgentReply, ProgressStage } from "./capabilities.js";
import { progressMessages } from "./capabilities.js";
type Json = Prisma.InputJsonValue;
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
function view(turn: AgentTurn): TurnView {
  let reply: TurnView["reply"] = null;
  if (turn.reply !== null) {
    if (!Value.Check(storedReplySchema, turn.reply))
      throw new Error("Unsupported stored agent reply");
    reply = turn.reply.payload;
  }
  const result = {
    id: turn.id,
    requestId: turn.requestId,
    sequence: turn.sequence,
    question: turn.question,
    state: turn.state,
    reply,
    events: turn.events,
    failureCode: turn.failureCode,
    createdAt: turn.createdAt.toISOString(),
    finishedAt: turn.finishedAt?.toISOString() ?? null,
  };
  if (!Value.Check(turnSchema, result))
    throw new Error("Invalid persisted agent turn");
  return result;
}
const summary = (item: {
  id: string;
  title: string;
  updatedAt: Date;
  pinned: boolean;
  archived: boolean;
}) => ({
  id: item.id,
  title: item.title,
  pinned: item.pinned,
  archived: item.archived,
  updatedAt: item.updatedAt.toISOString(),
});
export class AgentRepository {
  private readonly database: Database;
  constructor(database: Database) {
    this.database = database;
  }
  async create(owner: string) {
    return summary(
      await this.database.agentConversation.create({
        data: { id: randomUUID(), owner, title: "Nova conversa" },
      }),
    );
  }
  async list(
    owner: string,
    cursor?: string,
    options: { scope?: ConversationScope; search?: string } = {},
  ) {
    const scope = options.scope ?? "active";
    const search = options.search?.trim() ?? "";
    let boundary: { at: string; id: string; pinned: boolean } | undefined;
    if (cursor) {
      try {
        const value = JSON.parse(
          Buffer.from(cursor, "base64url").toString(),
        ) as Record<string, unknown>;
        if (
          !value ||
          typeof value.at !== "string" ||
          !Number.isFinite(Date.parse(value.at)) ||
          typeof value.id !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(value.id) ||
          (value.pinned !== undefined && typeof value.pinned !== "boolean") ||
          (value.scope ?? "active") !== scope ||
          (value.search ?? "") !== search
        )
          throw new Error();
        boundary = {
          at: value.at,
          id: value.id,
          pinned: value.pinned === true,
        };
      } catch {
        throw new AgentFailure("AGENT_REQUEST_CONFLICT");
      }
    }
    const filters: Prisma.AgentConversationWhereInput[] = [{ owner }];
    if (scope === "archived") filters.push({ archived: true });
    else if (scope !== "all")
      filters.push({
        archived: false,
        ...(scope === "pinned" ? { pinned: true } : {}),
      });
    if (search) {
      const literal = search.replace(/[\\%_]/g, "\\$&");
      filters.push({
        OR: [
          { title: { contains: literal, mode: "insensitive" } },
          {
            turns: {
              some: { question: { contains: literal, mode: "insensitive" } },
            },
          },
        ],
      });
    }
    if (boundary) {
      const older = {
        OR: [
          { updatedAt: { lt: new Date(boundary.at) } },
          { updatedAt: new Date(boundary.at), id: { lt: boundary.id } },
        ],
      };
      filters.push(
        boundary.pinned
          ? { OR: [{ pinned: false }, { pinned: true, ...older }] }
          : { pinned: false, ...older },
      );
    }
    const items = await this.database.agentConversation.findMany({
      where: { AND: filters },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 31,
    });
    const page = items.slice(0, 30);
    const last = page.at(-1);
    return {
      items: page.map(summary),
      nextCursor:
        items.length > 30 && last
          ? Buffer.from(
              JSON.stringify({
                at: last.updatedAt.toISOString(),
                id: last.id,
                pinned: last.pinned,
                scope,
                search,
              }),
            ).toString("base64url")
          : null,
    };
  }
  async update(owner: string, id: string, patch: ConversationPatch) {
    return this.locked(owner, id, async (tx, item) => {
      if (item.activeTurnId) throw new AgentFailure("AGENT_CONVERSATION_BUSY");
      const title = patch.title?.trim();
      if (title !== undefined && (!title || title.length > 100))
        throw new AgentFailure("AGENT_REQUEST_CONFLICT");
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      return summary(
        await tx.agentConversation.update({
          where: { id },
          data: {
            ...patch,
            ...(title !== undefined ? { title, titleManual: true } : {}),
            updatedAt: now,
          },
        }),
      );
    });
  }
  private async locked<T>(
    owner: string,
    id: string,
    work: (
      tx: Prisma.TransactionClient,
      item: Awaited<
        ReturnType<Database["agentConversation"]["findUniqueOrThrow"]>
      >,
    ) => Promise<T>,
  ) {
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM agent_conversations WHERE id = ${id}::uuid AND owner = ${owner} FOR UPDATE`;
      if (!rows.length) throw new AgentFailure("AGENT_CONVERSATION_NOT_FOUND");
      let item = await tx.agentConversation.findUniqueOrThrow({
        where: { id },
      });
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (item.activeTurnId && item.leaseUntil && item.leaseUntil <= now) {
        await tx.agentTurn.updateMany({
          where: { id: item.activeTurnId, state: "running" },
          data: {
            state: "interrupted",
            failureCode: "AGENT_EXECUTION_INTERRUPTED",
            finishedAt: now,
          },
        });
        item = await tx.agentConversation.update({
          where: { id },
          data: { activeTurnId: null, leaseUntil: null },
        });
      }
      return work(tx, item);
    });
  }
  async detail(owner: string, id: string, beforeSequence?: number) {
    return this.locked(owner, id, async (tx, item) => {
      const rows = await tx.agentTurn.findMany({
        where: {
          conversationId: id,
          ...(beforeSequence ? { sequence: { lt: beforeSequence } } : {}),
        },
        orderBy: { sequence: "desc" },
        take: 41,
      });
      const page = rows.slice(0, 40).reverse();
      return {
        conversation: summary(item),
        turns: page.map(view),
        olderThan: rows.length > 40 ? page[0].sequence : null,
      };
    });
  }
  async remove(owner: string, id: string) {
    await this.locked(owner, id, async (tx, item) => {
      if (item.activeTurnId) throw new AgentFailure("AGENT_CONVERSATION_BUSY");
      await tx.agentConversation.delete({ where: { id } });
    });
  }
  async claim(owner: string, id: string, requestId: string, question: string) {
    return this.locked(owner, id, async (tx, item) => {
      const prior = await tx.agentTurn.findUnique({
        where: { conversationId_requestId: { conversationId: id, requestId } },
      });
      if (prior) {
        if (prior.question !== question)
          throw new AgentFailure("AGENT_REQUEST_CONFLICT");
        return {
          fresh: false,
          turn: view(prior),
          contexts: item.contexts,
          history: [] as TurnView[],
        };
      }
      if (item.activeTurnId) throw new AgentFailure("AGENT_CONVERSATION_BUSY");
      if (item.archived) throw new AgentFailure("AGENT_CONVERSATION_ARCHIVED");
      const turnId = randomUUID();
      const [{ now, until }] = await tx.$queryRaw<
        { now: Date; until: Date }[]
      >`SELECT clock_timestamp() AS now, clock_timestamp() + interval '120 seconds' AS until`;
      const turn = await tx.agentTurn.create({
        data: {
          id: turnId,
          conversationId: id,
          requestId,
          sequence: item.version + 1,
          state: "running",
          question,
        },
      });
      await tx.agentConversation.update({
        where: { id },
        data: {
          version: { increment: 1 },
          activeTurnId: turnId,
          leaseUntil: until,
          updatedAt: now,
          ...(item.version === 0 && !item.titleManual
            ? { title: question.replace(/\s+/g, " ").slice(0, 100) }
            : {}),
        },
      });
      const history = await tx.agentTurn.findMany({
        where: { conversationId: id, state: "completed" },
        orderBy: { sequence: "desc" },
        take: 12,
      });
      return {
        fresh: true,
        turn: view(turn),
        contexts: item.contexts,
        history: history.reverse().map(view),
      };
    });
  }
  async progress(turnId: string, stage: ProgressStage) {
    const turn = await this.database.agentTurn.findUniqueOrThrow({
      where: { id: turnId },
    });
    const events = view(turn).events;
    if (turn.state !== "running" || events.length >= 20)
      throw new AgentFailure("AGENT_CONVERSATION_BUSY");
    const updated = await this.database.agentTurn.updateMany({
      where: { id: turnId, state: "running" },
      data: {
        events: json([
          ...events,
          {
            stage,
            message: progressMessages[stage],
            at: new Date().toISOString(),
          },
        ]),
      },
    });
    if (updated.count !== 1) throw new AgentFailure("AGENT_CONVERSATION_BUSY");
  }
  async finish(
    owner: string,
    id: string,
    turnId: string,
    outcome: { reply: AgentReply; contexts: unknown } | { failureCode: string },
  ) {
    await this.locked(owner, id, async (tx, item) => {
      if (item.activeTurnId !== turnId)
        throw new AgentFailure("AGENT_CONVERSATION_BUSY");
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      if (
        "reply" in outcome &&
        !Value.Check(storedReplySchema, { version: 1, payload: outcome.reply })
      )
        throw new Error("Invalid agent capability output");
      await tx.agentTurn.update({
        where: { id: turnId },
        data: {
          finishedAt: now,
          ...("reply" in outcome
            ? {
                state: "completed",
                reply: json({ version: 1, payload: outcome.reply }),
                capabilityId: outcome.reply.capabilityId,
              }
            : { state: "failed", failureCode: outcome.failureCode }),
        },
      });
      await tx.agentConversation.update({
        where: { id },
        data: {
          activeTurnId: null,
          leaseUntil: null,
          updatedAt: now,
          ...("reply" in outcome ? { contexts: json(outcome.contexts) } : {}),
        },
      });
    });
  }
}
