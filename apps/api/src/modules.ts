import type { ApiModule, ModuleResources } from "./module.js";
import type { ServerConfig } from "./config.js";
import { createSalesModule } from "./features/sales/module.js";
import { createAgentModule } from "./features/agent/module.js";
import { createSalesCapability } from "./features/sales/capability.js";
import { providersConfigured } from "./features/sales/module.js";
import { createSalesReaders } from "./features/sales/readers.js";
import { SalesChat, type SourceReaders } from "./features/sales/application.js";
import { createModelInterpreter } from "./features/sales/interpreter.js";
import { createOpenAiModel } from "./ai/openai.js";
import {
  createIdentityModule,
  identityServiceFor,
  type IdentityPorts,
} from "./features/identity/module.js";
import type { Database } from "./database.js";
import { transferConversations } from "./features/agent/prisma-repository.js";
import type { PermissionDescriptor } from "./features/identity/domain.js";
import { OperationalParameters, type ParameterSetup } from "./parameters.js";
import { prismaParameterStore } from "./parameter-store.js";
import {
  createProductsModule,
  productsConfigured,
} from "./features/products/module.js";
import {
  createProductCapability,
  productPermission,
  productPermissions,
} from "./features/products/capability.js";
import {
  salesCapabilityPermission,
  salesPermissions,
} from "./features/sales/access.js";
import { createSalesRestrictionDirectory } from "./features/sales/restrictions.js";
import type { AccessResolver } from "./access.js";
import { ProductResolver } from "./features/products/resolver.js";
import { createSemanticSalesCapability } from "./features/products/sales.js";
import { createSalesAnalyticsCapability } from "./features/products/analytics.js";
import {
  createProductInterpreter,
  productModelTimeoutMs,
} from "./features/products/interpreter.js";
import { createVrmasterProductSource } from "./features/products/vrmaster/source.js";
import { createSankhyaProductSource } from "./features/products/sankhya/source.js";
import { sankhyaCatalog } from "./features/products/sankhya/catalog.js";
import { vrmasterCatalog } from "./features/products/vrmaster/catalog.js";
import { vrmasterConnection } from "./vrmaster-connection.js";
import type { CorporateAgent } from "./features/agent/application.js";
import { agentChannel } from "./features/agent/channel.js";
import { createWhatsappModule } from "./features/whatsapp/module.js";

/** Per-source permissions; provider sign-in joins owner-selected groups. */
export const permissionCatalog: readonly PermissionDescriptor[] = [
  { ...salesPermissions.sankhya, access: "read", autoGrantProviders: [] },
  { ...salesPermissions.vrmaster, access: "read", autoGrantProviders: [] },
  { ...productPermissions.sankhya, access: "read", autoGrantProviders: [] },
  { ...productPermissions.vrmaster, access: "read", autoGrantProviders: [] },
];

/** Every permission a development identity holds: catalog and capability permissions. */
export const developmentPermissions: readonly string[] = [
  ...new Set([
    ...permissionCatalog.map((item) => item.permission),
    salesCapabilityPermission,
    productPermission,
  ]),
];

/** Installation defaults for operational product settings. */
export function parameterSetup(config: ServerConfig): ParameterSetup {
  return {
    production: config.environment === "production",
    defaults: {
      "ai.model": config.openaiModel,
      "ai.traceLevel": config.aiTrace,
      "channels.whatsapp": config.whatsappChannel,
    },
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
const salesReaders = new WeakMap<ServerConfig, SourceReaders>();
function sharedSalesReaders(config: ServerConfig): SourceReaders {
  let readers = salesReaders.get(config);
  if (!readers) {
    readers = createSalesReaders(config);
    salesReaders.set(config, readers);
  }
  return readers;
}
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
      sharedSalesReaders(config),
    );
    salesServices.set(config, service);
  }
  return service;
}

