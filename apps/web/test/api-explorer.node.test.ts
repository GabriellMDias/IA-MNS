import { describe, expect, it } from "vitest";
import {
  buildExplorerRequest,
  explorerLimitation,
  readExplorerResponse,
  redactExplorerText,
  requestTemplate,
  RESPONSE_BYTE_LIMIT,
  type ExplorerOperation,
} from "../src/documentation/api-explorer-request.js";

const get: ExplorerOperation = {
  operationId: "getExample",
  method: "GET",
  path: "/examples/{id}",
  authentication: "None declared",
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      type: "string",
      schema: { type: "string" },
    },
    {
      name: "cursor",
      in: "query",
      required: false,
      type: "string",
      schema: { type: "string" },
    },
  ],
  request: null,
  responses: [],
};
const defaults = {
  apiBaseUrl: "/api",
  parameters: { "path:id": "example-1" },
  body: "",
  token: "",
  acknowledged: false,
};
const write: ExplorerOperation = {
  ...get,
  method: "POST",
  authentication: "Bearer access token",
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
  },
  request: { fields: [], required: true, schema: { type: "object" } },
  parameters: [
    ...get.parameters,
    { name: "idempotency-key", in: "header", required: true, type: "string" },
  ],
};
const writeInput = {
  ...defaults,
  token: "synthetic-access-token",
  body: '{"title":"Example"}',
  acknowledged: true,
  parameters: {
    ...defaults.parameters,
    "header:idempotency-key": "example-key",
  },
};

