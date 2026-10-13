import { expect, it, vi } from "vitest";
import { noTrace } from "../src/ai/trace.js";
import type { CapabilityInput } from "../src/features/agent/capabilities.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import {
  semanticSalesInterpretationSchema,
  interpretationIssues,
  type Interpretation,
} from "../src/features/sales/interpretation.js";
import type { SalesProductScope } from "../src/features/sales/product-scope.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import { parseServerConfig } from "../src/config.js";
import { interpretation } from "../evals/fixtures.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import { createSemanticSalesCapability } from "../src/features/products/sales.js";
import { emptyProductState } from "../src/features/products/state.js";
import type { ProductInterpreter } from "../src/features/products/interpreter.js";
import type { ProductSource } from "../src/features/products/source.js";
import type { ProductSelection } from "../src/features/products/selection.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { compileSelection } from "../src/features/products/postgres.js";
import { compileSelection as oracleSelection } from "../src/features/products/sankhya/oracle.js";
import { aggregateSql } from "../src/features/sales/query.js";
import { vrmasterAggregateSql } from "../src/features/sales/vrmaster-query.js";
import { Value } from "typebox/value";

const period = {
  kind: "range" as const,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
};
const reading = (
  mode: Interpretation["productMode"],
  changes: Partial<Interpretation> = {},
): Interpretation => ({
  ...interpretation({ period }),
  productMode: mode,
  ...changes,
});
const selection: ProductSelection = {
  criteria: [
    {
      kind: "text",
      dimension: "description",
      mode: "include",
      text: "banana",
      phrase: "banana",
    },
  ],
};
const config = parseServerConfig({ ORION_ENV: "test" });
function setup(readings: Interpretation[]) {
  const salesInterpreter: SalesInterpreter = {
    interpret: vi.fn(() => Promise.resolve(readings.shift()!)),
  };
  const read = vi.fn<SalesReader["read"]>(() =>
    Promise.resolve({
      current: {
        rows: [{ period: "total", product: null, unit: "BRL", value: "42" }],
        products: [],
        missingWeight: false,
      },
      previous: null,
    }),
  );
  const service = new SalesChat(
    salesInterpreter,
    {
      vrmaster: { read, close: () => Promise.resolve() },
      sankhya: { read, close: () => Promise.resolve() },
    },
    undefined,
    () => new Date("2026-10-12T12:00:00Z"),
  );
  const productInterpreter: ProductInterpreter = {
    interpret: vi.fn(() =>
      Promise.resolve({
        decision: "resolve" as const,
        relation: "new" as const,
        choice: null,
        criteria: [
          {
            dimension: "description",
            mode: "include" as const,
            text: "banana",
            qualifier: null,
            searchTerms: [],
          },
        ],
        unsupportedReason: null,
      }),
    ),
    select: vi.fn(),
  };
  const source = (catalog: typeof vrmasterCatalog): ProductSource => ({
    catalog,
    categoryCandidates: vi.fn(),
    findRecords: vi.fn(() =>
      Promise.resolve([
        {
          record: { id: 1, label: "SYNTHETIC A", active: true },
          covers: [{ id: 1, label: "SYNTHETIC A", active: true }],
        },
        {
          record: { id: 2, label: "SYNTHETIC B", active: true },
          covers: [{ id: 2, label: "SYNTHETIC B", active: true }],
        },
      ]),
    ),
    listRecords: vi.fn(),
    find: vi.fn(() =>
      Promise.resolve({
        total: 305,
        products: [
          {
            code: "1",
            description: "SYNTHETIC BANANA",
            classification: "SYNTHETIC",
          },
        ],
        sections: [],
      }),
    ),
    salesScope: vi.fn((selected: ProductSelection) =>
      Promise.resolve(
        catalog.source.id === "vrmaster"
          ? {
              source: "vrmaster" as const,
              catalogVersion: catalog.version,
              description: "SYNTHETIC CRITERIA",
              keysSql: `SELECT p.id FROM public.produto p WHERE ${compileSelection(catalog, selected, "p", 4).where}`,
              values: compileSelection(catalog, selected, "p", 4).values,
            }
          : {
              source: "sankhya" as const,
              catalogVersion: catalog.version,
              description: "SYNTHETIC CRITERIA",
              keysSql: `SELECT p.CODPROD FROM TGFPRO p WHERE ${oracleSelection(catalog, selected).where}`,
              binds: oracleSelection(catalog, selected).binds,
            },
      ),
    ),
    close: () => Promise.resolve(),
  });
  const vr = source(vrmasterCatalog);
  const sk = source(sankhyaCatalog);
  const resolvers = [
    new ProductResolver(vr, productInterpreter),
    new ProductResolver(sk, productInterpreter),
  ];
  const capability = createSemanticSalesCapability(
    createSalesCapability(config, service),
    service,
    resolvers,
  );
  let context: unknown = null;
  const lookup = {
    productSources: {
      vrmaster: {
        catalogVersion: vrmasterCatalog.version,
        state: { ...emptyProductState, active: selection },
      },
    },
  };
  const execute = async (
    message: string,
    input: Partial<CapabilityInput> = {},
  ) => {
    const outcome = await capability.execute({
      message,
      history: [],
      context,
      contexts: { products: lookup },
      source: "vrmaster",
      signal: new AbortController().signal,
      progress: () => Promise.resolve(),
      trace: noTrace,
      permissions: new Set(["sales:read", "products:read"]),
      ...input,
    });
    context = outcome.context;
    return outcome;
  };
  return {
    execute,
    read,
    vr,
    sk,
    productInterpreter,
    salesInterpreter,
    lookup,
    context: () => context,
  };
}