// One shared resolver per configured ERP and configuration, owned by the agent.
const productResolvers = new WeakMap<ServerConfig, ProductResolver[]>();
function productResolver(
  resources: ModuleResources,
): ProductResolver[] | undefined {
  const config = resources.config;
  if (!config || !productsConfigured(config)) return undefined;
  let resolver = productResolvers.get(config);
  if (!resolver) {
    const parameters = operationalParameters(resources);
    const model = createOpenAiModel(config, () => parameters.get("ai.model"), {
      timeoutMs: productModelTimeoutMs,
    });
    resolver = [
      ...(vrmasterConnection(config)
        ? [
            new ProductResolver(
              createVrmasterProductSource(vrmasterConnection(config)!),
              createProductInterpreter(model, vrmasterCatalog),
            ),
          ]
        : []),
      ...(config.sankhyaUser &&
      config.sankhyaPassword &&
      config.sankhyaConnectString
        ? [
            new ProductResolver(
              createSankhyaProductSource(config),
              createProductInterpreter(model, sankhyaCatalog),
            ),
          ]
        : []),
    ];
    productResolvers.set(config, resolver);
  }
  return resolver;
}

/**
 * Consolidating two profiles of one person moves their conversations too;
 * sales supplies the read-only values of its restriction dimensions.
 */
export const identityPorts: IdentityPorts = {
  transferOwnership: transferConversations,
  parameters: operationalParameters,
  restrictions: createSalesRestrictionDirectory,
};

/**
 * The identity service of this composition for operational commands, such as
 * the owner bootstrap, that run beside the server with its configuration.
 */
export function identityService(config: ServerConfig, database: Database) {
  return identityServiceFor(
    config,
    { config, database },
    permissionCatalog,
    identityPorts,
  );
}

// The activated agent of each configuration, shared with other channels.
const agents = new WeakMap<ServerConfig, CorporateAgent>();
// One identity service per configuration, shared by identity and WhatsApp.
const identityServices = new WeakMap<
  ServerConfig,
  ReturnType<typeof identityServiceFor>
>();
function sharedIdentityService(resources: ModuleResources) {
  const config = resources.config;
  if (!config) return undefined;
  if (!identityServices.has(config))
    identityServices.set(
      config,
      identityServiceFor(config, resources, permissionCatalog, identityPorts),
    );
  return identityServices.get(config);
}

/**
 * Current access of an authenticated principal, computed by identity from
 * trusted state, for the modules that enforce data restrictions.
 */
function accessResolver(
  resources: ModuleResources,
): AccessResolver | undefined {
  const service = sharedIdentityService(resources);
  return service ? (personId) => service.accessSnapshot(personId) : undefined;
}

/**
 * The WhatsApp channel reaches the same agent and identity as the web: the
 * owner-linked number is its only authorization, and every answer comes from
 * the agent with the permissions identity computes for that message.
 */
const whatsappModule = createWhatsappModule({
  identity: (resources) => {
    const service = sharedIdentityService(resources);
    return service
      ? {
          authorize: (sender) => service.authorizeWhatsappSender(sender),
          confirm: (authorization) =>
            service.confirmWhatsappSender(authorization),
        }
      : undefined;
  },
  agent: (resources, log) => {
    const agent = resources.config ? agents.get(resources.config) : undefined;
    return agent ? agentChannel(agent, "whatsapp", log) : undefined;
  },
  enabled: (resources) => {
    const parameters = operationalParameters(resources);
    return async () =>
      (await parameters.get("channels.whatsapp")) === "enabled";
  },
});

// Composition owned by this repository. Add each API module here; the shared
// runtime activates the ones whose requirements are configured.
export const apiModules: readonly ApiModule[] = [
  createIdentityModule(permissionCatalog, identityPorts, sharedIdentityService),
  createSalesModule(salesService, accessResolver),
  createProductsModule(),
  createAgentModule(
    (resources) => {
      const products = productResolver(resources);
      return [
        ...(resources.config && providersConfigured(resources.config)
          ? [
              createSalesAnalyticsCapability(
                sharedSalesReaders(resources.config),
                products ?? [],
              ),
            ]
          : []),
        ...(resources.config && providersConfigured(resources.config)
          ? [
              products?.length
                ? createSemanticSalesCapability(
                    createSalesCapability(
                      resources.config,
                      salesService(resources),
                    ),
                    salesService(resources)!,
                    products,
                  )
                : createSalesCapability(
                    resources.config,
                    salesService(resources),
                  ),
            ]
          : []),
        ...(products?.[0]
          ? [createProductCapability(products[0], products[1])]
          : []),
      ];
    },
    undefined,
    developmentPermissions,
    operationalParameters,
    (resources, agent) => {
      if (resources.config && agent) agents.set(resources.config, agent);
    },
    accessResolver,
  ),
  whatsappModule,
];
