import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import pino from "pino";
import { WhatsappChannel } from "../src/features/whatsapp/channel.js";
import type { WhatsappRepository } from "../src/features/whatsapp/repository.js";
import { parseServerConfig } from "../src/config.js";
import {
  displayWhatsappNumber,
  normalizeWhatsappNumber,
  whatsappSuffix,
} from "../src/features/identity/whatsapp.js";
import {
  readNotification,
  validSignature,
} from "../src/features/whatsapp/webhook.js";
import { parseCommand } from "../src/features/whatsapp/commands.js";
import {
  maxParts,
  partLimit,
  splitText,
  turnText,
} from "../src/features/whatsapp/format.js";
import { GraphClient } from "../src/features/whatsapp/graph.js";
import type { TurnView } from "../src/features/agent/contracts.js";
import { signingKey } from "./identity-helpers.js";

it("retains only live idle callbacks and clears them on shutdown", async () => {
  vi.useFakeTimers();
  const repository = {
    claimInbound: () => Promise.resolve(null),
    expireSending: () => Promise.resolve(0),
    claimOutbound: () => Promise.resolve(null),
  } as unknown as WhatsappRepository;
  const channel = new WhatsappChannel({
    repository,
    graph: new GraphClient({
      baseUrl: "http://127.0.0.1:9",
      version: "v25.0",
      phoneNumberId: "100000000001",
      accessToken: "synthetic",
    }),
    identity: {
      authorize: () =>
        Promise.resolve({ authorized: false, reason: "unknown" }),
      confirm: async () => {},
    },
    agent: undefined,
    enabled: () => Promise.resolve(false),
    dailyLimit: 500,
    idleMs: 10,
    log: pino({ level: "silent" }),
  });
  try {
    channel.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let cycle = 0; cycle < 100; cycle++) {
      await vi.advanceTimersByTimeAsync(10);
      expect(channel["wakeUp"]).toHaveLength(3);
    }
    await channel.close();
    expect(channel["wakeUp"]).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await channel.close();
    vi.useRealTimers();
  }
});

describe("WhatsApp number normalization", () => {
  it("stores E.164 digits and a deterministic legacy alias only for Brazilian mobiles", () => {
    expect(normalizeWhatsappNumber("+55 (11) 98765-4321")).toEqual({
      ok: true,
      value: {
        digits: "5511987654321",
        display: "+55 11 98765-4321",
        legacyIdentifier: "551187654321",
      },
    });
    expect(normalizeWhatsappNumber("0055 21 99876 5432")).toMatchObject({
      ok: true,
      value: { digits: "5521998765432", legacyIdentifier: "552198765432" },
    });
    // A legacy form starting with 2-5 would look like a landline: no alias.
    expect(normalizeWhatsappNumber("+55 11 95123-4567")).toMatchObject({
      ok: true,
      value: { digits: "5511951234567", legacyIdentifier: null },
    });
    // Landlines have no ninth digit and no alias.
    expect(normalizeWhatsappNumber("+55 11 3456-7890")).toEqual({
      ok: true,
      value: {
        digits: "551134567890",
        display: "+55 11 3456-7890",
        legacyIdentifier: null,
      },
    });
    expect(normalizeWhatsappNumber("+1 650 555 1234")).toEqual({
      ok: true,
      value: {
        digits: "16505551234",
        display: "+16505551234",
        legacyIdentifier: null,
      },
    });
  });

  it("refuses national, malformed and ninth-digit-less mobile numbers instead of guessing", () => {
    for (const value of [
      "11987654321",
      "5511987654321",
      "+55 11 987",
      "+0 11 98765 4321",
      "+55 01 98765-4321",
      "+55 11 90765-4321",
      "+55 11 1234-5678",
      "tel:+5511987654321",
      "",
    ])
      expect(normalizeWhatsappNumber(value), value).toEqual({
        ok: false,
        problem: "format",
      });
    expect(normalizeWhatsappNumber("+55 11 8765-4321")).toEqual({
      ok: false,
      problem: "missing_ninth_digit",
    });
    expect(displayWhatsappNumber("5511987654321")).toBe("+55 11 98765-4321");
    expect(whatsappSuffix("5511987654321")).toBe("4321");
  });
});

