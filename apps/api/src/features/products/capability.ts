import { permissionDeniedMessage, type PermissionInfo } from "../../access.js";
import type { AgentCapability } from "../agent/capabilities.js";
import { sourceCatalog } from "../sales/sources.js";
import type { ProductResolver } from "./resolver.js";
import { loadProductState, type ProductState } from "./state.js";

/** Only the selected ERP's reviewed catalog version can supply a lookup scope. */
export function scopedProductState(
  context: unknown,
  resolver: ProductResolver,
): ProductState {
  const saved =
    context && typeof context === "object" && "productSources" in context
      ? context.productSources
      : null;
  const source = resolver.catalog.source.id;
  const scoped =
    saved && typeof saved === "object" && source in saved
      ? (saved as Record<string, unknown>)[source]
      : null;
  return scoped &&
    typeof scoped === "object" &&
    "catalogVersion" in scoped &&
    scoped.catalogVersion === resolver.catalog.version &&
    "state" in scoped
    ? loadProductState(scoped.state)
    : source === "vrmaster" && !saved
      ? loadProductState(context)
      : loadProductState(null);
}

export const productCapabilityId = "products";
/** Capability permission: held with the product permission of any source. */
export const productPermission = "products:read";

/**
 * One permission per product registration. The registrations are shared by
 * every company and store, so these permissions have no data restriction.
 */
export const productPermissions: Readonly<
  Record<"sankhya" | "vrmaster", PermissionInfo>
> = {
  sankhya: {
    permission: "products_sankhya:read",
    code: "SNK-PRD-01",
    title: "Consultar produtos",
    description:
      "Identificação de produtos no cadastro do Sankhya (TGFPRO) pelas dimensões verificadas. Não mostra vendas, preços nem estoque.",
    source: { id: "sankhya", title: sourceCatalog.sankhya.label },
    capability: productPermission,
    restrictions: [],
  },
  vrmaster: {
    permission: "products_vrmaster:read",
    code: "VRM-PRD-01",
    title: "Consultar produtos",
    description:
      "Identificação de produtos no cadastro do VR Master pelas dimensões verificadas. Não mostra vendas, preços nem estoque.",
    source: { id: "vrmaster", title: sourceCatalog.vrmaster.label },
    capability: productPermission,
    restrictions: [],
  },
};

export function productSourcePermission(source: "sankhya" | "vrmaster") {
  return productPermissions[source].permission;
}

/**
 * The answer when a sales request needs a product selection of a registration
 * the person may not read.
 */
export function deniedProductSelection(
  source: "sankhya" | "vrmaster" | "all",
  permissions: ReadonlySet<string> | undefined,
): string {
  const sources =
    source === "all" ? (["sankhya", "vrmaster"] as const) : [source];
  const missing = sources
    .map((item) => productPermissions[item])
    .filter((info) => !permissions?.has(info.permission));
  return permissionDeniedMessage(
    `selecionar produtos pelo cadastro de ${sources.map((item) => sourceCatalog[item].label).join(" e ")}`,
    (missing.length
      ? missing
      : sources.map((item) => productPermissions[item])
    ).map((info) => ({ info })),
  );
}

const sankhyaNotice =
  "Somente o cadastro do Pilar da Terra (VR Master) foi consultado: o Sankhya não está configurado para esta execução.";

/** What the router and the interface know about product lookup. */
export const productCapabilityDescriptor = {
  id: productCapabilityId,
  title: "Consulta de produtos",
  description:
    "Identifique quais produtos do cadastro selecionado (VR Master ou Sankhya) atendem a critérios disponíveis: categorias e grupos, marcas, unidades, fornecedores, atributos do cadastro ou texto, combinados ou com exclusões. Cada ERP oferece suas dimensões verificadas. Lista produtos; não calcula vendas, preços ou estoque.",
  examples: [
    "Quais produtos são banana fruta?",
    "Quais produtos do centro de custo SECOS são pesáveis?",
    "Quais produtos de mercearia não são doces?",
  ],
  permission: productPermission,
} as const;

/**
 * The corporate-agent face of product lookup. It identifies products of the
 * selected ERP registration and never calculates sales; the interface's source
 * selection decides whether it may run, never the message.
 */
export function createProductCapability(
  resolver: ProductResolver,
  additional?: ProductResolver,
): AgentCapability {
  const resolvers = [resolver, ...(additional ? [additional] : [])];
  return {
    ...productCapabilityDescriptor,
    examples: [...productCapabilityDescriptor.examples],
    sourcePermissions: productPermissions,
    async execute(input) {
      if (input.source === "all" && additional)
        return {
          reply: {
            kind: "clarification",
            capabilityId: productCapabilityId,
            message:
              "Selecione MNS (Sankhya) ou Pilar da Terra (VR Master) na fonte para consultar o cadastro desejado. Os códigos e critérios dos dois cadastros são independentes.",
            result: null,
            suggestions: [],
          },
          context: input.context,
          awaiting: ["source"],
        };
      const selected =
        resolvers.find((item) => item.catalog.source.id === input.source) ??
        resolver;
      const source = selected.catalog.source.id;
      if (source !== "sankhya" && source !== "vrmaster")
        throw new Error("Unknown product registration source");
      // The capability permission admits the capability; each registration
      // still needs its own permission.
      if (!input.permissions?.has(productSourcePermission(source)))
        return {
          reply: {
            kind: "unavailable",
            capabilityId: productCapabilityId,
            message: permissionDeniedMessage(
              `consultar o cadastro de produtos de ${sourceCatalog[source].label}`,
              [{ info: productPermissions[source] }],
            ),
            result: null,
            suggestions: [],
          },
          context: input.context,
          awaiting: null,
        };
      const saved =
        input.context &&
        typeof input.context === "object" &&
        "productSources" in input.context
          ? input.context.productSources
          : null;
      const state = scopedProductState(input.context, selected);
      const turn = await selected.execute({
        message: input.message,
        state,
        signal: input.signal,
        progress: input.progress,
        trace: input.trace,
        sourceSelected: input.source === "all" || input.source === source,
      });
      const result =
        input.source === "all" &&
        source === "vrmaster" &&
        turn.reply.result?.kind === "products"
          ? {
              ...turn.reply.result,
              notes: [sankhyaNotice, ...turn.reply.result.notes].slice(0, 8),
            }
          : turn.reply.result;
      return {
        reply: {
          kind:
            turn.reply.kind === "unsupported" ? "unavailable" : turn.reply.kind,
          capabilityId: productCapabilityId,
          message: turn.reply.message,
          result,
          suggestions: turn.reply.suggestions,
        },
        context: {
          productSources: {
            ...(saved && typeof saved === "object" ? saved : {}),
            [source]: {
              catalogVersion: selected.catalog.version,
              state: turn.state,
            },
          },
        },
        awaiting: turn.awaiting,
      };
    },
    close: async () => {
      await Promise.all(resolvers.map((item) => item.close()));
    },
  };
}