it("hands the complete validated scope to sales instead of the bounded product display", async () => {
  const env = setup([reading("resolve")]);
  const turn = await env.execute(
    "Quanto vendi dos produtos com banana na descrição em setembro?",
  );
  expect(turn.reply.kind).toBe("answer");
  expect(env.productInterpreter.interpret).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: "sales" }),
    expect.anything(),
    expect.anything(),
  );
  const scope = env.read.mock.calls[0][2]!;
  expect(scope.keysSql).not.toMatch(/LIMIT|SYNTHETIC BANANA/);
  expect(scope.keysSql).toContain("$5::text");
  if (scope.source !== "vrmaster") throw new Error("Wrong synthetic source");
  expect(scope.values).toHaveLength(1);
  expect(turn.reply.result).toMatchObject({
    sections: [
      {
        result: {
          query: { productSearch: null },
          productSelection: {
            source: "vrmaster",
            description: "SYNTHETIC CRITERIA",
          },
        },
      },
    ],
  });
});

it("reuses an explicit same-source lookup even without a prior sales analysis", async () => {
  const env = setup([reading("reuse", { relation: "refine" })]);
  expect(
    (await env.execute("Quanto vendi desses produtos em setembro?")).reply.kind,
  ).toBe("answer");
  expect(env.productInterpreter.interpret).not.toHaveBeenCalled();
  expect(env.vr.salesScope).toHaveBeenCalledWith(selection, expect.anything());
});

it("keeps the original semantic request until a period-only reply completes it", async () => {
  const env = setup([
    reading("resolve", { period: null }),
    reading(null, { relation: "new" }),
  ]);
  expect(
    (await env.execute("Quanto vendi de banana fruta?")).awaiting,
  ).toContain("period");
  expect(env.vr.find).not.toHaveBeenCalled();
  expect(env.read).not.toHaveBeenCalled();
  await env.execute("Em setembro.");
  expect(env.productInterpreter.interpret).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Quanto vendi de banana fruta?" }),
    expect.anything(),
    expect.anything(),
  );
  expect(env.read).toHaveBeenCalledOnce();
});

it("asks for a real product choice before querying sales and resumes the saved period", async () => {
  const env = setup([
    reading("resolve"),
    reading(null, { relation: "answer_pending", period: null }),
  ]);
  vi.mocked(env.productInterpreter.interpret).mockResolvedValueOnce({
    decision: "resolve",
    relation: "new",
    choice: null,
    criteria: [
      {
        dimension: "buyer",
        mode: "include",
        text: "Ana",
        qualifier: null,
        searchTerms: [],
      },
    ],
    unsupportedReason: null,
  });
  const first = await env.execute(
    "Quanto vendi dos produtos da compradora Ana em setembro?",
  );
  expect(first.reply.result).toMatchObject({
    kind: "product_options",
    source: "vrmaster",
  });
  expect(first.awaiting).toEqual(["choice"]);
  expect(env.read).not.toHaveBeenCalled();
  const second = await env.execute("2");
  expect(second.reply.kind).toBe("answer");
  expect(env.read.mock.calls[0][0]).toMatchObject({ startDate: "2026-09-01" });
  expect(env.productInterpreter.interpret).toHaveBeenCalledOnce();
});