describe("webhook authenticity and payload", () => {
  const secret = "a1".repeat(16);
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const sign = (value: Buffer, key = secret) =>
    `sha256=${createHmac("sha256", key).update(value).digest("hex")}`;

  it("accepts only the HMAC-SHA256 of the exact bytes with the app secret", () => {
    expect(validSignature(body, sign(body), secret)).toBe(true);
    expect(
      validSignature(
        body,
        sign(body).toUpperCase().replace("SHA256", "sha256"),
        secret,
      ),
    ).toBe(true);
    expect(
      validSignature(Buffer.from(`${body.toString()} `), sign(body), secret),
    ).toBe(false);
    expect(validSignature(body, sign(body, "b".repeat(32)), secret)).toBe(
      false,
    );
    expect(validSignature(body, undefined, secret)).toBe(false);
    expect(validSignature(body, "sha1=abc", secret)).toBe(false);
    expect(validSignature(body, ["x"], secret)).toBe(false);
  });

  const notification = (
    value: object,
    phoneNumberId = "123456",
    entryId = "999",
  ) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: entryId,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5511999990000",
                phone_number_id: phoneNumberId,
              },
              ...value,
            },
          },
        ],
      },
    ],
  });

  it("reads messages and statuses of the configured number only", () => {
    const read = readNotification(
      notification({
        contacts: [{ wa_id: "551187654321", user_id: "BR.1234567890" }],
        messages: [
          {
            from: "551187654321",
            from_user_id: "BR.1234567890",
            id: "wamid.A",
            timestamp: "1760000000",
            type: "text",
            text: { body: "Olá" },
          },
          {
            from: "551187654321",
            id: "wamid.B",
            timestamp: "1760000001",
            type: "image",
            image: { id: "media" },
          },
          {
            from_user_id: "BR.ENT.555",
            id: "wamid.C",
            timestamp: "1760000002",
            type: "text",
            text: { body: "sem número" },
          },
          {
            from: "551187654321",
            id: "wamid.D",
            timestamp: "1760000003",
            type: "text",
            text: { body: "grupo" },
            group_id: "G1",
          },
          {
            from: "+5511",
            id: "wamid.E",
            timestamp: "1760000004",
            type: "text",
            text: { body: "inválido" },
          },
          {
            from: "551187654321",
            id: "wamid.F",
            timestamp: "agora",
            type: "text",
            text: { body: "sem hora" },
          },
        ],
        statuses: [
          {
            id: "wamid.out",
            status: "delivered",
            recipient_id: "551187654321",
          },
          {
            id: "wamid.out2",
            status: "failed",
            errors: [{ code: 131047, title: "Re-engagement" }],
          },
          { id: "wamid.out3", status: "deleted" },
        ],
      }),
      { phoneNumberId: "123456", businessAccountId: "999" },
    );
    expect(read.messages).toEqual([
      {
        messageId: "wamid.A",
        phone: "551187654321",
        userId: "BR.1234567890",
        sentAt: new Date(1760000000000),
        kind: "text",
        text: "Olá",
      },
      {
        messageId: "wamid.B",
        phone: "551187654321",
        userId: null,
        sentAt: new Date(1760000001000),
        kind: "unsupported",
        text: null,
      },
      {
        messageId: "wamid.C",
        phone: null,
        userId: "BR.ENT.555",
        sentAt: new Date(1760000002000),
        kind: "text",
        text: "sem número",
      },
    ]);
    expect(read.statuses).toEqual([
      { providerMessageId: "wamid.out", status: "delivered", errorCode: null },
      {
        providerMessageId: "wamid.out2",
        status: "failed",
        errorCode: "131047",
      },
    ]);
    expect(read.ignored).toBe(4);
    for (const foreign of [
      readNotification(
        notification(
          {
            messages: [
              {
                from: "551187654321",
                id: "x",
                timestamp: "1",
                type: "text",
                text: { body: "a" },
              },
            ],
          },
          "654321",
        ),
        { phoneNumberId: "123456" },
      ),
      readNotification(
        notification(
          {
            messages: [
              {
                from: "551187654321",
                id: "x",
                timestamp: "1",
                type: "text",
                text: { body: "a" },
              },
            ],
          },
          "123456",
          "888",
        ),
        { phoneNumberId: "123456", businessAccountId: "999" },
      ),
      readNotification(
        { object: "page", entry: [] },
        { phoneNumberId: "123456" },
      ),
      readNotification(null, { phoneNumberId: "123456" }),
    ]) {
      expect(foreign.messages).toEqual([]);
      expect(foreign.ignored).toBeGreaterThan(0);
    }
  });
});

