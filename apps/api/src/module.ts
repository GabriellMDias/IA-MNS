import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Logger } from "pino";
import type { TSchema } from "typebox";
import type { AccessTokenVerifier } from "./authentication.js";
import type { Database } from "./database.js";
import type { ErrorDefinition } from "./errors.js";

export type AppInstance = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  Logger,
  TypeBoxTypeProvider
>;

/** Executable route metadata; the single source for routing and OpenAPI. */
export type ApiOperation = Readonly<{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  operationId: string;
  description: string;
  schema: Readonly<{
    params?: TSchema;
    querystring?: TSchema;
    headers?: TSchema;
    body?: TSchema;
    response: Readonly<Record<number, TSchema>>;
  }>;
  expectedErrors?: readonly string[];
}>;

export type ModuleRequirement = "database" | "authentication";
export type ModuleResources = Readonly<{
  database?: Database;
  verifier?: AccessTokenVerifier;
}>;

/** A module whose dependencies are satisfied and whose routes can mount. */
export type RegisteredModule = Readonly<{
  name: string;
  register(app: AppInstance): void;
}>;

/**
 * A cohesive API capability. The shared runtime knows modules only through
 * this contract; `modules.ts` lists the modules this repository composes.
 */
export type ApiModule = Readonly<{
  name: string;
  /** OpenAPI tag grouping the module's operations. */
  tag: string;
  requires: readonly ModuleRequirement[];
  operations: readonly ApiOperation[];
  errors: Readonly<Record<string, ErrorDefinition>>;
  /** Called only when every requirement is configured. */
  activate(resources: ModuleResources): RegisteredModule;
}>;

/**
 * Activates modules whose requirements are configured. Outside production an
 * unconfigured module stays unmounted; production refuses to start instead.
 */
export function activateModules(
  modules: readonly ApiModule[],
  resources: ModuleResources,
  environment: "development" | "test" | "production",
): RegisteredModule[] {
  const available: Record<ModuleRequirement, boolean> = {
    database: resources.database !== undefined,
    authentication: resources.verifier !== undefined,
  };
  const active: RegisteredModule[] = [];
  for (const module of modules) {
    const missing = module.requires.filter(
      (requirement) => !available[requirement],
    );
    if (missing.length === 0) active.push(module.activate(resources));
    else if (environment === "production")
      throw new Error(
        `Invalid API configuration: ${module.name} requires ${missing.join(" and ")}`,
      );
  }
  return active;
}
