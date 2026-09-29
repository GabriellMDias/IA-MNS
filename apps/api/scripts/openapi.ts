import { approvalOperations } from "../src/features/approval-requests/contracts.js";
import { healthOperations } from "../src/health-contracts.js";
import { errorRegistry, type ErrorCode } from "../src/errors.js";
import prettier from "prettier";

type Schema = Record<string, unknown>;
function asSchema(value: object): Schema {
  return value as Schema;
}
function response(schema: unknown, status: string) {
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

export async function generateOpenApi(): Promise<string> {
  const paths: Record<string, Record<string, unknown>> = {};
  const ids = new Set<string>();
  for (const operation of [...healthOperations, ...approvalOperations]) {
    if (ids.has(operation.operationId))
      throw new Error(`Duplicate operationId: ${operation.operationId}`);
    ids.add(operation.operationId);
    const path = operation.url.replace(":id", "{id}");
    const schema = operation.schema;
    const parameters: unknown[] = [];
    if ("params" in schema) {
      const params = asSchema(schema.params);
      for (const [name, field] of Object.entries(
        params.properties as Record<string, unknown>,
      ))
        parameters.push({ name, in: "path", required: true, schema: field });
    }
    if ("querystring" in schema) {
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
    if ("headers" in schema) {
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
    if ("expectedErrors" in operation) {
      for (const code of operation.expectedErrors) {
        const definition = errorRegistry[code as ErrorCode];
        if (!definition || !(String(definition.status) in responses))
          throw new Error(
            `Undeclared expected error ${code} on ${operation.operationId}`,
          );
      }
    }
    const descriptor: Record<string, unknown> = {
      operationId: operation.operationId,
      description: operation.description,
      tags: ["expectedErrors" in operation ? "Approval Requests" : "Health"],
      ...("expectedErrors" in operation
        ? { security: [{ bearerAuth: [] }] }
        : {}),
      parameters,
      ...("body" in schema
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: schema.body } },
            },
          }
        : {}),
      responses,
      ...("expectedErrors" in operation
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
        info: { title: "Orion API", version: "1.0.0" },
        servers: [{ url: "/" }],
        paths,
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
      },
      null,
      2,
    ),
    { parser: "json" },
  );
}