describe("documentation API request boundary", () => {
  it("encodes only declared parameters without following redirects or using cookies", () => {
    const result = buildExplorerRequest(get, {
      ...defaults,
      token: "synthetic-unused-token",
      parameters: {
        ...defaults.parameters,
        "query:cursor": "a+b&next=untrusted",
        "query:unknown": "ignored",
        "header:x-unknown": "ignored",
      },
    });
    expect(result.url).toBe(
      "/api/examples/example-1?cursor=a%2Bb%26next%3Duntrusted",
    );
    expect(result.init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(result.init.headers).has("Authorization")).toBe(false);
    expect(new Headers(result.init.headers).has("x-unknown")).toBe(false);
  });

  it.each([
    "https://untrusted.invalid",
    "//untrusted.invalid",
    "/\\untrusted.invalid",
    "/api?target=other",
    "/api#other",
    "/api/../other",
    "/api/%2e%2e",
    "/api\n/other",
  ])("rejects unsafe API bases: %s", (apiBaseUrl) => {
    expect(() =>
      buildExplorerRequest(get, { ...defaults, apiBaseUrl }),
    ).toThrow("same-origin");
  });

  it.each([
    "..",
    ".",
    "../other",
    "one/two",
    "one\\two",
    "%2fother",
    "%252e%252e",
    "?target=other",
    "#other",
  ])("rejects path escape values: %s", (value) => {
    expect(() =>
      buildExplorerRequest(get, {
        ...defaults,
        parameters: { "path:id": value },
      }),
    ).toThrow("single path segment");
  });

  it("requires explicit mutation acknowledgement and the declared parameters", () => {
    expect(() =>
      buildExplorerRequest(write, { ...writeInput, acknowledged: false }),
    ).toThrow("Acknowledge");
    expect(() =>
      buildExplorerRequest(write, {
        ...writeInput,
        parameters: defaults.parameters,
      }),
    ).toThrow("idempotency-key");
    const result = buildExplorerRequest(write, writeInput);
    expect(new Headers(result.init.headers).get("authorization")).toBe(
      "Bearer synthetic-access-token",
    );
    expect(new Headers(result.init.headers).get("idempotency-key")).toBe(
      "example-key",
    );
    expect(result.init.body).toBe(writeInput.body);
  });

  it("rejects invalid JSON and missing credentials locally", () => {
    expect(() =>
      buildExplorerRequest(write, { ...writeInput, body: "{" }),
    ).toThrow("valid JSON");
    expect(() =>
      buildExplorerRequest(write, { ...writeInput, token: "" }),
    ).toThrow("access token");
    expect(() =>
      buildExplorerRequest(write, { ...writeInput, body: "" }),
    ).toThrow("JSON request body");
  });

  it("keeps the supplied token out of request URLs and bodies", () => {
    expect(() =>
      buildExplorerRequest(write, {
        ...writeInput,
        parameters: {
          ...writeInput.parameters,
          "query:cursor": writeInput.token,
        },
      }),
    ).toThrow("Credentials belong");
    expect(() =>
      buildExplorerRequest(write, {
        ...writeInput,
        body: JSON.stringify({ token: writeInput.token }),
      }),
    ).toThrow("Credentials belong");
  });

  it("rejects header injection without reflecting raw values", () => {
    expect(() =>
      buildExplorerRequest(write, {
        ...writeInput,
        parameters: {
          ...writeInput.parameters,
          "header:idempotency-key": "test\r\nsecret: value",
        },
      }),
    ).toThrow("invalid characters");
  });

  it("makes unsupported security, encodings, and media types inspection-only", () => {
    expect(
      explorerLimitation({
        ...write,
        components: {
          securitySchemes: {
            bearerAuth: { type: "apiKey", in: "query", name: "api_key" },
          },
        },
      }),
    ).toContain("authentication mechanism");
    expect(
      explorerLimitation({
        ...get,
        parameters: [
          { name: "password", in: "query", required: true, type: "string" },
        ],
      }),
    ).toContain("protected parameter");
    expect(
      explorerLimitation({
        ...get,
        parameters: [
          {
            name: "query",
            in: "query",
            required: true,
            type: "object",
            schema: { type: "object" },
          },
        ],
      }),
    ).toContain("parameter encoding");
    expect(
      explorerLimitation({
        ...write,
        request: { fields: [], content: { "multipart/form-data": {} } },
      }),
    ).toContain("media type");
  });

  it("inspects complex or unknown parameter encodings without pretending they are scalar", () => {
    for (const schema of [
      {},
      { type: ["string", "array"] },
      {
        anyOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
      },
      { allOf: [{ $ref: "#/components/schemas/Parameter" }] },
    ]) {
      expect(
        explorerLimitation({
          ...get,
          parameters: [
            {
              name: "filter",
              in: "query",
              required: false,
              type: "unknown",
              schema,
            },
          ],
        }),
      ).toContain("parameter encoding");
    }
    expect(
      explorerLimitation({
        ...get,
        parameters: [
          {
            name: "scope",
            in: "query",
            required: false,
            type: "mine | reviewable",
            schema: {
              anyOf: [
                { type: "string", const: "mine" },
                { type: "string", const: "reviewable" },
              ],
            },
          },
        ],
      }),
    ).toBeNull();
    expect(explorerLimitation({ ...get, request: write.request })).toContain(
      "request body on this method",
    );
    for (const encoding of [
      { allowReserved: true },
      { allowEmptyValue: true },
    ]) {
      expect(
        explorerLimitation({
          ...get,
          parameters: [{ ...get.parameters[1], ...encoding }],
        }),
      ).toContain("parameter encoding");
    }
  });

  it("builds bounded templates from required fields and schema references", () => {
    expect(
      JSON.parse(
        requestTemplate(
          { $ref: "#/components/schemas/Input" },
          {
            Input: {
              type: "object",
              required: ["title", "version"],
              properties: {
                title: { type: "string" },
                version: { type: "integer", minimum: 1 },
                optional: { type: "string" },
              },
            },
          },
        ),
      ),
    ).toEqual({ title: "", version: 1 });
    expect(
      requestTemplate(
        { $ref: "#/components/schemas/Loop" },
        { Loop: { $ref: "#/components/schemas/Loop" } },
      ),
    ).toBe("null");
  });

  it("decodes component JSON Pointer names and does not turn optional properties into required inputs", () => {
    const schema = {
      type: "object",
      properties: { optional: { type: "string" } },
    };
    expect(requestTemplate(schema)).toBe("{}");
    expect(
      requestTemplate(
        { $ref: "#/components/schemas/Input~1Name~0Variant" },
        { "Input/Name~Variant": { ...schema, required: ["optional"] } },
      ),
    ).toBe('{\n  "optional": ""\n}');
    expect(requestTemplate({ $ref: "https://untrusted.invalid/schema" })).toBe(
      "null",
    );
    const manyFields = Array.from(
      { length: 1_001 },
      (_, index) => `field${index}`,
    );
    expect(
      requestTemplate({
        type: "object",
        required: manyFields,
        properties: Object.fromEntries(
          manyFields.map((key) => [key, { type: "string" }]),
        ),
      }),
    ).toBe("null");
  });
});