it("retains scope for period/measure refinements but clears it for a new overall analysis", async () => {
  const env = setup([
    reading("reuse"),
    reading(null, { relation: "refine", measure: "quantity" }),
    reading(null),
  ]);
  await env.execute("Vendas desses produtos em setembro.");
  await env.execute("E a quantidade vendida?");
  expect(env.read.mock.calls[1][2]).toMatchObject({ source: "vrmaster" });
  await env.execute("Qual o total de todas as vendas em setembro?");
  expect(env.read.mock.calls[2][2]).toBeUndefined();
});

it("clears semantic selection explicitly and preserves literal-filter compatibility", async () => {
  const env = setup([
    reading("reuse"),
    reading("all", { relation: "refine" }),
    reading("literal", {
      filters: [{ dimension: "product", action: "set", text: "maçã" }],
    }),
  ]);
  await env.execute("Vendas desses produtos em setembro.");
  await env.execute("E de todos os produtos?");
  expect(env.read.mock.calls[1][2]).toBeUndefined();
  await env.execute("Vendas cuja descrição contém maçã em setembro.");
  expect(env.read.mock.calls[2][0]).toMatchObject({ productSearch: "maçã" });
  expect(env.read.mock.calls[2][2]).toBeUndefined();
});

it("refuses cross-ERP lookup reuse instead of silently querying all products", async () => {
  const env = setup([reading("reuse")]);
  expect(
    (
      await env.execute("Vendas desses produtos em setembro.", {
        source: "sankhya",
      })
    ).reply.kind,
  ).toBe("clarification");
  expect(env.read).not.toHaveBeenCalled();
  expect(env.sk.salesScope).not.toHaveBeenCalled();
});

it("preserves ordinary literal sales refinements when the interface changes source", async () => {
  const env = setup([
    reading("literal", {
      filters: [{ dimension: "product", action: "set", text: "banana" }],
    }),
    reading(null, { relation: "refine", period: null, measure: "quantity" }),
  ]);
  await env.execute("Vendas de banana em setembro.");
  expect(
    (await env.execute("E a quantidade vendida?", { source: "sankhya" })).reply
      .kind,
  ).toBe("answer");
  expect(env.read.mock.calls[1][0]).toMatchObject({
    productSearch: "banana",
    startDate: "2026-09-01",
    metric: "quantity",
  });
  expect(env.read.mock.calls[1][2]).toBeUndefined();
});

