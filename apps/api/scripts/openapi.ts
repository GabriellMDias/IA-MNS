import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { healthOperations } from "../src/health-contracts.js";
import { publicErrorRegistry } from "../src/error-registry.js";
import type { ApiModule, ApiOperation } from "../src/module.js";
import { apiModules } from "../src/modules.js";
import prettier from "prettier";

// The repository identity names the API; derived projects title their own.
async function projectName(): Promise<string> {
  const manifest: unknown = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../../../.orion/project.json"),
      "utf8",
    ),
  );
  const name =
    manifest && typeof manifest === "object" && "name" in manifest
      ? manifest.name
      : undefined;
  if (typeof name !== "string" || !name.trim())
    throw new Error("Missing project name in .orion/project.json");
  return name;
}

type Schema = Record<string, unknown>;
function asSchema(value: object): Schema {
  return value as Schema;
}
function response(schema: unknown, status: string) {
  // Browser navigation targets answer with a redirect and no JSON body.
  if (status.startsWith("3"))
    return {
      description: "Redirect",
      headers: {
        Location: {
          description: "Same-origin web application route.",
          schema: { type: "string" },
        },
      },
    };
  return {
    description: "Response",
    ...(status === "429"
      ? {
          headers: {
            "Retry-After": {
              description: "Seconds until a bounded retry is allowed.",
              schema: { type: "integer", minimum: 1 },
            },
          },
        }
      : {}),
    content: { "application/json": { schema } },
  };
}

export async function generateOpenApi(
  modules: readonly ApiModule[] = apiModules,
): Promise<string> {
  const paths: Record<string, Record<string, unknown>> = {};
  const ids = new Set<string>();
  const errorRegistry = publicErrorRegistry(modules);
  const operations: {
    operation: ApiOperation;
    tag: string;
    authenticated: boolean;
  }[] = [
    ...healthOperations.map((operation) => ({
      operation,
      tag: "Health",
      authenticated: false,
    })),
    ...modules.flatMap((module) =>
      module.operations.map((operation) => ({
        operation,
        tag: module.tag,
        authenticated:
          operation.authentication === "bearer" ||
          module.requires.includes("authentication"),
      })),
    ),
  ];
  for (const { operation, tag, authenticated } of operations) {
    if (ids.has(operation.operationId))
      throw new Error(`Duplicate operationId: ${operation.operationId}`);
    ids.add(operation.operationId);
    const path = operation.url.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, "{$1}");
    const schema = operation.schema;
    const parameters: unknown[] = [];
    if (schema.params) {
      const params = asSchema(schema.params);
      for (const [name, field] of Object.entries(
        params.properties as Record<string, unknown>,
      ))
        parameters.push({ name, in: "path", required: true, schema: field });
    }
    if (schema.querystring) {
      const query = asSchema(schema.querystring);
      for (const [name, field] of Object.entries(
        query.properties as Record<string, unknown>,
      ))
        parameters.push({
          name,
          in: "query",
          required:
            (query.required as string[] | undefined)?.includes(name) ?? false,
          schema: field,
        });
    }
    if (schema.headers) {
      const headers = asSchema(schema.headers);
      for (const [name, field] of Object.entries(
        headers.properties as Record<string, unknown>,
      ))
        parameters.push({ name, in: "header", required: true, schema: field });
    }
    const responses = Object.fromEntries(
      Object.entries(schema.response).map(([code, value]) => [
        code,
        response(value, code),
      ]),
    );
    if (operation.expectedErrors) {
      for (const code of operation.expectedErrors) {
        const definition = errorRegistry[code];
        if (!definition || !(String(definition.status) in responses))
          throw new Error(
            `Undeclared expected error ${code} on ${operation.operationId}`,
          );
      }
    }
    const descriptor: Record<string, unknown> = {
      operationId: operation.operationId,
      description: operation.description,
      tags: [tag],
      ...(authenticated ? { security: [{ bearerAuth: [] }] } : {}),
      parameters,
      ...(schema.body
        ? {
            requestBody: {
              required: true,
              content: {
                [schema.bodyContentType ?? "application/json"]: {
                  schema: schema.body,
                },
              },
            },
          }
        : {}),
      responses,
      ...(operation.expectedErrors
        ? { "x-expected-error-codes": operation.expectedErrors }
        : {}),
    };
    paths[path] ??= {};
    if (paths[path][operation.method.toLowerCase()])
      throw new Error(`Duplicate route metadata: ${operation.method} ${path}`);
    paths[path][operation.method.toLowerCase()] = descriptor;
  }
  return await prettier.format(
    JSON.stringify(
      {
        openapi: "3.1.0",
        info: { title: `${await projectName()} API`, version: "1.0.0" },
        servers: [{ url: "/" }],
        paths,
        ...(operations.some(({ authenticated }) => authenticated)
          ? {
              components: {
                securitySchemes: {
                  bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                  },
                },
              },
            }
          : {}),
      },
      null,
      2,
    ),
    { parser: "json" },
  );
}