describe("documentation response display boundary", () => {
  it("redacts credentials and only exposes allowlisted response headers", async () => {
    const response = new Response(
      JSON.stringify({
        access_token: "another-synthetic-secret",
        nested: { echo: "synthetic-access-token" },
        safe: "OK",
      }),
      {
        headers: {
          "content-type": "application/json",
          "x-request-id": "example-request",
          "x-untrusted": "never shown",
          "set-cookie": "secret=private",
        },
      },
    );
    const result = await readExplorerResponse(
      response,
      "synthetic-access-token",
    );
    expect(result.body).not.toContain("another-synthetic-secret");
    expect(result.body).not.toContain("synthetic-access-token");
    expect(result.body).toContain('"safe": "OK"');
    expect(result.headers).toEqual([
      ["content-type", "application/json"],
      ["x-request-id", "example-request"],
    ]);
  });

  it("treats markup as text and redacts bearer values", async () => {
    const result = await readExplorerResponse(
      new Response(
        "<script>untrusted()</script> Bearer different-synthetic-token",
      ),
      "",
    );
    expect(result.body).toBe("<script>untrusted()</script> Bearer [redacted]");
  });

  it("bounds reads and cancels an oversized stream, redacting an incomplete token at the cutoff", async () => {
    let cancelled = false;
    const token = "synthetic-access-token";
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            "x".repeat(RESPONSE_BYTE_LIMIT - 9) + token + "extra",
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await readExplorerResponse(new Response(stream), token);
    expect(result.truncated).toBe(true);
    expect(cancelled).toBe(true);
    expect(result.body).not.toContain("synthetic");
    expect(result.body.endsWith("[redacted]")).toBe(true);
  });

  it("omits incomplete or malformed JSON rather than exposing credential fields", async () => {
    for (const response of [
      new Response('{"client_secret":"synthetic-client-secret",'),
      new Response(
        JSON.stringify({
          password: "synthetic-password",
          data: "x".repeat(RESPONSE_BYTE_LIMIT),
        }),
        { headers: { "content-type": "application/json" } },
      ),
    ]) {
      const result = await readExplorerResponse(response, "");
      expect(result.body).toContain("body is omitted");
      expect(result.body).not.toContain("synthetic");
    }
    const complete = await readExplorerResponse(
      new Response(
        JSON.stringify({
          client_secret: "synthetic-client-secret",
          id_token: "synthetic-id-token",
        }),
      ),
      "",
    );
    expect(complete.body).not.toContain("synthetic");
  });

  it("returns at the byte limit even when stream cancellation does not settle", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(RESPONSE_BYTE_LIMIT + 1));
      },
      cancel() {
        return new Promise<void>(() => undefined);
      },
    });
    const result = await readExplorerResponse(new Response(stream), "");
    expect(result.truncated).toBe(true);
  });

  it("redacts exact token echoes in text, JSON escapes, and URI encoding", () => {
    const token = "synthetic/token+value";
    const result = redactExplorerText(
      `${token} ${encodeURIComponent(token)}`,
      token,
    );
    expect(result).toBe("[redacted] [redacted]");
  });
});