it("aborts after product verification without starting sales or saving scope", async () => {
  const env = setup([reading("reuse")]);
  const controller = new AbortController();
  vi.mocked(env.vr.salesScope!).mockImplementationOnce(() => {
    controller.abort();
    return Promise.reject(new Error("Synthetic cancellation"));
  });
  await expect(
    env.execute("Vendas desses produtos em setembro.", {
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(env.read).not.toHaveBeenCalled();
  expect(env.context()).toBeNull();
});

it("asks for one ERP for semantic all and resumes when the source is selected", async () => {
  const env = setup([
    reading("resolve"),
    reading(null, { relation: "answer_pending", period: null }),
  ]);
  const first = await env.execute(
    "Quanto vendi dos produtos banana em setembro?",
    { source: "all" },
  );
  expect(first.awaiting).toEqual(["source"]);
  expect(env.read).not.toHaveBeenCalled();
  await env.execute("Agora nesta fonte.");
  expect(env.read).toHaveBeenCalledOnce();
});

it("keeps distinct scopes when moving between the two ERP sales contexts", async () => {
  const env = setup([
    reading("resolve"),
    reading("resolve"),
    reading(null, { relation: "refine" }),
  ]);
  await env.execute("Vendas de banana em setembro.");
  await env.execute("Vendas de banana em setembro.", { source: "sankhya" });
  await env.execute("E no período anterior?");
  expect(env.read.mock.calls.map((call) => call[2]?.source)).toEqual([
    "vrmaster",
    "sankhya",
    "vrmaster",
  ]);
});

it("requires products permission before resolution and on retained-scope use", async () => {
  const env = setup([
    reading("resolve"),
    reading("reuse"),
    reading(null, { relation: "refine" }),
  ]);
  await expect(
    env.execute("Vendas de banana fruta em setembro.", {
      permissions: new Set(["sales:read"]),
    }),
  ).rejects.toMatchObject({ code: "AGENT_ACCESS_DENIED" });
  expect(env.vr.find).not.toHaveBeenCalled();
  expect(env.read).not.toHaveBeenCalled();
  await env.execute("Vendas desses produtos em setembro.");
  await expect(
    env.execute("E em setembro?", { permissions: new Set(["sales:read"]) }),
  ).rejects.toMatchObject({ code: "AGENT_ACCESS_DENIED" });
  expect(env.read).toHaveBeenCalledOnce();
});

it("permits literal sales with sales permission alone", async () => {
  const env = setup([
    reading("literal", {
      filters: [{ dimension: "product", action: "set", text: "banana" }],
    }),
  ]);
  await env.execute("Vendas de banana em setembro.", {
    permissions: new Set(["sales:read"]),
  });
  expect(env.read).toHaveBeenCalledOnce();
  expect(env.vr.find).not.toHaveBeenCalled();
});

it("invalidates catalog-versioned selections without broadening to overall sales", async () => {
  const env = setup([reading("reuse"), reading(null, { relation: "refine" })]);
  await env.execute("Vendas desses produtos em setembro.");
  const context = env.context() as {
    salesSources: { vrmaster: { catalogVersion: string } };
  };
  context.salesSources.vrmaster.catalogVersion = "obsolete";
  expect(
    (await env.execute("E em setembro?", { context })).reply.message,
  ).toContain("catálogo de produtos mudou");
  expect(env.read).toHaveBeenCalledOnce();
});

it("does not partially execute unavailable product dimensions or unsupported transaction data", async () => {
  const env = setup([
    reading("resolve"),
    reading(null, { decision: "unsupported", unsupportedReason: "dimension" }),
  ]);
  vi.mocked(env.productInterpreter.interpret).mockResolvedValueOnce({
    decision: "resolve",
    relation: "new",
    choice: null,
    criteria: [
      {
        dimension: "store_status",
        mode: "include",
        text: "ativos",
        qualifier: null,
        searchTerms: [],
      },
    ],
    unsupportedReason: null,
  });
  expect(
    (await env.execute("Vendas dos produtos ativos em setembro.")).reply.kind,
  ).toBe("unavailable");
  expect(
    (await env.execute("Vendas de banana por vendedor em setembro.")).reply
      .kind,
  ).toBe("unavailable");
  expect(env.read).not.toHaveBeenCalled();
});

it("does not query product registrations for an unavailable measure and retains the request for a measure change", async () => {
  const env = setup([
    reading("resolve", { measure: "weight" }),
    reading(null, { relation: "refine", measure: "quantity", period: null }),
  ]);
  expect(
    (await env.execute("Qual o peso vendido de banana fruta em setembro?"))
      .reply.kind,
  ).toBe("unavailable");
  expect(env.vr.find).not.toHaveBeenCalled();
  expect(env.read).not.toHaveBeenCalled();
  expect((await env.execute("E a quantidade vendida?")).reply.kind).toBe(
    "answer",
  );
  expect(env.productInterpreter.interpret).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Qual o peso vendido de banana fruta em setembro?",
    }),
    expect.anything(),
    expect.anything(),
  );
  expect(env.read).toHaveBeenCalledOnce();
});

it("never falls back to all sales when scope verification fails or is cancelled", async () => {
  const env = setup([reading("reuse")]);
  vi.mocked(env.vr.salesScope!).mockRejectedValueOnce(
    new Error("Synthetic metadata refusal"),
  );
  await expect(
    env.execute("Vendas desses produtos em setembro."),
  ).rejects.toThrow("Synthetic metadata refusal");
  expect(env.read).not.toHaveBeenCalled();
  expect(env.context()).toBeNull();
});

it("keeps the semantic model schema strict and rejects simultaneous literal restrictions", () => {
  const value = reading("resolve");
  expect(Value.Check(semanticSalesInterpretationSchema, value)).toBe(true);
  expect(semanticSalesInterpretationSchema.required).toContain("productMode");
  expect(
    interpretationIssues({
      ...value,
      filters: [{ dimension: "product", action: "set", text: "banana" }],
    }),
  ).toContain("semantic_and_literal_filters");
});

it("applies Oracle membership in both eligible controls and final reference rows with shared binds", () => {
  const compiled = oracleSelection(sankhyaCatalog, selection);
  const scope: SalesProductScope = {
    source: "sankhya",
    catalogVersion: "synthetic",
    description: "Synthetic",
    keysSql: `SELECT p.CODPROD FROM TGFPRO p WHERE ${compiled.where}`,
    binds: compiled.binds,
  };
  const query = {
    productSearch: null,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    metric: "net_value" as const,
    groupBy: "total" as const,
    comparison: "none" as const,
  };
  const sql = aggregateSql(query, scope);
  expect(sql.match(/PRO.CODPROD IN \(SELECT/g)).toHaveLength(2);
  expect(sql).not.toContain("'banana'");
  expect(sql).toContain(":v1");
  expect(() => vrmasterAggregateSql(query, scope)).toThrow(
    "Product source mismatch",
  );
});
