import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type {
  AgentCapability,
  CapabilityInput,
  CapabilityOutcome,
} from "../agent/capabilities.js";
import { AgentFailure } from "../agent/errors.js";
import type { SourceReaders } from "../sales/application.js";
import { businessToday, answerFor } from "../sales/domain.js";
import { SalesFailure } from "../sales/errors.js";
import {
  compileSemanticSalesPlan,
  executeSemanticSales,
  semanticSalesPlanSchema,
} from "../sales/semantic.js";
import { salesAnalysisSchema } from "../sales/contracts.js";
import { sourceCatalog, sourcesOf } from "../sales/sources.js";
import {
  deniedProductSelection,
  productPermission,
  productSourcePermission,
  scopedProductState,
} from "./capability.js";
import {
  deniedSalesMessage,
  deniedSourceText,
  salesAccessOf,
  salesPermissions,
} from "../sales/access.js";
import { productOptionsSchema } from "./contracts.js";
import type { ProductResolver } from "./resolver.js";
import { salesProductState, selectionScopeConflict } from "./sales.js";
import { emptyProductState, productStateSchema } from "./state.js";

const object = { additionalProperties: false };
export const salesAnalyticsToolSchema = Type.Object(
  {
    plan: semanticSalesPlanSchema,
    products: Type.Object(
      {
        mode: Type.Union([
          Type.Literal("all"),
          Type.Literal("literal"),
          Type.Literal("resolve"),
          Type.Literal("reuse"),
        ]),
        text: Type.Union([
          Type.String({ minLength: 2, maxLength: 2000 }),
          Type.Null(),
        ]),
      },
      object,
    ),
  },
  object,
);
type Args = Static<typeof salesAnalyticsToolSchema>;
const scopedSchema = Type.Object(
  {
    products: productStateSchema,
    catalogVersion: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    pending: Type.Union([salesAnalyticsToolSchema, Type.Null()]),
    request: Type.Optional(
      Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
    ),
  },
  object,
);
const contextSchema = Type.Object(
  {
    version: Type.Literal(1),
    sources: Type.Object(
      {
        sankhya: Type.Optional(scopedSchema),
        vrmaster: Type.Optional(scopedSchema),
        all: Type.Optional(scopedSchema),
      },
      object,
    ),
  },
  object,
);
type Context = Static<typeof contextSchema>;
function load(context: unknown): Context {
  if (context === null || context === undefined)
    return { version: 1, sources: {} };
  if (!Value.Check(contextSchema, context))
    throw new Error("Invalid analytics context");
  return structuredClone(context);
}

/**
 * Structured analytics composes sales with the same semantic product resolver.
 * No second business catalog, user-selectable source, or SQL reaches this port.
 * Readers and resolvers are owned and closed by the existing capabilities.
 */
