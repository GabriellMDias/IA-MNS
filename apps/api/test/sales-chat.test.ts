import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { Writable } from "node:stream";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import { SalesChat } from "../src/features/sales/application.js";
import { Conversations } from "../src/features/sales/conversations.js";
import { emptySalesState } from "../src/features/sales/conversation-state.js";
import { createSalesModule } from "../src/features/sales/module.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { SalesReader } from "../src/features/sales/oracle.js";
import type { AccessTokenVerifier } from "../src/authentication.js";
import { interpretation } from "../evals/fixtures.js";

// Today is 2026-10-01 in Sao Paulo: the last three completed months are July
// to September. No product filter, so any message grounds this reading.
const lastThreeMonths = interpretation({
  measure: "net_value",
  period: { kind: "last", unit: "month", count: 3, includeCurrent: false },
  groupBy: "month",
});
function fixture() {
  const interpreter: SalesInterpreter = {
    interpret: vi.fn(() => Promise.resolve(lastThreeMonths)),
  };
  const reader: SalesReader = {
    read: vi.fn(() =>
      Promise.resolve({
        current: {
          rows: [
            { period: "2026-07", product: null, unit: "BRL", value: "250.75" },
          ],
          products: [{ code: "1", description: "MAÇÃ GALA" }],
          missingWeight: false,
        },
        previous: null,
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
  };
  const chat = new SalesChat(
    interpreter,
    reader,
    new Conversations(),
    () => new Date("2026-10-01T15:00:00Z"),
  );
  return { interpreter, reader, chat };
}
const signal = () => new AbortController().signal;
const actor = (id: string) => ({ id, canReadSales: true });
describe("trusted conversation context", () => {
  it("enforces the capability before provider work at the application boundary", async () => {
    const { chat, interpreter, reader } = fixture();
    const denied = { id: "alice", canReadSales: false };
    try {
      await expect(
        chat.ask(denied, "Quanto vendi?", undefined, signal()),
      ).rejects.toThrow("SALES_ACCESS_DENIED");
      expect(() => chat.forget(denied, "missing")).toThrow(
        "SALES_ACCESS_DENIED",
      );
      expect(interpreter.interpret).not.toHaveBeenCalled();
      expect(reader.read).not.toHaveBeenCalled();
    } finally {
      await chat.close();
    }
  });
  it("uses the last executed plan, isolates actors and rejects concurrent turns", async () => {
    const { chat, interpreter, reader } = fixture();
    try {
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({
          measure: "net_value",
          filters: { product: "maçã" },
          period: { kind: "last", unit: "month", count: 3 },
          groupBy: "month",
        }),
      );
      const first = await chat.ask(
        actor("alice"),
        "Quanto vendi de maçã?",
        undefined,
        signal(),
      );
      expect(first.result?.query).toMatchObject({
        productSearch: "maçã",
        startDate: "2026-07-01",
        endDate: "2026-09-30",
      });
      await expect(
        chat.ask(
          actor("bob"),
          "E no ano passado?",
          first.conversationId,
          signal(),
        ),
      ).rejects.toThrow("SALES_CONVERSATION_EXPIRED");
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({ relation: "refine", comparison: "previous_year" }),
      );
      const compared = await chat.ask(
        actor("alice"),
        "E comparado ao ano passado?",
        first.conversationId,
        signal(),
      );
      const input = vi.mocked(interpreter.interpret).mock.calls[1][0];
      expect(input.state.active?.query).toEqual(first.result!.query);
      expect(input.state.transcript.map((item) => item.user)).toEqual([
        "Quanto vendi de maçã?",
      ]);
      // The refinement retains the product, period and grouping it does not change.
      expect(vi.mocked(reader.read).mock.calls[1][0]).toEqual({
        ...first.result!.query,
        comparison: "previous_year",
      });
      expect(compared.kind).toBe("answer");
      const locked = chat.conversations.acquire("alice", first.conversationId);
      await expect(
        chat.ask(
          actor("alice"),
          "Outra pergunta",
          first.conversationId,
          signal(),
        ),
      ).rejects.toThrow("SALES_CONVERSATION_BUSY");
      chat.conversations.release(locked);
    } finally {
      await chat.close();
    }
  });
  it("asks for a missing period without querying and preserves state after provider failure", async () => {
    const { chat, interpreter, reader } = fixture();
    try {
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({ measure: "net_value" }),
      );
      const reply = await chat.ask(
        actor("alice"),
        "Quanto vendi?",
        undefined,
        signal(),
      );
      expect(reply.kind).toBe("clarification");
      expect(reply.message).toBe("Qual período você quer consultar?");
      expect(reader.read).not.toHaveBeenCalled();
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({
          relation: "answer_pending",
          period: { kind: "month", month: 7 },
        }),
      );
      vi.mocked(reader.read).mockRejectedValueOnce(
        new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
      );
      await expect(
        chat.ask(actor("alice"), "Julho", reply.conversationId, signal()),
      ).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
      const recovered = await chat.ask(
        actor("alice"),
        "Últimos três meses",
        reply.conversationId,
        signal(),
      );
      expect(recovered.kind).toBe("answer");
      const retained = vi.mocked(interpreter.interpret).mock.calls[2][0].state;
      expect(retained.transcript).toEqual([
        {
          user: "Quanto vendi?",
          reply: "clarification",
          text: "Qual período você quer consultar?",
        },
      ]);
      expect(retained.pending).toMatchObject({
        awaiting: ["period"],
        clarification: "period",
        draft: { measure: "net_value", period: null },
      });
      expect(recovered.message).toContain("250,75");
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({
          decision: "unsupported",
          unsupportedReason: "operation",
        }),
      );
      expect(
        (
          await chat.ask(
            actor("alice"),
            "Altere estoque",
            reply.conversationId,
            signal(),
          )
        ).kind,
      ).toBe("unsupported");
      expect(reader.read).toHaveBeenCalledTimes(2);
    } finally {
      await chat.close();
    }
  });
  it("completes the pending request when the next message only supplies the period", async () => {
    const { chat, interpreter, reader } = fixture();
    try {
      vi.mocked(interpreter.interpret)
        .mockResolvedValueOnce(
          interpretation({
            measure: "net_value",
            filters: { product: "maçã" },
          }),
        )
        // The model misreads the bare period as a new request; the state
        // still recognizes it as the awaited answer.
        .mockResolvedValueOnce(
          interpretation({ period: { kind: "current", unit: "month" } }),
        );
      const question = await chat.ask(
        actor("alice"),
        "Quanto vendi de maçã?",
        undefined,
        signal(),
      );
      expect(question.message).toBe("Qual período você quer consultar?");
      const answer = await chat.ask(
        actor("alice"),
        "Este mês",
        question.conversationId,
        signal(),
      );
      expect(answer.kind).toBe("answer");
      expect(vi.mocked(reader.read).mock.calls[0][0]).toEqual({
        productSearch: "maçã",
        startDate: "2026-10-01",
        endDate: "2026-10-01",
        metric: "net_value",
        groupBy: "total",
        comparison: "none",
      });
    } finally {
      await chat.close();
    }
  });
  it("asks for the product instead of querying a filter the user never wrote", async () => {
    const { chat, interpreter, reader } = fixture();
    try {
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({
          filters: { product: "pera" },
          period: { kind: "previous", unit: "month" },
        }),
      );
      const reply = await chat.ask(
        actor("alice"),
        "Quanto vendi no mês passado?",
        undefined,
        signal(),
      );
      expect(reply.message).toBe(
        "Qual produto ou descrição você quer consultar?",
      );
      expect(reader.read).not.toHaveBeenCalled();
    } finally {
      await chat.close();
    }
  });
  it("expires idle context, caps turns and deletes owned conversations", () => {
    let now = 0;
    const store = new Conversations(() => now);
    try {
      const item = store.acquire("alice");
      store.release(item, emptySalesState);
      now = 1800000;
      expect(() => store.acquire("alice", item.id)).toThrow(
        "SALES_CONVERSATION_EXPIRED",
      );
      const current = store.acquire("alice");
      store.release(current, emptySalesState);
      expect(() => store.remove("bob", current.id)).toThrow(
        "SALES_CONVERSATION_EXPIRED",
      );
      for (let i = 0; i < 11; i++)
        store.release(store.acquire("alice", current.id), emptySalesState);
      expect(() => store.acquire("alice", current.id)).toThrow(
        "SALES_CONVERSATION_EXPIRED",
      );
      store.remove("alice", current.id);
      expect(() => store.acquire("alice", current.id)).toThrow();
    } finally {
      store.close();
    }
  });
  it("asks for context only when no analysis exists to refine", async () => {
    const { chat, interpreter, reader } = fixture();
    try {
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({ relation: "refine", comparison: "previous_year" }),
      );
      const empty = await chat.ask(
        actor("alice"),
        "E naquele período?",
        undefined,
        signal(),
      );
      expect(empty.message).toContain("não há uma consulta anterior");
      expect(reader.read).not.toHaveBeenCalled();
      const first = await chat.ask(
        actor("alice"),
        "Vendas dos últimos três meses",
        empty.conversationId,
        signal(),
      );
      vi.mocked(interpreter.interpret).mockResolvedValueOnce(
        interpretation({ relation: "refine", groupBy: "product" }),
      );
      const refined = await chat.ask(
        actor("alice"),
        "Quais produtos?",
        first.conversationId,
        signal(),
      );
      expect(refined.kind).toBe("answer");
      expect(refined.message).not.toContain("não há uma consulta anterior");
      expect(vi.mocked(reader.read).mock.calls[1][0]).toMatchObject({
        startDate: "2026-07-01",
        groupBy: "product",
      });
    } finally {
      await chat.close();
    }
  });
});
describe("sales HTTP authorization and errors", () => {
  async function api(
    local = false,
    verifier?: AccessTokenVerifier,
    logger = pino({ level: "silent" }),
  ) {
    const f = fixture();
    const registered = createSalesModule(f.chat).activate({
      config: parseServerConfig({
        ORION_ENV: "test",
        IA_MNS_LOCAL_ACCESS: String(local),
      }),
      verifier,
    });
    const { app } = createApp(logger, undefined, {
      modules: [registered],
    });
    await app.ready();
    return { ...f, app };
  }
  it("logs the provider and stage with safe diagnostics while keeping them out of the public envelope", async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: "error" },
      new Writable({
        write(chunk, _encoding, callback) {
          lines.push(String(chunk));
          callback();
        },
      }),
    );
    const { app, reader } = await api(true, undefined, logger);
    vi.mocked(reader.read).mockRejectedValueOnce(
      new SalesFailure(
        "SALES_PROVIDER_UNAVAILABLE",
        Object.assign(new Error("synthetic-password connect-descriptor"), {
          code: "NJS-116",
        }),
        { provider: "oracle", stage: "connection" },
      ),
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: "/sales/chat",
        headers: { host: "127.0.0.1", "x-ia-mns-client": "web" },
        payload: { message: "synthetic-private-question" },
      });
      const body = response.json<{ error: { errorId: string } }>();
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(lines[0])).toMatchObject({
        errorId: body.error.errorId,
        provider: "oracle",
        stage: "connection",
        diagnostic: { causes: [{ code: "NJS-116" }] },
      });
      for (const secret of [
        "synthetic-password",
        "connect-descriptor",
        "synthetic-private-question",
      ])
        expect(lines.join("")).not.toContain(secret);
      expect(body.error).not.toHaveProperty("provider");
      expect(body.error).not.toHaveProperty("stage");
      expect(response.body).not.toContain("NJS-116");
    } finally {
      await app.close();
    }
  });
  it("allows a sales response beyond the foundation socket inactivity timeout", async () => {
    const { app, reader } = await api(true);
    const original = vi.mocked(reader.read).getMockImplementation()!;
    vi.mocked(reader.read).mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return original(...args);
    });
    app.server.setTimeout(50);
    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const response = await fetch(`${address}/sales/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ia-mns-client": "web",
        },
        body: JSON.stringify({ message: "Quanto vendi?" }),
        signal: AbortSignal.timeout(3000),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ kind: "answer" });
    } finally {
      await app.close();
    }
  });
  it("denies anonymous/insufficient scopes and enforces ownership on reads and deletion", async () => {
    const verifier: AccessTokenVerifier = {
      verify: (authorization) =>
        Promise.resolve(
          authorization === "Bearer alice"
            ? { id: "alice", scopes: new Set(["sales:read"]) }
            : authorization === "Bearer bob"
              ? { id: "bob", scopes: new Set(["sales:read"]) }
              : authorization === "Bearer denied"
                ? { id: "denied", scopes: new Set() }
                : null,
        ),
    };
    const { app, reader } = await api(false, verifier);
    try {
      const request = {
        method: "POST" as const,
        url: "/sales/chat",
        payload: { message: "Quanto vendi?" },
      };
      expect((await app.inject(request)).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            ...request,
            headers: { authorization: "Bearer denied" },
          })
        ).statusCode,
      ).toBe(403);
      expect(reader.read).not.toHaveBeenCalled();
      const response = await app.inject({
        ...request,
        headers: { authorization: "Bearer alice" },
      });
      const body = response.json<{
        conversationId: string;
        result: { query: unknown };
      }>();
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(body.result.query).not.toHaveProperty("action");
      expect(
        (
          await app.inject({
            ...request,
            payload: {
              message: "E ontem?",
              conversationId: body.conversationId,
            },
            headers: { authorization: "Bearer bob" },
          })
        ).statusCode,
      ).toBe(410);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/sales/conversations/${body.conversationId}`,
            headers: { authorization: "Bearer bob" },
          })
        ).statusCode,
      ).toBe(410);
      expect(
        (
          await app.inject({
            method: "DELETE",
            url: `/sales/conversations/${body.conversationId}`,
            headers: { authorization: "Bearer alice" },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
  it("accepts only deliberate loopback access and rejects invalid bodies before provider calls", async () => {
    const { app, interpreter } = await api(true);
    try {
      const request = {
        method: "POST" as const,
        url: "/sales/chat",
        payload: { message: "Quanto vendi?" },
        headers: { "x-ia-mns-client": "web", host: "127.0.0.1" },
      };
      expect(
        (await app.inject({ ...request, remoteAddress: "192.0.2.1" }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            ...request,
            headers: { ...request.headers, origin: "https://attacker.example" },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            ...request,
            headers: { ...request.headers, host: "attacker.example" },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            ...request,
            payload: { message: "x".repeat(2001) },
          })
        ).statusCode,
      ).toBe(400);
      expect(interpreter.interpret).not.toHaveBeenCalled();
      expect((await app.inject(request)).statusCode).toBe(200);
      for (let i = 0; i < 14; i++) await app.inject(request);
      const limited = await app.inject(request);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBeDefined();
    } finally {
      await app.close();
    }
  });
  it("publishes safe unconfigured status and fails closed in production", async () => {
    const module = createSalesModule();
    expect(() => module.activate({})).toThrow("requires runtime configuration");
    expect(() =>
      module.activate({
        config: parseServerConfig({ ORION_ENV: "production" }),
      }),
    ).toThrow("sales requires");
    const { app } = createApp(pino({ level: "silent" }), undefined, {
      modules: [
        module.activate({
          config: parseServerConfig({
            ORION_ENV: "test",
            IA_MNS_LOCAL_ACCESS: "true",
          }),
        }),
      ],
    });
    try {
      expect((await app.inject("/sales/status")).json()).toEqual({
        configured: false,
        accessMode: "local",
      });
      const response = await app.inject({
        method: "POST",
        url: "/sales/chat",
        headers: { host: "127.0.0.1", "x-ia-mns-client": "web" },
        payload: { message: "Quanto vendi?" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json<{ error: { code: string } }>().error.code).toBe(
        "SALES_NOT_CONFIGURED",
      );
    } finally {
      await app.close();
    }
  });
});
