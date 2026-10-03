import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import pino from "pino";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import { CorporateAgent } from "../src/features/agent/application.js";
import { AgentRepository } from "../src/features/agent/prisma-repository.js";
import { createAgentModule } from "../src/features/agent/module.js";
import {
  createAgentPlanner,
  type AgentPlanner,
} from "../src/features/agent/planner.js";
import type { AgentCapability } from "../src/features/agent/capabilities.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import type { SalesPlanner } from "../src/features/sales/planner.js";
const actor = { id: "alice", permissions: new Set(["sales:read"]) };
it("persists owned conversation organization, literal search, favorite pagination and archive context", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const database = createDatabase(runtimeUrl);
    let repository = new AgentRepository(database);
    try {
      const target = await repository.create("alice");
      await repository.update("alice", target.id, {
        title: "Budget 10%_ review",
        pinned: true,
      });
      await expect(
        repository.update("bob", target.id, { archived: true }),
      ).rejects.toThrow("AGENT_CONVERSATION_NOT_FOUND");
      const requestId = randomUUID();
      const claim = await repository.claim(
        "alice",
        target.id,
        requestId,
        "Find apples",
      );
      await expect(
        repository.update("alice", target.id, { title: "Concurrent rename" }),
      ).rejects.toThrow("AGENT_CONVERSATION_BUSY");
      await repository.finish("alice", target.id, claim.turn.id, {
        reply: {
          kind: "conversation",
          message: "Hello",
          result: null,
          capabilityId: null,
          suggestions: [],
        },
        contexts: { sales: { source: "retained" } },
      });
      await repository.update("alice", target.id, { archived: true });
      repository = new AgentRepository(database);
      const detail = await repository.detail("alice", target.id);
      expect(detail.conversation).toMatchObject({
        title: "Budget 10%_ review",
        archived: true,
        pinned: true,
      });
      expect(detail.turns).toHaveLength(1);
      expect((await repository.list("alice")).items).toHaveLength(0);
      expect(
        (await repository.list("alice", undefined, { scope: "pinned" })).items,
      ).toHaveLength(0);
      expect(
        (await repository.list("alice", undefined, { scope: "archived" }))
          .items[0].id,
      ).toBe(target.id);
      const decoy = await repository.create("alice");
      await repository.update("alice", decoy.id, {
        title: "Budget 100X review",
      });
      expect(
        (
          await repository.list("alice", undefined, {
            scope: "all",
            search: "10%_",
          })
        ).items.map((item) => item.id),
      ).toEqual([target.id]);
      await repository.remove("alice", decoy.id);
      expect(
        (
          await repository.list("alice", undefined, {
            scope: "all",
            search: "APPLES",
          })
        ).items[0].id,
      ).toBe(target.id);
      expect(
        (
          await repository.list("bob", undefined, {
            scope: "all",
            search: "APPLES",
          })
        ).items,
      ).toHaveLength(0);
      await expect(
        repository.claim("alice", target.id, randomUUID(), "New"),
      ).rejects.toThrow("AGENT_CONVERSATION_ARCHIVED");
      expect(
        (await repository.claim("alice", target.id, requestId, "Find apples"))
          .fresh,
      ).toBe(false);
      await repository.update("alice", target.id, { archived: false });
      const resumed = await repository.claim(
        "alice",
        target.id,
        randomUUID(),
        "Continue",
      );
      expect(resumed.contexts).toEqual({ sales: { source: "retained" } });
      expect(resumed.history).toHaveLength(1);
      await database.agentConversation.update({
        where: { id: target.id },
        data: { activeTurnId: null, leaseUntil: null },
      });
      for (let index = 0; index < 33; index++) await repository.create("alice");
      const first = await repository.list("alice");
      expect(first.items[0].id).toBe(target.id);
      const last = await repository.list("alice", first.nextCursor!);
      expect(
        new Set([...first.items, ...last.items].map((item) => item.id)).size,
      ).toBe(34);
      await expect(
        repository.list("alice", first.nextCursor!, { scope: "archived" }),
      ).rejects.toThrow("AGENT_REQUEST_CONFLICT");
      await repository.create("bob");
      expect(
        (
          await repository.list("bob", undefined, {
            scope: "all",
            search: "10%_",
          })
        ).items,
      ).toHaveLength(0);
    } finally {
      await database.$disconnect();
    }
  });
}, 120000);
const completed = async (
  repository: AgentRepository,
  owner: string,
  id: string,
) => {
  let result = await repository.detail(owner, id);
  for (
    let i = 0;
    i < 100 && result.turns.some((turn) => turn.state === "running");
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    result = await repository.detail(owner, id);
  }
  expect(result.turns.some((turn) => turn.state === "running")).toBe(false);
  return result;
};
it("persists owned conversations, serializes concurrent turns, replays acceptance and recovers restart interruption", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const database = createDatabase(runtimeUrl);
    const repository = new AgentRepository(database);
    const planner: AgentPlanner = {
      route: vi.fn<AgentPlanner["route"]>(() =>
        Promise.resolve({ intent: "wellbeing", capabilityId: null }),
      ),
    };
    const capability: AgentCapability = {
      id: "sales",
      title: "Consultas de vendas",
      description: "Vendas no Sankhya",
      examples: ["Vendas neste mês"],
      permission: "sales:read",
      execute: vi.fn(),
      close: async () => {},
    };
    const agent = new CorporateAgent(repository, planner, [capability]);
    try {
      const conversation = await repository.create(actor.id);
      await expect(repository.detail("bob", conversation.id)).rejects.toThrow(
        "AGENT_CONVERSATION_NOT_FOUND",
      );
      await expect(repository.remove("bob", conversation.id)).rejects.toThrow(
        "AGENT_CONVERSATION_NOT_FOUND",
      );
      const requestId = randomUUID();
      await agent.submit(
        actor,
        conversation.id,
        requestId,
        "Oi, tudo bem?",
        () => "INTERNAL_ERROR",
      );
      const detail = await completed(repository, actor.id, conversation.id);
      expect(detail.turns[0].reply?.message).toContain("Tudo certo");
      expect(detail.turns[0].reply?.result).toBeNull();
      expect(detail.turns[0].events.map((event) => event.stage)).toEqual([
        "thinking",
      ]);
      expect(capability.execute).not.toHaveBeenCalled();
      await agent.submit(
        actor,
        conversation.id,
        requestId,
        "Oi, tudo bem?",
        () => "INTERNAL_ERROR",
      );
      expect(planner.route).toHaveBeenCalledOnce();
      await expect(
        agent.submit(
          actor,
          conversation.id,
          requestId,
          "Different",
          () => "INTERNAL_ERROR",
        ),
      ).rejects.toThrow("AGENT_REQUEST_CONFLICT");
      const two = await repository.create(actor.id);
      const races = await Promise.allSettled([
        repository.claim(actor.id, two.id, randomUUID(), "First"),
        repository.claim(actor.id, two.id, randomUUID(), "Second"),
      ]);
      expect(
        races.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        races.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      await expect(repository.remove(actor.id, two.id)).rejects.toThrow(
        "AGENT_CONVERSATION_BUSY",
      );
      await database.agentConversation.update({
        where: { id: two.id },
        data: { leaseUntil: new Date(0) },
      });
      expect((await repository.detail(actor.id, two.id)).turns[0].state).toBe(
        "interrupted",
      );
      expect(planner.route).toHaveBeenCalledOnce();
      await agent.close();
      await database.$disconnect();
      const freshDatabase = createDatabase(runtimeUrl);
      const freshRepository = new AgentRepository(freshDatabase);
      try {
        expect(
          (await freshRepository.detail(actor.id, conversation.id)).turns[0]
            .reply,
        ).toEqual(detail.turns[0].reply);
        expect((await freshRepository.list(actor.id)).items).toHaveLength(2);
        for (let i = 0; i < 32; i++) await freshRepository.create(actor.id);
        const firstPage = await freshRepository.list(actor.id);
        expect(firstPage.items).toHaveLength(30);
        const nextPage = await freshRepository.list(
          actor.id,
          firstPage.nextCursor!,
        );
        expect(nextPage.items).toHaveLength(4);
        expect(
          new Set(
            [...firstPage.items, ...nextPage.items].map((item) => item.id),
          ).size,
        ).toBe(34);
        expect((await freshRepository.list("bob")).items).toHaveLength(0);
        for (let i = 0; i < 43; i++) {
          const claim = await freshRepository.claim(
            actor.id,
            conversation.id,
            randomUUID(),
            `Question ${i}`,
          );
          await freshRepository.finish(
            actor.id,
            conversation.id,
            claim.turn.id,
            {
              reply: {
                kind: "conversation",
                message: "Hello",
                result: null,
                capabilityId: null,
                suggestions: [],
              },
              contexts: {},
            },
          );
        }
        const newest = await freshRepository.detail(actor.id, conversation.id);
        expect(newest.turns).toHaveLength(40);
        expect(newest.olderThan).not.toBeNull();
        const older = await freshRepository.detail(
          actor.id,
          conversation.id,
          newest.olderThan!,
        );
        expect(older.turns).toHaveLength(4);
        expect(older.turns[0].sequence).toBe(1);
        await expect(
          freshDatabase.$executeRawUnsafe(
            "CREATE TABLE forbidden_fixture (id integer)",
          ),
        ).rejects.toThrow();
        await expect(
          freshDatabase.$executeRaw`UPDATE agent_turns SET state = 'invented' WHERE conversation_id = ${conversation.id}::uuid`,
        ).rejects.toThrow();
        await freshRepository.remove(actor.id, conversation.id);
        expect(
          await freshDatabase.agentTurn.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(0);
      } finally {
        await freshDatabase.$disconnect();
      }
    } finally {
      await agent.close();
      await database.$disconnect();
    }
  });
}, 120000);
it("restores validated sales filters independently of social turns, emits real stages and preserves context after failure", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const database = createDatabase(runtimeUrl);
    const repository = new AgentRepository(database);
    const router: AgentPlanner = {
      route: vi.fn<AgentPlanner["route"]>(() =>
        Promise.resolve({ intent: "capability", capabilityId: "sales" }),
      ),
    };
    const planner: SalesPlanner = {
      plan: vi.fn<SalesPlanner["plan"]>(() =>
        Promise.resolve({
          action: "query",
          productSearch: "maçã",
          startDate: "2026-07-01",
          endDate: "2026-09-30",
          metric: "net_value",
          groupBy: "month",
          comparison: "none",
          clarification: null,
        }),
      ),
    };
    const reader = {
      read: vi.fn(() =>
        Promise.resolve({
          current: {
            rows: [
              {
                period: "2026-07",
                product: null,
                unit: "BRL",
                value: "100.10",
              },
            ],
            products: [{ code: "1", description: "MAÇÃ GALA" }],
            missingWeight: false,
          },
          previous: null,
        }),
      ),
      close: async () => {},
    };
    const config = parseServerConfig({ ORION_ENV: "test" });
    const capability = createSalesCapability(
      config,
      new SalesChat(
        planner,
        reader,
        undefined,
        () => new Date("2026-10-01T15:00:00Z"),
      ),
    );
    let agent = new CorporateAgent(repository, router, [capability]);
    try {
      const conversation = await repository.create(actor.id);
      await agent.submit(
        actor,
        conversation.id,
        randomUUID(),
        "Vendas de maçã",
        () => "INTERNAL_ERROR",
      );
      const first = await completed(repository, actor.id, conversation.id);
      expect(first.turns[0].reply?.message).toContain("100,10");
      expect(first.turns[0].events.map((event) => event.stage)).toEqual([
        "thinking",
        "interpreting_sales",
        "querying_sales",
        "organizing",
      ]);
      await agent.close();
      agent = new CorporateAgent(new AgentRepository(database), router, [
        createSalesCapability(
          config,
          new SalesChat(
            planner,
            reader,
            undefined,
            () => new Date("2026-10-01T15:00:00Z"),
          ),
        ),
      ]);
      vi.mocked(router.route).mockResolvedValueOnce({
        intent: "thanks",
        capabilityId: null,
      });
      await agent.submit(
        actor,
        conversation.id,
        randomUUID(),
        "Obrigado",
        () => "INTERNAL_ERROR",
      );
      await completed(repository, actor.id, conversation.id);
      vi.mocked(reader.read).mockRejectedValueOnce(
        new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
      );
      await agent.submit(
        actor,
        conversation.id,
        randomUUID(),
        "E no ano passado?",
        () => "SALES_PROVIDER_UNAVAILABLE",
      );
      expect(
        (await completed(repository, actor.id, conversation.id)).turns.at(-1)
          ?.state,
      ).toBe("failed");
      await agent.submit(
        actor,
        conversation.id,
        randomUUID(),
        "Detalhe produtos",
        () => "INTERNAL_ERROR",
      );
      await completed(repository, actor.id, conversation.id);
      expect(vi.mocked(planner.plan).mock.calls[2][0].previousQuery).toEqual(
        first.turns[0].reply?.result?.query,
      );
      expect(vi.mocked(planner.plan).mock.calls[2][0].questions).toEqual([
        "Vendas de maçã",
      ]);
      vi.mocked(router.route).mockResolvedValueOnce({
        intent: "unavailable",
        capabilityId: null,
      });
      await agent.submit(
        actor,
        conversation.id,
        randomUUID(),
        "Atualize o estoque",
        () => "INTERNAL_ERROR",
      );
      expect(
        (await completed(repository, actor.id, conversation.id)).turns.at(-1)
          ?.reply?.kind,
      ).toBe("unavailable");
      expect(reader.read).toHaveBeenCalledTimes(3);
      await agent.submit(
        { id: "alice", permissions: new Set() },
        conversation.id,
        randomUUID(),
        "Vendas",
        () => "AGENT_ACCESS_DENIED",
      );
      expect(
        (await completed(repository, actor.id, conversation.id)).turns.at(-1)
          ?.failureCode,
      ).toBe("AGENT_ACCESS_DENIED");
      expect(reader.read).toHaveBeenCalledTimes(3);
      const protectedModule = createAgentModule(() => [], agent).activate({
        config,
        verifier: {
          verify: (authorization) =>
            Promise.resolve(
              authorization === "Bearer alice"
                ? { id: "alice", scopes: new Set<string>() }
                : authorization === "Bearer bob"
                  ? { id: "bob", scopes: new Set(["sales:read"]) }
                  : null,
            ),
        },
      });
      const { app } = createApp(pino({ level: "silent" }), undefined, {
        modules: [protectedModule],
      });
      try {
        expect(
          (
            await app.inject({
              method: "GET",
              url: `/agent/conversations/${conversation.id}`,
              headers: { authorization: "Bearer alice" },
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: "GET",
              url: `/agent/conversations/${conversation.id}`,
              headers: { authorization: "Bearer bob" },
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await app.inject({
              method: "GET",
              url: `/agent/conversations/${conversation.id}`,
            })
          ).statusCode,
        ).toBe(401);
      } finally {
        await app.close();
      }
    } finally {
      await agent.close();
      await database.$disconnect();
    }
  });
}, 120000);
it("enforces the HTTP ownership/local boundary and redacts background failures", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const database = createDatabase(runtimeUrl);
    const repository = new AgentRepository(database);
    const planner: AgentPlanner = {
      route: () => Promise.reject(new Error("private-provider-password")),
    };
    const agent = new CorporateAgent(repository, planner, []);
    let logs = "";
    const logger = pino(
      {},
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          logs += chunk.toString();
          done();
        },
      }),
    );
    const config = parseServerConfig({
      ORION_ENV: "test",
      IA_MNS_LOCAL_ACCESS: "true",
    });
    const module = createAgentModule(() => [], agent).activate({ config });
    const { app } = createApp(logger, undefined, { modules: [module] });
    const headers = { "x-ia-mns-client": "web" };
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/agent/conversations",
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/agent/conversations",
            headers: { ...headers, origin: "https://external.example" },
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
      const created = await app.inject({
        method: "POST",
        url: "/agent/conversations",
        headers,
        payload: {},
      });
      expect(created.statusCode).toBe(201);
      expect(created.headers["cache-control"]).toBe("no-store");
      const id = created.json<{ id: string }>().id;
      const renamed = await app.inject({
        method: "PATCH",
        url: `/agent/conversations/${id}`,
        headers,
        payload: { title: "Confidential %_ title", pinned: true },
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.headers["cache-control"]).toBe("no-store");
      expect(renamed.json()).toMatchObject({
        title: "Confidential %_ title",
        pinned: true,
        archived: false,
      });
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/agent/conversations/${id}`,
            payload: { archived: true },
          })
        ).statusCode,
      ).toBe(401);
      for (const payload of [
        {},
        { title: "   " },
        { pinned: "yes" },
        { owner: "bob", archived: true },
      ]) {
        expect(
          (
            await app.inject({
              method: "PATCH",
              url: `/agent/conversations/${id}`,
              headers,
              payload,
            })
          ).statusCode,
        ).toBe(400);
      }
      const found = await app.inject({
        method: "POST",
        url: "/agent/conversations/search",
        headers,
        payload: { query: "%_" },
      });
      expect(found.statusCode).toBe(200);
      expect(found.json<{ items: { id: string }[] }>().items[0].id).toBe(id);
      expect(found.headers["cache-control"]).toBe("no-store");
      expect(logs).not.toContain("Confidential");
      const accepted = await app.inject({
        method: "POST",
        url: `/agent/conversations/${id}/turns`,
        headers,
        payload: { message: "private-user-message", requestId: randomUUID() },
      });
      expect(accepted.statusCode).toBe(202);
      const result = await completed(repository, "local-developer", id);
      expect(result.turns[0].failureCode).toBe("INTERNAL_ERROR");
      expect(result.turns[0].reply).toBeNull();
      expect(logs).toContain("agent_execution_failed");
      expect(logs).toContain("request_id");
      expect(logs).not.toContain("private-provider-password");
      expect(logs).not.toContain("private-user-message");
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/agent/conversations/${id}`,
            headers,
            payload: { archived: true },
          })
        ).statusCode,
      ).toBe(200);
      const archived = await app.inject({
        method: "POST",
        url: `/agent/conversations/${id}/turns`,
        headers,
        payload: { message: "Hello", requestId: randomUUID() },
      });
      expect(archived.statusCode).toBe(409);
      expect(archived.json<{ error: { code: string } }>().error.code).toBe(
        "AGENT_CONVERSATION_ARCHIVED",
      );
      const malformed = await app.inject({
        method: "POST",
        url: `/agent/conversations/${id}/turns`,
        headers,
        payload: {
          message: "Hello",
          requestId: "not-a-uuid",
          owner: "someone-else",
        },
      });
      expect(malformed.statusCode).toBe(400);
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 120000);
it.each([
  {
    status: "completed",
    output: [
      {
        type: "function_call",
        name: "route_agent_message",
        arguments: JSON.stringify({
          intent: "capability",
          capabilityId: "stock",
        }),
      },
    ],
  },
  {
    status: "completed",
    output: [
      {
        type: "function_call",
        name: "route_agent_message",
        arguments: JSON.stringify({
          intent: "greeting",
          capabilityId: null,
          message: "Invented number",
        }),
      },
    ],
  },
  { status: "incomplete", output: [] },
])(
  "rejects invented capabilities, model prose and incomplete routing %#",
  async (response) => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(
        createAgentPlanner(
          parseServerConfig({
            ORION_ENV: "test",
            OPENAI_API_KEY: "synthetic-key",
          }),
          [],
        ).route(
          { message: "Hello", history: [], lastCapabilityId: null },
          new AbortController().signal,
        ),
      ).rejects.toThrow("AGENT_PROVIDER_UNAVAILABLE");
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