export function createSalesAnalyticsCapability(
  readers: SourceReaders,
  resolvers: readonly ProductResolver[],
  now: () => Date = () => new Date(),
): AgentCapability {
  async function analyze(
    value: unknown,
    input: CapabilityInput,
    resume = false,
  ): Promise<CapabilityOutcome> {
    if (!input.permissions?.has("sales:read"))
      throw new AgentFailure("AGENT_ACCESS_DENIED");
    if (!Value.Check(salesAnalyticsToolSchema, value))
      throw new SalesFailure("SALES_QUERY_INVALID");
    const args: Args = value;
    const literal =
      args.products.mode === "literal" ? args.products.text : null;
    if (
      (args.products.mode === "literal" && !literal) ||
      (["all", "reuse"].includes(args.products.mode) &&
        args.products.text !== null)
    )
      throw new SalesFailure("SALES_QUERY_INVALID");
    const today = businessToday(now());
    compileSemanticSalesPlan(args.plan, today, literal);
    input.signal.throwIfAborted();
    const context = load(input.context);
    const access = salesAccessOf(input.permissions, input.scopes);
    const selectedSources = sourcesOf(input.source);
    if (!selectedSources.some((source) => access[source]))
      return {
        reply: {
          kind: "unavailable",
          capabilityId: "analytics",
          message: deniedSalesMessage(selectedSources),
          result: null,
          suggestions: [],
          requiredPermissions: ["sales:read"],
        },
        context,
        awaiting: null,
      };
    const inherited =
      resume && input.source !== "all" ? context.sources.all : undefined;
    const scoped = context.sources[input.source] ?? {
      products: structuredClone(emptyProductState),
      catalogVersion: null,
      pending: null,
      request: null,
    };
    context.sources[input.source] = scoped;
    const semantic =
      args.products.mode === "resolve" || args.products.mode === "reuse";
    const permissions = [
      "sales:read",
      ...(semantic ? [productPermission] : []),
    ];
    const clarification = (
      message: string,
      awaiting: string,
      result: unknown = null,
      suggestions: string[] = [],
      unavailable = false,
    ): CapabilityOutcome => ({
      reply: {
        kind: unavailable ? "unavailable" : "clarification",
        capabilityId: "analytics",
        message,
        result,
        suggestions,
        requiredPermissions: permissions,
      },
      context,
      awaiting: unavailable ? null : [awaiting],
    });
    let scope;
    if (semantic) {
      if (
        !input.permissions.has(productPermission) ||
        (input.source !== "all" &&
          !input.permissions.has(productSourcePermission(input.source)))
      )
        return clarification(
          deniedProductSelection(input.source, input.permissions),
          "product",
          null,
          [],
          true,
        );
      scoped.pending = structuredClone(args);
      scoped.request = resume
        ? (scoped.request ?? inherited?.request ?? input.message)
        : input.message;
      if (input.source === "all")
        return clarification(
          "Selecione MNS (Sankhya) ou Pilar da Terra (VR Master) para analisar uma seleção de produtos. Os cadastros são independentes.",
          "source",
        );
      const resolver = resolvers.find(
        (item) => item.catalog.source.id === input.source,
      );
      if (!resolver)
        return clarification(
          "O cadastro de produtos desta fonte não está configurado. A análise não foi executada.",
          "product",
          null,
          [],
          true,
        );
      if (
        scoped.catalogVersion !== null &&
        scoped.catalogVersion !== resolver.catalog.version &&
        (scoped.products.active || scoped.products.pending)
      ) {
        scoped.products = structuredClone(emptyProductState);
        scoped.catalogVersion = null;
        return clarification(
          "O catálogo mudou. Identifique novamente os produtos nesta fonte.",
          "product",
        );
      }
      if (
        args.products.mode === "reuse" &&
        !scoped.products.active &&
        !scoped.products.pending
      ) {
        const previous = salesProductState(input.contexts?.sales, input.source);
        if (
          previous &&
          (previous.products.active || previous.products.pending)
        ) {
          if (previous.catalogVersion !== resolver.catalog.version)
            return clarification(
              "O catálogo mudou. Identifique novamente os produtos nesta fonte.",
              "product",
            );
          scoped.products = previous.products;
        } else
          scoped.products = scopedProductState(
            input.contexts?.products,
            resolver,
          );
      }
      scoped.catalogVersion = resolver.catalog.version;
      if (args.products.mode === "resolve" || scoped.products.pending) {
        // The resolver sees the actual user message, not model-rewritten claims.
        const turn = await resolver.execute({
          message: scoped.products.pending ? input.message : scoped.request,
          state: scoped.products,
          sourceSelected: true,
          purpose: "sales",
          signal: input.signal,
          progress: input.progress,
          trace: input.trace,
        });
        scoped.products = turn.state;
        if (turn.reply.kind !== "answer")
          return clarification(
            turn.reply.message,
            turn.awaiting?.[0] ?? "product",
            turn.reply.result,
            turn.reply.suggestions,
            turn.reply.kind === "unsupported",
          );
      }
      if (!scoped.products.active || scoped.products.pending)
        return clarification(
          "Identifique ou conclua a escolha dos produtos nesta fonte antes de analisar suas vendas.",
          "product",
        );
      const conflict = selectionScopeConflict(
        input.source,
        scoped.products.active,
        access,
      );
      if (conflict) return clarification(conflict, "product", null, [], true);
      scope = await resolver.salesScope(scoped.products.active, input.signal);
    } else {
      scoped.products = structuredClone(emptyProductState);
      scoped.catalogVersion = null;
    }
    await input.progress("querying_sales");
    const result = await executeSemanticSales({
      plan: args.plan,
      selection: input.source,
      permissions: input.permissions,
      access,
      readers,
      today,
      signal: input.signal,
      productSearch: literal,
      productScope: scope,
      report: input.report,
    });
    scoped.pending = null;
    scoped.request = null;
    // A completed source choice consumes only the unexecuted all-source plan.
    if (resume && input.source !== "all" && inherited?.pending) {
      inherited.pending = null;
      inherited.request = null;
    }
    await input.progress("organizing");
    const lines = result.panels.flatMap((panel) =>
      panel.sections.map((section) =>
        section.status === "denied"
          ? deniedSourceText(section.source)
          : `${sourceCatalog[section.source].label}: ${
              section.result
                ? answerFor(section.result, section.source)
                : section.status === "unsupported"
                  ? "esta medida não está disponível nesta fonte."
                  : "não foi possível consultar esta fonte; nenhum valor foi presumido."
            }`,
      ),
    );
    return {
      reply: {
        kind: "answer",
        capabilityId: "analytics",
        message: lines.join("\n\n"),
        result,
        suggestions: [],
        requiredPermissions: permissions,
      },
      context,
      awaiting: null,
    };
  }
  const description =
    "Combine métricas validadas de vendas (valor, quantidade e peso somente no Sankhya), dimensões mês e produto, períodos e comparações. Reutilize seleções e combine filtros e relacionamentos disponíveis no Semantic Product Resolver. As fontes continuam separadas.";
  return {
    id: "analytics",
    legacyRouting: false,
    title: "Análises de vendas",
    description,
    examples: ["Compare valor e quantidade por produto e por mês."],
    permission: "sales:read",
    sourcePermissions: salesPermissions,
    tools: [
      {
        name: "query_sales",
        description: `${description} products.mode resolve identifica condições no pedido original; reuse mantém a última seleção desta fonte; all remove filtros; literal usa somente descrição literal quando explicitamente desejada. Não use para reescrever resultados existentes. Filtros por fonte: ${resolvers
          .map(
            (resolver) =>
              `${resolver.catalog.source.id}: ${resolver.catalog.dimensions
                .filter((dimension) => dimension.exposure === "enabled")
                .map((dimension) => dimension.title)
                .join(", ")}`,
          )
          .join("; ")}.`,
        parameters: salesAnalyticsToolSchema,
        execute: analyze,
      },
    ],
    canRead(reply, permissions) {
      if (Value.Check(productOptionsSchema, reply.result))
        return permissions.has(productPermission);
      if (!Value.Check(salesAnalysisSchema, reply.result))
        return reply.result === null;
      return (
        !reply.result.panels.some((panel) =>
          panel.sections.some((section) => section.result?.productSelection),
        ) || permissions.has(productPermission)
      );
    },
    async execute(input) {
      if (!input.permissions?.has("sales:read"))
        throw new AgentFailure("AGENT_ACCESS_DENIED");
      const context = load(input.context);
      const pending =
        context.sources[input.source]?.pending ??
        (input.source !== "all" ? context.sources.all?.pending : null);
      if (pending) return analyze(pending, input, true);
      return {
        reply: {
          kind: "clarification",
          capabilityId: "analytics",
          message:
            "Informe o período e a análise desejada para preparar a consulta.",
          result: null,
          suggestions: [],
        },
        context,
        awaiting: ["analysis"],
      };
    },
    close: () => Promise.resolve(),
  };
}