describe("channel commands", () => {
  it("recognizes only slash commands and explicit sources", () => {
    expect(parseCommand("Quanto vendemos ontem?")).toBeNull();
    expect(parseCommand("/nova")).toEqual({ kind: "new_conversation" });
    expect(parseCommand("/Fonte VR Master")).toEqual({
      kind: "source",
      source: "vrmaster",
    });
    expect(parseCommand("/fonte sankhya")).toEqual({
      kind: "source",
      source: "sankhya",
    });
    expect(parseCommand("/fonte tudo")).toEqual({
      kind: "source",
      source: "all",
    });
    expect(parseCommand("/fonte oracle")).toEqual({
      kind: "source",
      source: null,
    });
    expect(parseCommand("/ajuda")).toEqual({ kind: "help" });
    expect(parseCommand("/apagar tudo")).toEqual({ kind: "unknown" });
  });
});

const turn = (
  reply: TurnView["reply"],
  state: TurnView["state"] = "completed",
  failureCode: string | null = null,
): TurnView => ({
  id: "00000000-0000-4000-8000-000000000001",
  requestId: "00000000-0000-4000-8000-000000000002",
  sequence: 1,
  question: "q",
  source: "all",
  state,
  reply,
  events: [],
  failureCode,
  createdAt: new Date().toISOString(),
  finishedAt: null,
});

describe("WhatsApp formatting", () => {
  it("renders sales answers per source with exact currency and never sums sources", () => {
    const text = turnText(
      turn({
        kind: "answer",
        message: "Aqui estão as vendas de setembro.",
        capabilityId: "sales",
        suggestions: [],
        result: {
          selection: "all",
          sections: [
            {
              source: "sankhya",
              status: "answered",
              reason: null,
              result: {
                query: {
                  productSearch: "maçã",
                  startDate: "2026-09-01",
                  endDate: "2026-09-30",
                  metric: "net_value",
                  groupBy: "month",
                  comparison: "previous_year",
                },
                rows: [
                  {
                    period: "2026-09",
                    product: null,
                    unit: "BRL",
                    value: "1234567.895",
                  },
                ],
                products: [],
                totals: [
                  {
                    unit: "BRL",
                    value: "1234567.895",
                    previousValue: "1000",
                    changePercent: "23.4567",
                  },
                ],
                comparison: {
                  startDate: "2025-09-01",
                  endDate: "2025-09-30",
                  rows: [],
                },
                warnings: ["Vendas confirmadas."],
              },
            },
            {
              source: "vrmaster",
              status: "unavailable",
              reason: "not_configured",
              result: null,
            },
          ],
        },
      }),
    );
    expect(text).toContain("*Fonte: MNS (Sankhya)*");
    expect(text).toContain("01/09/2026 a 30/09/2026 · maçã");
    expect(text).toContain("Valor líquido vendido: *R$ 1.234.567,90*");
    expect(text).toContain("período comparado: R$ 1.000,00 · variação 23,46%");
    expect(text).toContain("• 09/2026: R$ 1.234.567,90");
    expect(text).toContain(
      "*Fonte: Pilar da Terra (VR Master)*\nEsta fonte ainda não está configurada no IA-MNS.",
    );
    expect(text).toContain("os valores não são somados");
    expect(text).toContain("_Vendas confirmadas._");
  });

  it("renders product options, bounded product lists, failures and suggestions", () => {
    expect(
      turnText(
        turn({
          kind: "clarification",
          message: "Qual seção?",
          capabilityId: "products",
          suggestions: [],
          result: {
            kind: "product_options",
            source: "vrmaster",
            title: "seção",
            text: "frutas",
            options: [
              { number: 1, label: "FRUTAS" },
              { number: 2, label: "FRUTAS SECAS" },
            ],
          },
        }),
      ),
    ).toBe(
      "Qual seção?\n\nOpções de seção para “frutas”:\n1. FRUTAS\n2. FRUTAS SECAS\nResponda com o número ou o nome da opção.",
    );
    const products = turnText(
      turn({
        kind: "answer",
        message: "Encontrei os produtos.",
        capabilityId: "products",
        suggestions: [],
        result: {
          kind: "products",
          source: "sankhya",
          catalogVersion: "v1",
          total: 30,
          products: Array.from({ length: 30 }, (_, index) => ({
            code: String(index + 1),
            description: `PRODUTO ${index + 1}`,
            classification: "X",
          })),
          criteria: [
            {
              dimension: "group",
              title: "Grupo",
              mode: "include",
              text: "frutas",
              values: ["FRUTAS"],
              excluded: [],
              interpretation: "grupo",
            },
          ],
          sections: [{ label: "FRUTAS", count: 30 }],
          notes: [],
        },
      }),
    );
    expect(products).toContain("Primeiros 20 de 30 produtos:");
    expect(products).not.toContain("PRODUTO 21");
    expect(products).toContain("Veja a lista completa no IA-MNS.");
    expect(turnText(turn(null, "failed", "SALES_ACCESS_DENIED"))).toBe(
      "Seu acesso não permite consultar vendas.",
    );
    expect(turnText(turn(null, "interrupted", "UNKNOWN_CODE"))).toBe(
      "Não consegui concluir esta resposta. Tente novamente em instantes.",
    );
    expect(
      turnText(
        turn({
          kind: "conversation",
          message: "Olá!",
          capabilityId: null,
          result: null,
          suggestions: ["Vendas de ontem"],
        }),
      ),
    ).toBe("Olá!\n\nVocê pode perguntar, por exemplo:\n• Vendas de ontem");
    expect(
      turnText(
        turn({
          kind: "answer",
          message: "Resumo.",
          capabilityId: "analytics",
          result: {
            selection: "sankhya",
            sections: [
              {
                source: "sankhya",
                status: "answered",
                reason: null,
                result: null,
              },
            ],
          },
          suggestions: [],
          displayResult: false,
        }),
      ),
    ).toBe("Resumo.");
  });

  it("splits long text at boundaries within WhatsApp limits and points to the web beyond the last part", () => {
    const paragraph = `${"palavra ".repeat(60).trim()}\n\n`;
    const parts = splitText(paragraph.repeat(30));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(maxParts);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(4096);
      expect(part).toBe(part.trim());
    }
    expect(parts.slice(0, -1).every((part) => part.length <= partLimit)).toBe(
      true,
    );
    const huge = splitText("x".repeat(partLimit * 10));
    expect(huge).toHaveLength(maxParts);
    expect(huge.at(-1)).toContain("A resposta continua no IA-MNS");
    expect(splitText("curta")).toEqual(["curta"]);
  });
});

