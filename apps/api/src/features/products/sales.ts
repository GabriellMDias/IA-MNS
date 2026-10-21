import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type {
  AgentCapability,
  CapabilityInput,
} from "../agent/capabilities.js";
import type { SalesChat } from "../sales/application.js";
import {
  emptySalesState,
  loadSalesState,
  salesStateSchema,
} from "../sales/conversation-state.js";
import {
  deniedProductSelection,
  productPermission,
  productSourcePermission,
  scopedProductState,
} from "./capability.js";
import {
  deniedScopeMessage,
  outsideScope,
  salesAccessOf,
  type SalesAccess,
} from "../sales/access.js";
import type { ProductResolver, ProductTurn } from "./resolver.js";
import type { ProductSelection } from "./selection.js";
import { emptyProductState, productStateSchema } from "./state.js";

const object = { additionalProperties: false };
const scopedSchema = Type.Object(
  {
    sales: salesStateSchema,
    products: productStateSchema,
    catalogVersion: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    request: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
    mode: Type.Union([
      Type.Literal("resolve"),
      Type.Literal("reuse"),
      Type.Null(),
    ]),
  },
  object,
);
const contextSchema = Type.Object(
  {
    version: Type.Literal(3),
    lastSource: Type.Optional(
      Type.Union([
        Type.Literal("vrmaster"),
        Type.Literal("sankhya"),
        Type.Literal("all"),
      ]),
    ),
    salesSources: Type.Object(
      {
        vrmaster: Type.Optional(scopedSchema),
        sankhya: Type.Optional(scopedSchema),
        all: Type.Optional(scopedSchema),
      },
      object,
    ),
  },
  object,
);
type Context = Static<typeof contextSchema>;
type Scoped = Static<typeof scopedSchema>;

/**
 * Catalog dimensions whose records are the records of a sales restriction
 * dimension of the same source: VR Master product buyers are comprador rows,
 * the same rows the sales restriction by buyer admits. Hierarchical
 * dimensions are not compared here; the restricted sales SQL still applies.
 */
const restrictedCriteria: Readonly<
  Partial<Record<"sankhya" | "vrmaster", Readonly<Record<string, string>>>>
> = { vrmaster: { buyer: "buyer" } };

/**
 * The denial when a product selection explicitly names records the person's
 * sales scope does not admit, instead of answering a silently restricted
 * total. Null when the selection fits the scope.
 */
export function selectionScopeConflict(
  source: "sankhya" | "vrmaster",
  selection: ProductSelection,
  access: SalesAccess,
): string | null {
  for (const criterion of selection.criteria) {
    if (criterion.kind !== "entity" || criterion.mode !== "include") continue;
    const dimension = restrictedCriteria[source]?.[criterion.dimension];
    if (!dimension) continue;
    const outside = outsideScope(
      access[source],
      dimension,
      criterion.matched.map((record) => ({
        value: String(record.id),
        label: record.label,
      })),
    );
    if (outside.length) return deniedScopeMessage(source, dimension, outside);
  }
  return null;
}

/** Read-only reuse of the existing sales selection, with its original version. */
export function salesProductState(
  context: unknown,
  source: "sankhya" | "vrmaster",
): { products: Scoped["products"]; catalogVersion: string | null } | null {
  if (!Value.Check(contextSchema, context)) return null;
  const scoped = context.salesSources[source];
  return scoped
    ? {
        products: structuredClone(scoped.products),
        catalogVersion: scoped.catalogVersion,
      }
    : null;
}

function load(input: CapabilityInput): Context {
  if (
    input.context &&
    typeof input.context === "object" &&
    "version" in input.context &&
    input.context.version === 3
  ) {
    if (!Value.Check(contextSchema, input.context))
      throw new Error("Invalid semantic sales context");
    return structuredClone(input.context);
  }
  return {
    version: 3,
    salesSources: {
      [input.source]: {
        sales: loadSalesState(
          input.context,
          input.history
            .filter((item) => item.reply.capabilityId === "sales")
            .slice(-12),
        ),
        products: structuredClone(emptyProductState),
        catalogVersion: null,
        request: null,
        mode: null,
      },
    },
  };
}

