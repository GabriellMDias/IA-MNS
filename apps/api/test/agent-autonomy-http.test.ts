import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import pino from "pino";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import { CorporateAgent } from "../src/features/agent/application.js";
import { AgentRepository } from "../src/features/agent/prisma-repository.js";
import { createAgentModule } from "../src/features/agent/module.js";
import type { AgentCapability } from "../src/features/agent/capabilities.js";
import type { ConversationModel } from "../src/ai/conversation.js";

it("enforces HTTP derived-reply revocation, attachment contracts and metadata-only nested tracing", async () => {
  await withMigratedDatabase(async (url) => {
    const database = createDatabase(url);
    const repository = new AgentRepository(database);
    const invocation = {
      provider: "synthetic",
      model: "scripted",
      latencyMs: 0,
      inputTokens: 1,
      outputTokens: 1,
    };
    const model: ConversationModel = {
      provider: "synthetic",
      model: "scripted",
      invoke: () =>
        Promise.resolve({
          kind: "tool_calls",
          calls: [
            {
              id: "call",
              name: "execute_capability",
              arguments: { capabilityId: "sales" },
            },
          ],
          continuation: {},
          invocation,
        }),
    };
    const cap: AgentCapability = {
      id: "sales",
      permission: "sales:read",
      title: "Sales",
      description: "Synthetic",
      examples: [],
      close: () => Promise.resolve(),
      execute: (input) => {
        input.trace.content("nested", {
          confidential: "synthetic-confidential-marker",
        });
        return Promise.resolve({
          reply: {
            kind: "clarification",
            message: "Qual período?",
            capabilityId: "sales",
            result: null,
            suggestions: [],
          },
          context: null,
          awaiting: ["period"],
        });
      },
    };
    const agent = new CorporateAgent(repository, undefined, [cap], {
      conversation: model,
      traceLevel: "content",
    });
    let permissions = new Set(["sales:read"]);
    const module = createAgentModule(() => [], agent).activate({
      config: parseServerConfig({ ORION_ENV: "test" }),
      verifier: {
        verify: (authorization) =>
          Promise.resolve(
            authorization === "Bearer alice"
              ? { id: "alice", scopes: permissions }
              : authorization === "Bearer bob"
                ? { id: "bob", scopes: permissions }
                : null,
          ),
      },
    });
    const { app } = createApp(pino({ level: "silent" }), undefined, {
      modules: [module],
    });
    const headers = { authorization: "Bearer alice" };
    try {
      const chat = await repository.create("alice");
      const requestId = randomUUID();
      const claimed = await repository.claim(
        "alice",
        chat.id,
        requestId,
        "Summarize",
        "sankhya",
      );
      await repository.finish("alice", chat.id, claimed.turn.id, {
        reply: {
          kind: "conversation",
          capabilityId: null,
          message: "Restricted derived prose",
          result: null,
          suggestions: [],
          requiredPermissions: ["sales:read"],
        },
        contexts: {},
      });
      const path = `/agent/conversations/${chat.id}`;
      expect(
        (await app.inject({ method: "GET", url: path, headers })).statusCode,
      ).toBe(200);
      permissions = new Set();
      const denied = await app.inject({ method: "GET", url: path, headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain("Restricted derived prose");
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${path}/turns`,
            headers,
            payload: { requestId, message: "Summarize", source: "sankhya" },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "GET",
            url: path,
            headers: { authorization: "Bearer bob" },
          })
        ).statusCode,
      ).toBe(404);
      const upload = {
        id: randomUUID(),
        name: "note.txt",
        mediaType: "text/plain",
        purpose: "Explain the note",
        source: "sankhya",
        contentBase64: Buffer.from("Synthetic note").toString("base64"),
        classification: "business_operational",
        containsRestrictedData: false,
      };
      for (const payload of [
        { ...upload, containsRestrictedData: true },
        { ...upload, containsRestrictedData: "false" },
        { ...upload, extra: "forbidden" },
      ]) {
        expect(
          (
            await app.inject({
              method: "POST",
              url: `${path}/attachments`,
              headers,
              payload,
            })
          ).statusCode,
        ).toBe(400);
      }
      expect(
        (
          await app.inject({
            method: "POST",
            url: `${path}/attachments`,
            headers: { authorization: "Bearer bob" },
            payload: upload,
          })
        ).statusCode,
      ).toBe(404);
      const attached = await app.inject({
        method: "POST",
        url: `${path}/attachments`,
        headers,
        payload: upload,
      });
      expect(attached.statusCode).toBe(200);
      expect(attached.headers["cache-control"]).toBe("no-store");
      expect(attached.body).not.toContain(upload.contentBase64);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `${path}/preferences`,
            headers,
            payload: {
              language: "en",
              detail: "concise",
              format: "prose",
              source: "vrmaster",
            },
          })
        ).statusCode,
      ).toBe(409);
      permissions = new Set(["sales:read"]);
      const observe = vi.fn();
      await agent.submit(
        { id: "alice", permissions },
        chat.id,
        randomUUID(),
        "Read sales",
        "sankhya",
        () => "INTERNAL_ERROR",
        observe,
      );
      await expect
        .poll(
          async () =>
            (await repository.detail("alice", chat.id)).turns.at(-1)?.state,
          { timeout: 10000 },
        )
        .toBe("completed");
      expect(observe.mock.calls[0][0]).toMatchObject({ level: "metadata" });
      expect(JSON.stringify(observe.mock.calls)).not.toContain(
        "synthetic-confidential-marker",
      );
      expect(await database.agentTurnTrace.count()).toBe(0);
    } finally {
      await app.close();
      await agent.close();
      await database.$disconnect();
    }
  });
}, 120000);
