import { describe, expect, it, vi, afterEach } from "vitest";
import { Type } from "typebox";
import { configReference, parseServerConfig } from "../src/config.js";
import {
  OperationalParameters,
  parameterKeys,
  type ParameterKey,
  type ParameterStore,
  type StoredParameter,
} from "../src/parameters.js";
import { parameterSetup } from "../src/modules.js";
import { createOpenAiModel } from "../src/ai/openai.js";

const owner = "6f1c2c43-6a8a-4d55-9d0e-1a9f9e0b8c11";
const now = new Date("2026-10-08T12:00:00Z");

/** In-memory store with the same conditional-write contract as PostgreSQL. */
function memoryStore(initial: StoredParameter[] = []) {
  const rows = new Map(initial.map((row) => [row.key, row]));
  const store: ParameterStore = {
    read: (key) => Promise.resolve(rows.get(key) ?? null),
    list: () => Promise.resolve([...rows.values()]),
    write(key, value, expectedVersion, actor, at) {
      const current = rows.get(key)?.version ?? 0;
      if (current !== expectedVersion) return Promise.resolve(null);
      rows.set(key, {
        key,
        value,
        version: current + 1,
        updatedBy: actor,
        updatedAt: at,
      });
      return Promise.resolve(current + 1);
    },
  };
  return { store, rows };
}

const stored = (key: ParameterKey, value: unknown): StoredParameter => ({
  key,
  value,
  version: 1,
  updatedBy: owner,
  updatedAt: now,
});

function parametersFor(
  env: Record<string, string> = {},
  store?: ParameterStore,
) {
  // The composition's own defaults and domains, with the store under test.
  return new OperationalParameters(
    store,
    parameterSetup(parseServerConfig({ ORION_ENV: "test", ...env })),
  );
}

const identityEnv = {
  IA_MNS_PUBLIC_ORIGIN: "https://ia.example.test",
  IA_MNS_IDENTITY_SIGNING_KEY: "a".repeat(43),
  IA_MNS_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64url"),
};

