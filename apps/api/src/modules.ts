import type { ApiModule, ModuleResources } from "./module.js";
import type { ServerConfig } from "./config.js";
import { createSalesModule } from "./features/sales/module.js";
import { createAgentModule } from "./features/agent/module.js";
import { createSalesCapability } from "./features/sales/capability.js";
import { providersConfigured } from "./features/sales/module.js";
import { createSalesReaders } from "./features/sales/readers.js";
import { SalesChat } from "./features/sales/application.js";
import { createModelInterpreter } from "./features/sales/interpreter.js";
import { createOpenAiModel } from "./ai/openai.js";
import {
  createIdentityModule,
  type IdentityPorts,
} from "./features/identity/module.js";
import { transferConversations } from "./features/agent/prisma-repository.js";
import {
  parseProviderGrants,
  providerGrantKey,
  providerGrantPolicy,
  type PermissionDescriptor,
} from "./features/identity/domain.js";
import { OperationalParameters, type ParameterSetup } from "./parameters.js";
import { prismaParameterStore } from "./parameter-store.js";

/**
 * Grantable capability permissions and their default provider policy. Read
 * capabilities may be granted automatically to Persons with an active link of
 * the listed provider (narrowed by IA_MNS_PROVIDER_GRANTS and then by owners
 * in the operational parameters); write or sensitive capabilities always need
 * an explicit owner grant. Owners receive all.
 */
export const permissionCatalog: readonly PermissionDescriptor[] = [
  {
    permission: "sales:read",
    title: "Consultas de vendas (Sankhya e VR Master)",
    access: "read",
    autoGrantProviders: ["sankhya"],
  },
];

const providerTitles = { pdt: "PDT Connect", sankhya: "Sankhya" } as const;

/**
 * Installation defaults from the validated environment and the provider
 * grants the permission catalog makes eligible.
 */
export function parameterSetup(config: ServerConfig): ParameterSetup {
  const titles = new Map(
    permissionCatalog.map((item) => [item.permission, item.title]),
  );
  // Throws at startup when IA_MNS_PROVIDER_GRANTS names an ineligible grant.
  const installed = providerGrantPolicy(
    permissionCatalog,
    config.providerGrants === undefined
      ? undefined
      : parseProviderGrants(config.providerGrants),
  );
  return {
    production: config.environment === "production",
    defaults: {
      "ai.model": config.openaiModel,
      "ai.traceLevel": config.aiTrace,
      "access.providerGrants": installed.map(providerGrantKey),
    },
    providerGrantOptions: providerGrantPolicy(permissionCatalog).map(
      (grant) => ({
        value: providerGrantKey(grant),
        label: `${providerTitles[grant.provider]}: ${titles.get(grant.permission)}`,
      }),
    ),
  };
}

/**
 * The operational parameters of this composition, with owner values from the
 * database when one is configured. Stateless; every read goes to the store.
 */
export function operationalParameters(
  resources: ModuleResources,
): OperationalParameters {
  if (!resources.config)
    throw new Error("Invalid API configuration: parameters need configuration");
  return new OperationalParameters(
    resources.database ? prismaParameterStore(resources.database) : undefined,
    parameterSetup(resources.config),
  );
}

// Both public contracts use the same owned sales executor/pool.
const salesServices = new WeakMap<ServerConfig, SalesChat>();
function salesService(resources: ModuleResources): SalesChat | undefined {
  const config = resources.config;
  if (!config || !providersConfigured(config)) return undefined;
  let service = salesServices.get(config);
  if (!service) {
    const parameters = operationalParameters(resources);
    service = new SalesChat(
      createModelInterpreter(
        createOpenAiModel(config, () => parameters.get("ai.model")),
      ),
      createSalesReaders(config),
    );
    salesServices.set(config, service);
  }
  return service;
}

/** Consolidating two profiles of one person moves their conversations too. */
export const identityPorts: IdentityPorts = {
  transferOwnership: transferConversations,
  parameters: operationalParameters,
};

// Composition owned by this repository. Add each API module here; the shared
// runtime activates the ones whose requirements are configured.
export const apiModules: readonly ApiModule[] = [
  createIdentityModule(permissionCatalog, identityPorts),
  createSalesModule(salesService),
  createAgentModule(
    (resources) =>
      resources.config && providersConfigured(resources.config)
        ? [createSalesCapability(resources.config, salesService(resources))]
        : [],
    undefined,
    ["sales:read"],
    operationalParameters,
  ),
];
