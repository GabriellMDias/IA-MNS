import { afterEach, describe, expect, it, vi } from "vitest";
import oracledb from "oracledb";
import { parseServerConfig } from "../src/config.js";
import { createOpenAiModel } from "../src/ai/openai.js";
import { createModelInterpreter } from "../src/features/sales/interpreter.js";
import {
  emptySalesState,
  type SalesConversationState,
} from "../src/features/sales/conversation-state.js";
import { interpretationSchema } from "../src/features/sales/interpretation.js";
import { createOracleReader } from "../src/features/sales/oracle.js";
import type { SalesQuery } from "../src/features/sales/domain.js";
import { interpretation } from "../evals/fixtures.js";

const { createPoolMock } = vi.hoisted(() => ({
  createPoolMock: vi.fn<() => Promise<oracledb.Pool>>(),
}));
vi.mock("oracledb", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof oracledb }>();
  return { default: { ...actual.default, createPool: createPoolMock } };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const query: SalesQuery = {
  productSearch: "maçã",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  metric: "net_value",
  groupBy: "month",
  comparison: "previous_year",
};
const config = parseServerConfig({
  ORION_ENV: "test",
  OPENAI_API_KEY: "synthetic-test-key",
  SANKHYA_DB_USER: "synthetic",
  SANKHYA_DB_PASSWORD: "synthetic-test-password",
  SANKHYA_DB_CONNECT_STRING: "127.0.0.1:1521/SYNTHETIC",
});
const reading = interpretation({
  measure: "net_value",
  filters: { product: "maçã" },
  period: { kind: "last", unit: "month", count: 3, includeCurrent: false },
  groupBy: "month",
});
const interpret = (
  message = "Vendas",
  state: SalesConversationState = emptySalesState,
) =>
  createModelInterpreter(createOpenAiModel(config)).interpret(
    { message, state, today: "2026-10-01" },
    new AbortController().signal,
  );
