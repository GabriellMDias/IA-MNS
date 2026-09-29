/** The explorer consumes generated contracts; this is a presentation shape, not an API schema. */
export interface ExplorerOperation {
  operationId: string;
  method: string;
  path: string;
  authentication: string;
  security?: Record<string, string[]>[];
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
  parameters: {
    name: string;
    in: string;
    required: boolean;
    type: string;
    schema?: unknown;
    style?: string;
    content?: Record<string, unknown>;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
  }[];
  request: null | {
    fields: { name: string; type: string; required: boolean }[];
    schema?: unknown;
    required?: boolean;
    content?: Record<string, unknown>;
  };
  responses: {
    status: string;
    fields: { name: string; type: string; required: boolean }[];
    schema?: unknown;
    description?: string;
  }[];
}

export const RESPONSE_BYTE_LIMIT = 64 * 1024;
export const REQUEST_TIMEOUT_MS = 15_000;
const restrictedName =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|private[_-]?key|credentials?|token)$/i;
const forbiddenHeader =
  /^(?:accept|content-type|host|origin|referer|connection|content-length|date|expect|trailer|transfer-encoding|upgrade|via|user-agent|accept-encoding|access-control-.+|sec-.+|proxy-.+|x-forwarded-.+)$/i;
const methods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function requiresBearer(operation: ExplorerOperation): boolean {
  return operation.authentication !== "None declared";
}

export function changesData(operation: ExplorerOperation): boolean {
  return !["GET", "HEAD"].includes(operation.method);
}

function scalarParameterSchema(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  const schema = object(value);
  if (
    !schema ||
    (schema.type !== undefined &&
      (typeof schema.type !== "string" ||
        !["string", "number", "integer", "boolean"].includes(schema.type))) ||
    ["$ref", "properties", "items", "additionalProperties"].some(
      (key) => key in schema,
    )
  )
    return false;
  const variants = [schema.anyOf, schema.oneOf, schema.allOf].filter(
    (variant) => variant !== undefined,
  );
  if (variants.length)
    return variants.every(
      (variant) =>
        Array.isArray(variant) &&
        variant.length > 0 &&
        variant.every((item) => scalarParameterSchema(item, depth + 1)),
    );
  return (
    typeof schema.type === "string" &&
    ["string", "number", "integer", "boolean"].includes(schema.type)
  );
}

/** Unsupported future contracts stay inspectable without silently changing their wire semantics. */
export function explorerLimitation(
  operation: ExplorerOperation,
): string | null {
  if (!methods.has(operation.method))
    return "This HTTP method is inspection-only.";
  if (
    requiresBearer(operation) &&
    operation.authentication !== "Bearer access token"
  )
    return "This authentication mechanism is inspection-only. The explorer supports bearer access tokens.";
  if (
    operation.security?.length &&
    !operation.security.some((requirement) => {
      const names = Object.keys(requirement);
      if (names.length !== 1) return false;
      const scheme = object(operation.components?.securitySchemes?.[names[0]]);
      return (
        scheme?.type === "http" &&
        typeof scheme.scheme === "string" &&
        scheme.scheme.toLowerCase() === "bearer"
      );
    })
  )
    return "This authentication mechanism is inspection-only. The explorer supports bearer access tokens.";
  if (
    operation.request?.content &&
    !operation.request.content["application/json"]
  )
    return "This request media type is inspection-only. The explorer sends JSON bodies.";
  if (operation.request && ["GET", "HEAD"].includes(operation.method))
    return "A request body on this method is inspection-only.";
  for (const parameter of operation.parameters) {
    if (
      !["path", "query", "header"].includes(parameter.in) ||
      !scalarParameterSchema(parameter.schema ?? { type: parameter.type }) ||
      parameter.content !== undefined ||
      parameter.allowReserved === true ||
      parameter.allowEmptyValue === true ||
      (parameter.style !== undefined &&
        parameter.style !== (parameter.in === "query" ? "form" : "simple"))
    )
      return "This operation has a parameter encoding the explorer does not support. Inspect its OpenAPI contract.";
    if (
      restrictedName.test(parameter.name) ||
      (parameter.in === "header" && forbiddenHeader.test(parameter.name))
    )
      return "This operation declares a protected parameter and is inspection-only.";
  }
  return null;
}