/**
 * Products implements the sales-owned resolution port; sales never imports
 * product internals. Only this actor-owned sales context is updated. An
 * explicit reuse reads the matching lookup context after checking permission.
 */
export function createSemanticSalesCapability(
  base: AgentCapability,
  service: SalesChat,
  resolvers: readonly ProductResolver[],
): AgentCapability {
  return {
    ...base,
    canRead(reply, permissions) {
      const result = reply.result as {
        kind?: string;
        sections?: { result?: { productSelection?: unknown } | null }[];
      } | null;
      const semantic =
        result?.kind === "product_options" ||
        result?.sections?.some((section) => section.result?.productSelection);
      return !semantic || permissions.has(productPermission);
    },
    description: `${base.description} Pode usar a seleção semântica de produtos do cadastro atual da fonte escolhida, mediante a permissão de produtos, preservando as regras de cálculo de vendas.`,
    async execute(input) {
      const context = load(input);
      const inherited =
        input.source !== "all" && context.salesSources.all?.mode
          ? context.salesSources.all
          : undefined;
      const scoped: Scoped =
        context.salesSources[input.source] ??
        structuredClone(
          inherited ?? {
            sales: emptySalesState,
            products: emptyProductState,
            catalogVersion: null,
            request: null,
            mode: null,
          },
        );
      const previous = context.lastSource
        ? context.salesSources[context.lastSource]
        : undefined;
      // Keep the established selector behavior for literal sales. Semantic
      // registrations remain isolated; their state can never broaden a new ERP.
      const unscoped = (value: Scoped) =>
        !value.products.active && !value.products.pending && !value.mode;
      if (previous && unscoped(previous) && unscoped(scoped))
        scoped.sales = structuredClone(previous.sales);
      const resolver = resolvers.find(
        (item) => item.catalog.source.id === input.source,
      );
      // A product selection reads the registration of the selected source.
      const authorized =
        input.permissions?.has(productPermission) === true &&
        (input.source === "all" ||
          input.permissions.has(productSourcePermission(input.source)));
      let productTurn: ProductTurn | undefined;
      let awaitingSource = false;
      const turn = await service.execute(
        input.message,
        "persistent",
        scoped.sales,
        input.signal,
        input.progress,
        input.trace,
        {
          selection: input.source,
          report: input.report,
          access: salesAccessOf(input.permissions ?? new Set(), input.scopes),
          products: {
            guide: {
              authorized,
              dimensions:
                authorized && resolver
                  ? resolver.catalog.dimensions.map((item) => ({
                      id: item.id,
                      meaning: item.description,
                      available: item.exposure === "enabled",
                    }))
                  : [],
              awaitingChoice: scoped.products.pending !== null,
            },
            async resolve(interpretation, step, executeSelection) {
              const mode = interpretation.productMode;
              const literalChange = interpretation.filters.length > 0;
              if (
                mode === "all" ||
                mode === "literal" ||
                literalChange ||
                (step.notes.relation === "new" &&
                  mode !== "resolve" &&
                  mode !== "reuse")
              ) {
                scoped.products = structuredClone(emptyProductState);
                scoped.request = null;
                scoped.mode = null;
                scoped.catalogVersion = null;
              }
              const denied = () => ({
                kind: "unsupported" as const,
                message: deniedProductSelection(
                  input.source,
                  input.permissions,
                ),
              });
              if (mode === "resolve" || mode === "reuse") {
                if (!authorized) return denied();
                if (step.notes.relation === "new" || mode === "reuse")
                  scoped.products = structuredClone(emptyProductState);
                scoped.request = input.message;
                scoped.mode = mode;
                // A version change must not bless an inherited old selection.
                if (!scoped.products.active && !scoped.products.pending)
                  scoped.catalogVersion = resolver?.catalog.version ?? null;
              }
              const hasScope =
                scoped.mode !== null ||
                scoped.products.active !== null ||
                scoped.products.pending !== null;
              if (!hasScope) return { kind: "ready" };
              if (!authorized) return denied();
              if (input.source === "all") {
                awaitingSource = true;
                return {
                  kind: "clarification",
                  message:
                    "Selecione MNS (Sankhya) ou Pilar da Terra (VR Master) na fonte para usar uma seleção de produtos nas vendas. Os cadastros são independentes.",
                };
              }
              if (!resolver)
                return {
                  kind: "unsupported",
                  message:
                    "O cadastro de produtos desta fonte não está configurado. A consulta de vendas não foi executada.",
                };
              if (
                scoped.catalogVersion !== null &&
                scoped.catalogVersion !== resolver.catalog.version
              )
                return {
                  kind: "clarification",
                  message:
                    "O catálogo de produtos mudou. Identifique novamente os produtos nesta fonte antes de consultar suas vendas.",
                };
              scoped.catalogVersion = resolver.catalog.version;
              if (scoped.mode === "reuse") {
                const lookup = scopedProductState(
                  input.contexts?.products,
                  resolver,
                );
                if (!lookup.active || lookup.pending)
                  return {
                    kind: "clarification",
                    message:
                      "Identifique ou conclua a escolha dos produtos nesta fonte antes de consultar suas vendas. Uma seleção de outro ERP não pode ser reutilizada.",
                  };
                scoped.products = lookup;
                scoped.mode = null;
                scoped.request = null;
              }
              // Retain a request awaiting its period without querying any ERP.
              if (step.kind !== "execute" || !executeSelection)
                return { kind: "ready" };
              if (scoped.mode === "resolve") {
                const request = scoped.products.pending
                  ? input.message
                  : scoped.request;
                if (!request)
                  throw new Error("Missing semantic sales product request");
                productTurn = await resolver.execute({
                  message: request,
                  state: scoped.products,
                  purpose: "sales",
                  sourceSelected: true,
                  signal: input.signal,
                  progress: input.progress,
                  trace: input.trace,
                });
                scoped.products = productTurn.state;
                if (productTurn.reply.kind !== "answer")
                  return {
                    kind:
                      productTurn.reply.kind === "unsupported"
                        ? "unsupported"
                        : "clarification",
                    message: productTurn.reply.message,
                  };
                scoped.mode = null;
                scoped.request = null;
              }
              if (!scoped.products.active || scoped.products.pending)
                return {
                  kind: "clarification",
                  message:
                    "Conclua a seleção de produtos antes de consultar suas vendas.",
                };
              const conflict = selectionScopeConflict(
                input.source,
                scoped.products.active,
                salesAccessOf(input.permissions ?? new Set(), input.scopes),
              );
              if (conflict) return { kind: "unsupported", message: conflict };
              return {
                kind: "ready",
                scope: await resolver.salesScope(
                  scoped.products.active,
                  input.signal,
                ),
              };
            },
          },
        },
      );
      scoped.sales = turn.state;
      context.salesSources[input.source] = scoped;
      context.lastSource = input.source;
      return {
        reply: {
          kind:
            turn.reply.kind === "unsupported" ? "unavailable" : turn.reply.kind,
          capabilityId: "sales",
          message: turn.reply.message,
          result:
            productTurn && productTurn.reply.kind !== "answer"
              ? productTurn.reply.result
              : turn.reply.answer,
          suggestions:
            productTurn && productTurn.reply.kind !== "answer"
              ? productTurn.reply.suggestions
              : turn.reply.suggestions,
        },
        context,
        awaiting: awaitingSource
          ? ["source"]
          : scoped.products.pending
            ? [scoped.products.pending.awaiting]
            : (scoped.sales.pending?.awaiting ?? null),
      };
    },
  };
}