const completed = (args: unknown, name = "interpret_sales_message") =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "function_call",
          name,
          call_id: "call_synthetic",
          arguments: typeof args === "string" ? args : JSON.stringify(args),
        },
      ],
      usage: { input_tokens: 812, output_tokens: 64, total_tokens: 876 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
describe("OpenAI Responses boundary", () => {
  it("identifies OpenAI authentication failures at the interpretation boundary without retries", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              message: "synthetic-private-provider-details",
              code: "invalid_api_key",
              type: "invalid_request_error",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(interpret()).rejects.toMatchObject({
      code: "SALES_PROVIDER_UNAVAILABLE",
      boundary: { provider: "openai", stage: "interpretation" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    { decision: "clarify", clarification: "Você vendeu R$ 10.000,00." },
    { decision: "clarify", clarification: null },
    { decision: "unsupported", unsupportedReason: null },
    { decision: "analyze", clarification: "period" },
    {
      filters: [{ dimension: "customer", action: "set", text: "Cliente" }],
    },
    { filters: [{ dimension: "product", action: "set", text: null }] },
    { filters: [{ dimension: "product", action: "clear", text: "maçã" }] },
    { sql: "DELETE FROM TGFPRO" },
  ])("rejects unsafe or inconsistent interpretation %#", async (changes) => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(completed({ ...reading, ...changes })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(interpret()).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    { status: "incomplete", output: [] },
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Synthetic refusal" }],
        },
      ],
    },
    {
      status: "completed",
      output: [{ type: "function_call", name: "wrong_tool", arguments: "{}" }],
    },
    {
      status: "completed",
      output: [1, 2].map(() => ({
        type: "function_call",
        name: "interpret_sales_message",
        arguments: "{}",
      })),
    },
  ])("fails closed on unexpected provider responses %#", async (response) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );
    await expect(interpret()).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
  });
  it("uses strict one-tool interpretation, no storage/retries, and validates external output", async () => {
    const captured: Record<string, unknown>[] = [];
    const fetchMock = vi.fn((_url: unknown, options: RequestInit) => {
      if (typeof options.body !== "string")
        throw new Error("Unexpected SDK request encoding");
      captured.push(JSON.parse(options.body) as Record<string, unknown>);
      return Promise.resolve(completed(reading));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await interpret("Quanto vendi de maçã?")).toEqual(reading);
    expect(captured[0]).toMatchObject({
      store: false,
      model: "gpt-6.1-sol",
      parallel_tool_calls: false,
      tool_choice: { type: "function", name: "interpret_sales_message" },
      tools: [{ strict: true, type: "function" }],
    });
    expect(JSON.stringify(captured)).not.toContain(config.sankhyaPassword);
    expect(JSON.stringify(captured)).not.toContain(config.openaiApiKey);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "synthetic failure", type: "rate_limit_error" },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(interpret()).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("sends structured state and application-authored replies, never figures", async () => {
    const captured: { instructions: string; input: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, options: RequestInit) => {
        captured.push(
          JSON.parse(options.body as string) as (typeof captured)[number],
        );
        return Promise.resolve(completed(reading));
      }),
    );
    await interpret("Este mês", {
      version: 2,
      active: null,
      pending: {
        draft: {
          measure: "net_value",
          filters: [{ dimension: "product", text: "maçã" }],
          period: null,
          groupBy: null,
          comparison: null,
        },
        awaiting: ["period"],
        clarification: "period",
      },
      transcript: [
        {
          user: "Vendas de banana em julho",
          reply: "answer",
          text: 'measure=net_value; product="banana"; period=2026-07-01..2026-07-31; groupBy=total; comparison=none',
        },
        {
          user: "Quanto vendi de maçã?",
          reply: "clarification",
          text: "Qual período você quer consultar?",
        },
      ],
    });
    expect(captured[0].instructions).toContain('"awaiting":["period"]');
    expect(captured[0].instructions).toContain('product=\\"maçã\\"');
    expect(captured[0].input).toEqual([
      { role: "user", content: "Vendas de banana em julho" },
      {
        role: "assistant",
        content:
          '[Análise respondida: measure=net_value; product="banana"; period=2026-07-01..2026-07-31; groupBy=total; comparison=none]',
      },
      { role: "user", content: "Quanto vendi de maçã?" },
      { role: "assistant", content: "Qual período você quer consultar?" },
      { role: "user", content: "Este mês" },
    ]);
    expect(JSON.stringify(captured)).not.toContain("R$");
  });
  it("reports token usage and latency as safe invocation metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(completed(reading))),
    );
    const result = await createOpenAiModel(config, {
      model: "synthetic-model",
    }).invoke(
      {
        instructions: "Synthetic",
        messages: [{ role: "user", content: "Vendas" }],
        tool: {
          name: "interpret_sales_message",
          description: "Synthetic",
          parameters: interpretationSchema,
        },
        maxOutputTokens: 100,
      },
      new AbortController().signal,
    );
    expect(result.invocation).toMatchObject({
      provider: "openai",
      model: "synthetic-model",
      inputTokens: 812,
      outputTokens: 64,
    });
    expect(result.invocation.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
describe("Oracle bounded read-only transaction", () => {
  it("identifies a Thin authentication failure at the connection boundary", async () => {
    createPoolMock.mockRejectedValueOnce(
      Object.assign(new Error("synthetic-private-authentication-details"), {
        code: "NJS-116",
      }),
    );
    const reader = createOracleReader(config);
    try {
      await expect(
        reader.read(query, new AbortController().signal),
      ).rejects.toMatchObject({
        code: "SALES_PROVIDER_UNAVAILABLE",
        boundary: { provider: "oracle", stage: "connection" },
      });
    } finally {
      await reader.close();
    }
  });
  it("identifies a native client loading failure without connecting or leaking its path", async () => {
    vi.spyOn(oracledb, "initOracleClient").mockImplementation(() => {
      throw Object.assign(new Error("synthetic-private-client-path"), {
        code: "DPI-1047",
      });
    });
    const reader = createOracleReader({
      ...config,
      oracleClientLibDir: "synthetic-private-client-path",
    });
    const before = createPoolMock.mock.calls.length;
    try {
      await expect(
        reader.read(query, new AbortController().signal),
      ).rejects.toMatchObject({
        code: "SALES_PROVIDER_UNAVAILABLE",
        boundary: { provider: "oracle", stage: "connection" },
      });
      expect(createPoolMock.mock.calls.length).toBe(before);
    } finally {
      await reader.close();
    }
  });
  it("interrupts an active Oracle call on cancellation and rolls back before closing", async () => {
    const { connection } = driver();
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let interrupt!: (error: Error) => void;
    vi.mocked(connection.execute)
      .mockResolvedValueOnce({})
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            interrupt = reject;
            entered();
          }),
      );
    connection.break.mockImplementation(() => {
      interrupt(new Error("Synthetic canceled call"));
      return Promise.resolve();
    });
    const reader = createOracleReader(config);
    const controller = new AbortController();
    try {
      const result = reader.read(query, controller.signal);
      await waiting;
      controller.abort();
      await expect(result).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
      expect(connection.break).toHaveBeenCalledOnce();
      expect(connection.rollback).toHaveBeenCalledOnce();
      expect(connection.close).toHaveBeenCalledOnce();
    } finally {
      await reader.close();
    }
  });
  it.each([
    { rows: undefined },
    ...[
      { PERIOD: "2025-07" },
      { PERIOD: "total" },
      { UNIT: "KG" },
      { PRODUCT: "Unexpected product grouping" },
    ].map((change) => ({
      rows: [
        {
          PERIOD: "2026-07",
          PRODUCT: null,
          UNIT: "BRL",
          VALUE: "1",
          MISSING_WEIGHT: 0,
          ...change,
        },
      ],
    })),
    {
      rows: [1, 2].map(() => ({
        PERIOD: "2026-07",
        PRODUCT: null,
        UNIT: "BRL",
        VALUE: "1",
        MISSING_WEIGHT: 0,
      })),
    },
    {
      rows: [
        {
          PERIOD: "2026-07",
          PRODUCT: null,
          UNIT: "BRL",
          VALUE: "NaN",
          MISSING_WEIGHT: 0,
        },
      ],
    },
    {
      rows: [
        {
          PERIOD: "2026-13",
          PRODUCT: null,
          UNIT: "BRL",
          VALUE: "1",
          MISSING_WEIGHT: 0,
        },
      ],
    },
  ])(
    "rejects malformed aggregate responses rather than inventing empty results %#",
    async (response) => {
      const { connection } = driver();
      vi.mocked(connection.execute)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(response);
      const reader = createOracleReader(config);
      try {
        await expect(
          reader.read(query, new AbortController().signal),
        ).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.close).toHaveBeenCalledOnce();
      } finally {
        await reader.close();
      }
    },
  );
  it("rejects unexpected product metadata and cleans up", async () => {
    const { connection } = driver();
    vi.mocked(connection.execute)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ CODE: "not-an-erp-code", DESCRIPTION: null }],
      });
    const reader = createOracleReader(config);
    try {
      await expect(
        reader.read(query, new AbortController().signal),
      ).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
      expect(connection.close).toHaveBeenCalledOnce();
    } finally {
      await reader.close();
    }
  });
  it("maps rollback failures to the safe provider error and still closes the connection", async () => {
    const { connection } = driver();
    connection.rollback.mockRejectedValueOnce(
      new Error("synthetic-private-connection-error"),
    );
    const reader = createOracleReader(config);
    try {
      await expect(
        reader.read(query, new AbortController().signal),
      ).rejects.toThrow("SALES_PROVIDER_UNAVAILABLE");
      expect(connection.close).toHaveBeenCalledOnce();
    } finally {
      await reader.close();
    }
  });
  it("rejects product truncation and always closes the read transaction", async () => {
    const { connection } = driver();
    vi.mocked(connection.execute)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: Array.from({ length: 101 }, (_, index) => ({
          CODE: String(index),
          DESCRIPTION: "Synthetic product",
        })),
      });
    const reader = createOracleReader(config);
    try {
      await expect(
        reader.read(query, new AbortController().signal),
      ).rejects.toThrow("SALES_RESULT_TOO_LARGE");
      expect(connection.rollback).toHaveBeenCalledOnce();
      expect(connection.close).toHaveBeenCalledOnce();
    } finally {
      await reader.close();
    }
  });
  function driver(fail = false, large = false) {
    const execute = vi.fn((sql: string, binds?: { startDate: string }) => {
      if (sql === "SET TRANSACTION READ ONLY") return Promise.resolve({});
      if (fail)
        return Promise.reject(new Error("synthetic-password-must-not-escape"));
      if (sql.includes("AS MISSING_WEIGHT"))
        return Promise.resolve({
          rows: Array.from({ length: large ? 501 : 1 }, () => ({
            PERIOD: binds?.startDate.slice(0, 7) ?? "2026-07",
            PRODUCT: null,
            UNIT: "BRL",
            VALUE: "123.450000000",
            MISSING_WEIGHT: 0,
          })),
        });
      return Promise.resolve({
        rows: [{ CODE: "1", DESCRIPTION: "MAÇÃ GALA" }],
      });
    });
    const connection = {
      execute,
      rollback: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      break: vi.fn(() => Promise.resolve()),
      callTimeout: 0,
    };
    const pool = {
      getConnection: vi.fn(() => Promise.resolve(connection)),
      close: vi.fn(() => Promise.resolve()),
    };
    createPoolMock.mockResolvedValue(pool as unknown as oracledb.Pool);
    return { connection, pool };
  }
  it("uses the same snapshot for comparisons, binds data, rolls back and closes", async () => {
    const { connection, pool } = driver();
    const reader = createOracleReader(config);
    try {
      const result = await reader.read(query, new AbortController().signal);
      expect(result.current.rows[0].value).toBe("123.450000000");
      expect(result.previous).not.toBeNull();
      expect(connection.execute.mock.calls[0][0]).toBe(
        "SET TRANSACTION READ ONLY",
      );
      expect(connection.execute).toHaveBeenCalledTimes(5);
      const calls = vi.mocked(connection.execute).mock.calls as unknown as [
        string,
        { startDate: string; productSearch: string },
        { autoCommit: boolean },
      ][];
      expect(calls[1][1]).toMatchObject({
        startDate: "2026-07-01",
        productSearch: "MACA",
      });
      expect(calls[3][1]).toMatchObject({ startDate: "2025-07-01" });
      expect(calls[1][2].autoCommit).toBe(false);
      expect(calls[1][2]).toMatchObject({ maxRows: 501, fetchArraySize: 501 });
      expect(calls[2][2]).toMatchObject({ maxRows: 101, fetchArraySize: 101 });
      expect(connection.callTimeout).toBe(45000);
      expect(connection.rollback).toHaveBeenCalledOnce();
      expect(connection.close).toHaveBeenCalledOnce();
    } finally {
      await reader.close();
    }
    expect(pool.close).toHaveBeenCalledWith(0);
  });
  it.each([
    { fail: true, large: false, code: "SALES_PROVIDER_UNAVAILABLE" },
    { fail: false, large: true, code: "SALES_RESULT_TOO_LARGE" },
  ])(
    "does not return truncated totals and cleans up after $code",
    async ({ fail, large, code }) => {
      const { connection } = driver(fail, large);
      const reader = createOracleReader(config);
      try {
        await expect(
          reader.read(query, new AbortController().signal),
        ).rejects.toThrow(code);
        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.close).toHaveBeenCalledOnce();
      } finally {
        await reader.close();
      }
    },
  );
});