describe("Graph API client", () => {
  const client = (
    respond: (url: string, init: RequestInit) => Promise<Response>,
    timeoutMs?: number,
  ) => {
    const calls: {
      url: string;
      init: RequestInit;
      body: Record<string, unknown>;
    }[] = [];
    const graph = new GraphClient({
      baseUrl: "https://graph.example.test",
      version: "v25.0",
      phoneNumberId: "123456",
      accessToken: "EAAsynthetic-token-value",
      ...(timeoutMs ? { timeoutMs } : {}),
      fetcher: ((input: string, init: RequestInit) => {
        calls.push({
          url: input,
          init,
          body: JSON.parse(init.body as string) as Record<string, unknown>,
        });
        return respond(input, init);
      }) as unknown as typeof fetch,
    });
    return { graph, calls };
  };

  it("sends text to the reported number, or to the business-scoped id when there is none", async () => {
    const { graph, calls } = client(() =>
      Promise.resolve(Response.json({ messages: [{ id: "wamid.out" }] })),
    );
    await expect(
      graph.sendText({ phone: "551187654321", userId: "BR.1" }, "Olá"),
    ).resolves.toEqual({ kind: "accepted", messageId: "wamid.out" });
    await graph.sendText({ phone: null, userId: "BR.1" }, "Oi");
    expect(calls[0].url).toBe(
      "https://graph.example.test/v25.0/123456/messages",
    );
    expect(
      (calls[0].init.headers as Record<string, string>).authorization,
    ).toBe("Bearer EAAsynthetic-token-value");
    expect(calls[0].body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "551187654321",
      type: "text",
      text: { preview_url: false, body: "Olá" },
    });
    expect(calls[1].body).toMatchObject({ recipient: "BR.1" });
    expect(calls[1].body).not.toHaveProperty("to");
  });

  it("retries only when Meta proves it did not accept the message", async () => {
    const outcome = async (
      response: (init: RequestInit) => Promise<Response>,
      timeoutMs?: number,
    ) =>
      client((_url, init) => response(init), timeoutMs).graph.sendText(
        { phone: "5511987654321", userId: null },
        "x",
      );
    await expect(
      outcome(() =>
        Promise.resolve(
          Response.json({ error: { code: 130429 } }, { status: 400 }),
        ),
      ),
    ).resolves.toEqual({ kind: "retry", code: "130429", retryAfterMs: null });
    await expect(
      outcome(() =>
        Promise.resolve(
          new Response("{}", { status: 429, headers: { "retry-after": "7" } }),
        ),
      ),
    ).resolves.toEqual({ kind: "retry", code: "http_429", retryAfterMs: 7000 });
    await expect(
      outcome(() =>
        Promise.reject(
          Object.assign(new TypeError("fetch failed"), {
            cause: { code: "ECONNREFUSED" },
          }),
        ),
      ),
    ).resolves.toEqual({
      kind: "retry",
      code: "connection",
      retryAfterMs: null,
    });
    await expect(
      outcome(() =>
        Promise.resolve(
          Response.json({ error: { code: 131047 } }, { status: 400 }),
        ),
      ),
    ).resolves.toEqual({ kind: "rejected", code: "131047" });
    await expect(
      outcome(() =>
        Promise.resolve(
          Response.json({ error: { code: 190 } }, { status: 401 }),
        ),
      ),
    ).resolves.toEqual({ kind: "rejected", code: "190" });
    await expect(
      outcome(() => Promise.resolve(new Response("oops", { status: 502 }))),
    ).resolves.toEqual({ kind: "unknown", code: "http_502" });
    await expect(
      outcome(() => Promise.resolve(Response.json({ ok: true }))),
    ).resolves.toEqual({ kind: "unknown", code: "malformed_response" });
    // A timeout may follow an accepted request: never repeated.
    await expect(
      outcome(
        (init) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(init.signal!.reason as Error),
            ),
          ),
        50,
      ),
    ).resolves.toEqual({ kind: "unknown", code: "transport" });
  });

  it("marks messages as read with the typing indicator, best effort", async () => {
    const { graph, calls } = client(() =>
      Promise.resolve(Response.json({ success: true })),
    );
    await expect(graph.markRead("wamid.in")).resolves.toBe(true);
    expect(calls[0].body).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.in",
      typing_indicator: { type: "text" },
    });
    const failing = client(() => Promise.reject(new Error("down")));
    await expect(failing.graph.markRead("wamid.in")).resolves.toBe(false);
  });
});

