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
import type { PermissionDescriptor } from "./features/identity/domain.js";

// Both public contracts use the same owned sales executor/pool.
const salesServices = new WeakMap<ServerConfig, SalesChat>();
function salesService(resources: ModuleResources): SalesChat | undefined {
  const config = resources.config;
  if (!config || !providersConfigured(config)) return undefined;
  let service = salesServices.get(config);
  if (!service) {
    service = new SalesChat(
      createModelInterpreter(createOpenAiModel(config)),
      createSalesReaders(config),
    );
    salesServices.set(config, service);
  }
  return service;
}

/**
 * Grantable capability permissions and their default provider policy. Read
 * capabilities may be granted automatically to Persons with an active link of
 * the listed provider (narrow with IA_MNS_PROVIDER_GRANTS); write or sensitive
 * capabilities always need an explicit owner grant. Owners receive all.
 */
export const permissionCatalog: readonly PermissionDescriptor[] = [
  {
    permission: "sales:read",
    title: "Consultas de vendas (Sankhya e VR Master)",
    access: "read",
    autoGrantProviders: ["sankhya"],
  },
];

/** Consolidating two profiles of one person moves their conversations too. */
export const identityPorts: IdentityPorts = {
  transferOwnership: transferConversations,
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
  ),
];