export function parameterKey(parameter: { name: string; in: string }): string {
  return `${parameter.in}:${parameter.name}`;
}

function validatePath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#%\s]/.test(path) ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  )
    throw new Error(
      "The configured API path is not safe for same-origin requests.",
    );
}

export function buildExplorerRequest(
  operation: ExplorerOperation,
  input: {
    apiBaseUrl: string;
    parameters: Record<string, string>;
    body: string;
    token: string;
    acknowledged: boolean;
  },
): { url: string; init: RequestInit } {
  const limitation = explorerLimitation(operation);
  if (limitation) throw new Error(limitation);
  validatePath(input.apiBaseUrl);
  validatePath(operation.path);
  if (changesData(operation) && !input.acknowledged)
    throw new Error("Acknowledge that this request can change real API data.");
  const token = input.token.trim();
  if (requiresBearer(operation) && !token)
    throw new Error("Enter an access token for this authenticated operation.");
  if (token && !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
    throw new Error("The access token contains invalid characters.");

  let path = operation.path;
  const query = new URLSearchParams();
  const headers = new Headers({ Accept: "application/json" });
  for (const parameter of operation.parameters) {
    const value = input.parameters[parameterKey(parameter)] ?? "";
    if (!value && parameter.required)
      throw new Error(`Enter the required ${parameter.name} parameter.`);
    if (!value) continue;
    if (token && value.includes(token))
      throw new Error("Credentials belong only in the access token field.");
    if (parameter.in === "path") {
      if (
        !value.isWellFormed() ||
        /[\\/?#%\s]/.test(value) ||
        value === "." ||
        value === ".."
      )
        throw new Error(
          "Path parameters must be a single path segment without encoded separators.",
        );
      path = path.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
    } else if (parameter.in === "query") {
      query.append(parameter.name, value);
    } else if (parameter.in === "header") {
      if (
        !/^[!#$%&'*+.^_`|~\w-]+$/.test(parameter.name) ||
        /[^\t\x20-\x7e]/.test(value)
      )
        throw new Error(
          "A declared request header contains invalid characters.",
        );
      headers.set(parameter.name, value);
    }
  }
  if (/[{}]/.test(path))
    throw new Error("Complete all required path parameters.");
  if (requiresBearer(operation))
    headers.set("Authorization", `Bearer ${token}`);
  let body: string | undefined;
  if (operation.request && input.body.trim()) {
    if (["GET", "HEAD"].includes(operation.method))
      throw new Error("A request body on this method is inspection-only.");
    if (token && input.body.includes(token))
      throw new Error("Credentials belong only in the access token field.");
    try {
      JSON.parse(input.body);
    } catch {
      throw new Error("Enter valid JSON in the request body.");
    }
    body = input.body;
    headers.set("Content-Type", "application/json");
  } else if (operation.request?.required !== false && operation.request) {
    throw new Error("Enter a JSON request body.");
  }
  const suffix = query.size ? `?${query}` : "";
  return {
    url: `${input.apiBaseUrl.replace(/\/$/, "")}${path}${suffix}`,
    init: {
      method: operation.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    },
  };
}

/** A starting shape only. The server owns validation and callers must replace sample values. */
export function requestTemplate(
  schema: unknown,
  components: Record<string, unknown> = {},
): string {
  let remainingNodes = 1_000;
  function sample(value: unknown, depth: number): unknown {
    if (depth > 8 || remainingNodes-- <= 0) return null;
    const node = object(value);
    if (!node) return null;
    if (
      typeof node.$ref === "string" &&
      node.$ref.startsWith("#/components/schemas/")
    ) {
      const key = node.$ref
        .slice("#/components/schemas/".length)
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
      return Object.hasOwn(components, key)
        ? sample(components[key], depth + 1)
        : null;
    }
    if (node.$ref !== undefined) return null;
    if (node.const !== undefined) return node.const;
    if (Array.isArray(node.enum)) return node.enum[0] ?? null;
    const variants = node.anyOf ?? node.oneOf;
    if (Array.isArray(variants))
      return sample(
        variants.find((variant) => object(variant)?.type !== "null") ??
          variants[0],
        depth + 1,
      );
    if (node.type === "object" || node.properties) {
      const properties = object(node.properties) ?? {};
      const required = Array.isArray(node.required) ? node.required : [];
      if (required.length > remainingNodes) return null;
      return Object.fromEntries(
        required
          .filter((key): key is string => typeof key === "string")
          .map((key) => [key, sample(properties[key], depth + 1)]),
      );
    }
    if (node.type === "array") return [];
    if (node.type === "integer" || node.type === "number")
      return typeof node.minimum === "number" ? node.minimum : 0;
    if (node.type === "boolean") return false;
    if (node.type === "null") return null;
    return "";
  }
  return JSON.stringify(sample(schema, 0), null, 2);
}

export function redactExplorerText(
  text: string,
  token: string,
  truncated = false,
): string {
  let safe = text;
  for (const value of new Set([
    token,
    encodeURIComponent(token),
    JSON.stringify(token).slice(1, -1),
  ])) {
    if (!value) continue;
    safe = safe.replaceAll(value, "[redacted]");
    if (truncated) {
      for (
        let length = Math.min(value.length - 1, safe.length);
        length > 0;
        length--
      ) {
        if (safe.endsWith(value.slice(0, length))) {
          safe = `${safe.slice(0, -length)}[redacted]`;
          break;
        }
      }
    }
  }
  return safe.replace(/\bBearer\s+[^\s"<>]+/gi, "Bearer [redacted]");
}

function redactJson(value: unknown, depth = 0): unknown {
  if (depth > 32) return "[nested value omitted]";
  if (Array.isArray(value))
    return value.map((item) => redactJson(item, depth + 1));
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      restrictedName.test(key) ? "[redacted]" : redactJson(item, depth + 1),
    ]),
  );
}

export async function readExplorerResponse(
  response: Response,
  token: string,
): Promise<{ body: string; truncated: boolean; headers: [string, string][] }> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const remaining = RESPONSE_BYTE_LIMIT - bytes;
        chunks.push(value.slice(0, remaining));
        bytes += Math.min(value.byteLength, remaining);
        if (value.byteLength > remaining || bytes === RESPONSE_BYTE_LIMIT) {
          truncated = true;
          // The byte limit must not depend on a stream's cancellation promise.
          void reader.cancel().catch(() => undefined);
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body = new TextDecoder().decode(buffer);
  const jsonResponse =
    /(?:^application\/json|\+json)(?:\s*;|$)/i.test(
      response.headers.get("content-type") ?? "",
    ) || /^\s*(?:\[|{)/.test(body);
  if (truncated && jsonResponse) {
    // Partial JSON cannot safely be traversed to remove credential fields.
    body =
      "JSON response exceeded the read limit; its incomplete body is omitted.";
  } else if (!truncated) {
    try {
      body = JSON.stringify(redactJson(JSON.parse(body)), null, 2);
    } catch {
      // Invalid declared JSON cannot safely be traversed for credential fields.
      if (jsonResponse) body = "Invalid JSON response; its body is omitted.";
    }
  }
  const safeHeaders = new Set([
    "content-type",
    "content-length",
    "etag",
    "x-request-id",
    "request-id",
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
  ]);
  return {
    body: redactExplorerText(body, token, truncated),
    truncated,
    headers: [...response.headers]
      .filter(([name]) => safeHeaders.has(name))
      .map(([name, value]) => [name, redactExplorerText(value, token)]),
  };
}