describe("WhatsApp configuration", () => {
  const identity = {
    ORION_ENV: "test",
    ORION_DATABASE_URL: "postgresql://runtime@127.0.0.1/orion",
    IA_MNS_PUBLIC_ORIGIN: "http://localhost:5173",
    IA_MNS_IDENTITY_SIGNING_KEY: signingKey(),
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
  };
  const meta = {
    WHATSAPP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_ACCESS_TOKEN: "EAAsynthetic-token-value",
    WHATSAPP_APP_SECRET: "a".repeat(32),
    WHATSAPP_VERIFY_TOKEN: "v".repeat(32),
  };

  it("defaults to disabled and enables the module only with all four Meta values", () => {
    const off = parseServerConfig({ ORION_ENV: "test" });
    expect(off.whatsappChannel).toBe("disabled");
    expect(off.whatsappPhoneNumberId).toBeUndefined();
    const on = parseServerConfig({
      ...identity,
      ...meta,
      IA_MNS_WHATSAPP_CHANNEL: "enabled",
    });
    expect(on).toMatchObject({
      whatsappChannel: "enabled",
      whatsappGraphBaseUrl: "https://graph.facebook.com",
      whatsappGraphApiVersion: "v25.0",
      whatsappDailyLimit: 500,
    });
    for (const missing of Object.keys(meta)) {
      const partial: Record<string, string> = { ...identity, ...meta };
      delete partial[missing];
      expect(() => parseServerConfig(partial), missing).toThrow(
        "incomplete WhatsApp configuration",
      );
    }
    expect(() =>
      parseServerConfig({ ORION_ENV: "test", WHATSAPP_DAILY_LIMIT: "10" }),
    ).toThrow("incomplete WhatsApp configuration");
  });

  it("requires the database and identity, HTTPS outside loopback development, and valid values", () => {
    expect(() => parseServerConfig({ ORION_ENV: "test", ...meta })).toThrow(
      "requires the database and the IA-MNS identity",
    );
    expect(() =>
      parseServerConfig({
        ...identity,
        ...meta,
        WHATSAPP_GRAPH_BASE_URL: "http://graph.example.test",
      }),
    ).toThrow("WHATSAPP_GRAPH_BASE_URL");
    expect(
      parseServerConfig({
        ...identity,
        ...meta,
        WHATSAPP_GRAPH_BASE_URL: "http://127.0.0.1:9100",
      }).whatsappGraphBaseUrl,
    ).toBe("http://127.0.0.1:9100");
    expect(() =>
      parseServerConfig({
        ...identity,
        ...meta,
        WHATSAPP_VERIFY_TOKEN: "short",
      }),
    ).toThrow("Invalid API configuration");
    expect(() =>
      parseServerConfig({
        ...identity,
        ...meta,
        IA_MNS_WHATSAPP_CHANNEL: "on",
      }),
    ).toThrow("Invalid API configuration");
    expect(() =>
      parseServerConfig({
        ...identity,
        ...meta,
        WHATSAPP_GRAPH_API_VERSION: "latest",
      }),
    ).toThrow("Invalid API configuration");
  });
});