describe("operational parameter catalog", () => {
  it("defines every parameter once, each backed by a non-secret installation default", () => {
    const parameters = parametersFor();
    expect(parameters.definitions.map((item) => item.key)).toEqual(
      parameterKeys,
    );
    for (const definition of parameters.definitions) {
      const variable = configReference.find(
        (item) => item.name === definition.environment,
      );
      expect(variable, definition.environment).toMatchObject({
        role: "parameter",
        secret: false,
      });
    }
    // Every environment variable classified as a parameter default has its parameter.
    expect(
      configReference
        .filter((item) => item.role === "parameter")
        .map((item) => item.name)
        .sort(),
    ).toEqual(parameters.definitions.map((item) => item.environment).sort());
    // Secrets are never parameters, so the administration cannot read or write them.
    for (const secret of configReference.filter((item) => item.secret))
      expect(secret.role).not.toBe("parameter");
    expect(parameters.definition("OPENAI_API_KEY")).toBeUndefined();
    expect(parameters.definition("openaiApiKey")).toBeUndefined();
  });

  it("uses the product defaults when nothing is configured or saved", async () => {
    const parameters = parametersFor();
    await expect(parameters.get("ai.model")).resolves.toBe("gpt-6.1-sol");
    await expect(parameters.get("ai.traceLevel")).resolves.toBe("metadata");
    await expect(parameters.get("access.providerGrants")).resolves.toEqual([
      "sankhya:sales:read",
    ]);
    const states = await parameters.states();
    expect(states.every((item) => item.source === "default")).toBe(true);
    expect(states.every((item) => item.version === 0)).toBe(true);
  });

  it("prefers an owner value to the environment, and the environment to the product default", async () => {
    const env = {
      ...identityEnv,
      OPENAI_MODEL: "gpt-env",
      IA_MNS_AI_TRACE: "off",
      IA_MNS_PROVIDER_GRANTS: "none",
    };
    const { store, rows } = memoryStore();
    const parameters = parametersFor(env, store);
    // Environment over product default.
    await expect(parameters.get("ai.model")).resolves.toBe("gpt-env");
    await expect(parameters.get("ai.traceLevel")).resolves.toBe("off");
    await expect(parameters.get("access.providerGrants")).resolves.toEqual([]);
    // Owner value over environment.
    rows.set("ai.model", stored("ai.model", "gpt-owner"));
    rows.set("ai.traceLevel", stored("ai.traceLevel", "content"));
    rows.set(
      "access.providerGrants",
      stored("access.providerGrants", ["sankhya:sales:read"]),
    );
    await expect(parameters.get("ai.model")).resolves.toBe("gpt-owner");
    await expect(parameters.get("ai.traceLevel")).resolves.toBe("content");
    await expect(parameters.get("access.providerGrants")).resolves.toEqual([
      "sankhya:sales:read",
    ]);
    const model = (await parameters.states()).find(
      (item) => item.definition.key === "ai.model",
    )!;
    expect(model).toMatchObject({
      value: "gpt-owner",
      defaultValue: "gpt-env",
      source: "administration",
      version: 1,
      updatedBy: owner,
    });
    // A reset (null) returns to the installation default.
    rows.set("ai.model", { ...stored("ai.model", null), version: 2 });
    await expect(parameters.get("ai.model")).resolves.toBe("gpt-env");
  });

  it("validates, converts and refuses values outside each domain", () => {
    const parameters = parametersFor();
    expect(parameters.check("ai.model", "  gpt-6.2-mini  ")).toEqual({
      ok: true,
      value: "gpt-6.2-mini",
    });
    for (const invalid of ["", "gpt 6", "-gpt", "x".repeat(101), 42, null])
      expect(parameters.check("ai.model", invalid)).toEqual({
        ok: false,
        reason: "invalid",
      });
    expect(parameters.check("ai.traceLevel", "verbose")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parameters.check("ai.traceLevel", "content")).toEqual({
      ok: true,
      value: "content",
    });
    expect(
      parameters.check("access.providerGrants", [
        "sankhya:sales:read",
        "sankhya:sales:read",
      ]),
    ).toEqual({ ok: true, value: ["sankhya:sales:read"] });
    // Only catalog-eligible read grants: never a new provider or permission.
    for (const invalid of [
      ["pdt:sales:read"],
      ["sankhya:identity:admin"],
      "sankhya:sales:read",
      [1],
    ])
      expect(parameters.check("access.providerGrants", invalid)).toEqual({
        ok: false,
        reason: "invalid",
      });
  });

  it("never uses content tracing in production, whatever is stored", async () => {
    const { store, rows } = memoryStore([stored("ai.traceLevel", "content")]);
    const production = parametersFor(
      { ORION_ENV: "production", ...identityEnv },
      store,
    );
    expect(production.check("ai.traceLevel", "content")).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    await expect(production.get("ai.traceLevel")).resolves.toBe("metadata");
    const state = (await production.states()).find(
      (item) => item.definition.key === "ai.traceLevel",
    )!;
    expect(state).toMatchObject({ value: "metadata", storedInvalid: true });
    expect(state.definition.control).toMatchObject({ refused: ["content"] });
    rows.clear();
  });

  it("ignores invalid stored values safely and narrows grants that left the catalog", async () => {
    const { store } = memoryStore([
      stored("ai.model", "not a model"),
      stored("access.providerGrants", ["sankhya:sales:read", "pdt:old:read"]),
    ]);
    const parameters = parametersFor({}, store);
    await expect(parameters.get("ai.model")).resolves.toBe("gpt-6.1-sol");
    await expect(parameters.get("access.providerGrants")).resolves.toEqual([
      "sankhya:sales:read",
    ]);
    const states = await parameters.states();
    expect(
      states
        .filter((item) => item.storedInvalid)
        .map((item) => item.definition.key),
    ).toEqual(["ai.model", "access.providerGrants"]);
  });

  it("saves conditionally on the version that was read and reports before/after", async () => {
    const { store } = memoryStore();
    const parameters = parametersFor({}, store);
    await expect(
      parameters.save("ai.model", "gpt-new", 0, owner, now),
    ).resolves.toEqual({
      result: "saved",
      before: "gpt-6.1-sol",
      after: "gpt-new",
      version: 1,
    });
    // A second owner who read version 0 cannot overwrite the change unseen.
    await expect(
      parameters.save("ai.model", "gpt-other", 0, owner, now),
    ).resolves.toEqual({ result: "conflict" });
    await expect(
      parameters.save("ai.model", "bad value", 1, owner, now),
    ).resolves.toEqual({ result: "invalid" });
    await expect(
      parameters.save("ai.model", null, 1, owner, now),
    ).resolves.toEqual({
      result: "saved",
      before: "gpt-new",
      after: "gpt-6.1-sol",
      version: 2,
    });
    // Without a database nothing can be saved; defaults still apply.
    await expect(
      parametersFor().save("ai.model", "gpt-new", 0, owner, now),
    ).resolves.toEqual({ result: "unavailable" });
  });
});

describe("parameter consumers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each AI request with the model in force at that moment", async () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: unknown, init?: RequestInit) => {
        models.push(
          (JSON.parse(init?.body as string) as { model: string }).model,
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output: [
                {
                  type: "function_call",
                  name: "answer",
                  arguments: JSON.stringify({ ok: true }),
                  call_id: "call_1",
                },
              ],
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const { store } = memoryStore();
    const parameters = parametersFor({}, store);
    const model = createOpenAiModel({ openaiApiKey: "synthetic-key" }, () =>
      parameters.get("ai.model"),
    );
    const request = {
      instructions: "Synthetic",
      messages: [{ role: "user" as const, content: "Olá" }],
      tool: {
        name: "answer",
        description: "Synthetic",
        parameters: Type.Object(
          { ok: Type.Boolean() },
          { additionalProperties: false },
        ),
      },
      maxOutputTokens: 50,
    };
    const signal = new AbortController().signal;
    await model.invoke(request, signal);
    await parameters.save("ai.model", "gpt-owner", 0, owner, now);
    const second = await model.invoke(request, signal);
    expect(models).toEqual(["gpt-6.1-sol", "gpt-owner"]);
    expect(second.invocation.model).toBe("gpt-owner");
    expect(model.model).toBe("gpt-owner");
  });
});
