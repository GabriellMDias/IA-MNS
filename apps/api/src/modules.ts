import type { ApiModule, ModuleResources } from "./module.js";
import type { ServerConfig } from "./config.js";
import { createSalesModule } from "./features/sales/module.js";
import { createAgentModule } from "./features/agent/module.js";
import { createSalesCapability } from "./features/sales/capability.js";
import { providersConfigured } from "./features/sales/module.js";
import { SalesChat } from "./features/sales/application.js";
import { createOpenAiPlanner } from "./features/sales/planner.js";
import { createOracleReader } from "./features/sales/oracle.js";

// Both public contracts use the same owned sales executor/pool.
const salesServices = new WeakMap<ServerConfig, SalesChat>();
function salesService(resources: ModuleResources): SalesChat | undefined {
  const config = resources.config;
  if (!config || !providersConfigured(config)) return undefined;
  let service = salesServices.get(config);
  if (!service) {
    service = new SalesChat(
      createOpenAiPlanner(config),
      createOracleReader(config),
    );
    salesServices.set(config, service);
  }
  return service;
}

// Composition owned by this repository. Add each API module here; the shared
// runtime activates the ones whose requirements are configured.
export const apiModules: readonly ApiModule[] = [
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
