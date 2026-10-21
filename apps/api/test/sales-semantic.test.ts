import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import { salesAnalysisSchema } from "../src/features/sales/contracts.js";
import {
  compileSemanticSalesPlan,
  executeSemanticSales,
  type SemanticSalesPlan,
} from "../src/features/sales/semantic.js";
import {
  rowsMatchScope,
  validateReadBatch,
  type SalesReader,
} from "../src/features/sales/reader.js";
import {
  aggregateSql,
  referenceSalesCte,
} from "../src/features/sales/query.js";
import {
  vrmasterAggregateSql,
  vrmasterSalesCte,
} from "../src/features/sales/vrmaster-query.js";
import type { SalesProductScope } from "../src/features/sales/product-scope.js";

const plan: SemanticSalesPlan = {
  metrics: ["net_value", "quantity"],
  dimensions: ["month", "product"],
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  comparison: "previous_year",
};
const today = "2026-10-12";
const signal = () => new AbortController().signal;
function reader() {
  const readMany = vi.fn<NonNullable<SalesReader["readMany"]>>((queries) =>
    Promise.resolve(
      queries.map((query) => ({
        current: {
          rows: [
            {
              period: "2026-07",
              product: "1 - Synthetic apple",
              unit: query.metric === "net_value" ? "BRL" : "KG",
              value: "0.1",
            },
            {
              period: "2026-08",
              product: "1 - Synthetic apple",
              unit: query.metric === "net_value" ? "BRL" : "KG",
              value: "0.2",
            },
          ],
          products: [],
          missingWeight: false,
        },
        previous: {
          rows: [
            {
              period: "2025-07",
              product: "1 - Synthetic apple",
              unit: query.metric === "net_value" ? "BRL" : "KG",
              value: "0.2",
            },
          ],
          products: [],
          missingWeight: false,
        },
      })),
    ),
  );
  return {
    readMany,
    read: vi.fn<SalesReader["read"]>(),
    close: () => Promise.resolve(),
  };
}

describe("semantic sales compiler", () => {
  it("composes multiple reviewed metrics and both dimensions without changing the reference relations", () => {
    const queries = compileSemanticSalesPlan(plan, today);
    expect(queries.map((query) => [query.metric, query.groupBy])).toEqual([
      ["net_value", "month_product"],
      ["quantity", "month_product"],
    ]);
    expect(aggregateSql(queries[0])).toContain(referenceSalesCte);
    expect(aggregateSql(queries[0])).toContain(
      "TO_CHAR(DTNEG, 'YYYY-MM') AS PERIOD",
    );
    expect(aggregateSql(queries[0])).toContain(
      "TO_CHAR(CODPROD) || ' - ' || PRODUTO AS PRODUCT",
    );
    expect(vrmasterAggregateSql(queries[0])).toContain(vrmasterSalesCte);
    expect(vrmasterAggregateSql(queries[0])).toContain(
      "to_char(base.data, 'YYYY-MM') AS period",
    );
    expect(vrmasterAggregateSql(queries[0])).toContain("base.id_produto::text");
    expect(
      compileSemanticSalesPlan({ ...plan, dimensions: [] }, today)[0].groupBy,
    ).toBe("total");
  });
  it.each([
    { ...plan, sql: "SELECT * FROM secret" },
    { ...plan, source: "other" },
    { ...plan, dimensions: ["customer"] },
    { ...plan, metrics: ["profit"] },
    { ...plan, metrics: ["quantity", "quantity"] },
    { ...plan, dimensions: ["month", "month"] },
    { ...plan, startDate: "2025-01-01" },
    { ...plan, endDate: "2026-12-31" },
    { ...plan, startDate: "2026-02-30" },
  ])(
    "rejects unreviewed identifiers, injected properties and unbounded dates %#",
    (invalid) => {
      expect(() => compileSemanticSalesPlan(invalid, today)).toThrow(
        "SALES_QUERY_INVALID",
      );
    },
  );
  it("keeps month-product rows unique without merging products or units", () => {
    const query = compileSemanticSalesPlan(plan, today)[0];
    const row = { period: "2026-07", product: "1 - apple", unit: "BRL" };
    expect(rowsMatchScope(query, [row, { ...row, product: "2 - apple" }])).toBe(
      true,
    );
    expect(rowsMatchScope(query, [row, row])).toBe(false);
    expect(rowsMatchScope(query, [{ ...row, product: null }])).toBe(false);
    expect(rowsMatchScope(query, [{ ...row, period: "2026-06" }])).toBe(false);
  });
  it("rejects mixed-scope or duplicate batches before an adapter connects", () => {
    const queries = compileSemanticSalesPlan(plan, today);
    expect(() => validateReadBatch(queries, "vrmaster")).not.toThrow();
    expect(() =>
      validateReadBatch(
        [queries[0], { ...queries[1], startDate: "2026-08-01" }],
        "vrmaster",
      ),
    ).toThrow("SALES_QUERY_INVALID");
    expect(() =>
      validateReadBatch([queries[0], queries[0]], "vrmaster"),
    ).toThrow("SALES_QUERY_INVALID");
    expect(() =>
      validateReadBatch([{ ...queries[0], metric: "weight" }], "vrmaster"),
    ).toThrow("SALES_QUERY_INVALID");
  });
});

describe("semantic sales execution", () => {
  it("executes one snapshot per source and returns exact decimal totals with independent provenance", async () => {
    const sk = reader(),
      vr = reader();
    const result = await executeSemanticSales({
      plan,
      permissions: new Set([
        "sales:read",
        "sales_sankhya:read",
        "sales_vrmaster:read",
      ]),
      selection: "all",
      readers: { sankhya: sk, vrmaster: vr },
      today,
      signal: signal(),
    });
    expect(Value.Check(salesAnalysisSchema, result)).toBe(true);
    expect(sk.readMany).toHaveBeenCalledOnce();
    expect(vr.readMany).toHaveBeenCalledOnce();
    expect(result.panels).toHaveLength(2);
    expect(
      result.panels[0].sections.map((section) => section.result?.totals[0]),
    ).toEqual([
      {
        unit: "BRL",
        value: "0.30",
        previousValue: "0.20",
        changePercent: "50.00",
      },
      {
        unit: "BRL",
        value: "0.30",
        previousValue: "0.20",
        changePercent: "50.00",
      },
    ]);
    expect(sk.read).not.toHaveBeenCalled();
  });
  it("reports unsupported VRMaster weight without removing supported measures", async () => {
    const vr = reader();
    const result = await executeSemanticSales({
      plan: { ...plan, metrics: ["quantity", "weight"] },
      permissions: new Set([
        "sales:read",
        "sales_sankhya:read",
        "sales_vrmaster:read",
      ]),
      selection: "vrmaster",
      readers: { vrmaster: vr },
      today,
      signal: signal(),
    });
    expect(vr.readMany.mock.calls[0][0]).toHaveLength(1);
    expect(result.panels[1].sections[0]).toMatchObject({
      source: "vrmaster",
      status: "unsupported",
      reason: "measure",
      result: null,
    });
  });
  it("denies missing sales/product authorization and cross-ERP scopes before all reads", async () => {
    const vr = reader();
    const scope: SalesProductScope = {
      source: "vrmaster",
      keysSql: "SELECT id FROM public.produto WHERE id = $5",
      values: [1],
      catalogVersion: "synthetic",
      description: "Synthetic selection",
    };
    const input = {
      plan,
      permissions: new Set([
        "sales:read",
        "sales_sankhya:read",
        "sales_vrmaster:read",
      ]),
      selection: "vrmaster" as const,
      readers: { vrmaster: vr },
      today,
      signal: signal(),
      productScope: scope,
    };
    await expect(executeSemanticSales(input)).rejects.toThrow(
      "SALES_ACCESS_DENIED",
    );
    await expect(
      executeSemanticSales({
        ...input,
        productScope: undefined,
        permissions: new Set(),
      }),
    ).rejects.toThrow("SALES_ACCESS_DENIED");
    await expect(
      executeSemanticSales({
        ...input,
        permissions: new Set([
          "sales:read",
          "sales_sankhya:read",
          "sales_vrmaster:read",
          "products:read",
          "products_sankhya:read",
          "products_vrmaster:read",
        ]),
        selection: "all",
      }),
    ).rejects.toThrow("SALES_QUERY_INVALID");
    expect(vr.readMany).not.toHaveBeenCalled();
  });
  it("keeps the complete verified product membership separate from display lists", async () => {
    const vr = reader();
    const scope: SalesProductScope = {
      source: "vrmaster",
      keysSql: "SELECT id FROM public.produto WHERE id >= $5",
      values: [1],
      catalogVersion: "synthetic",
      description: "Synthetic complete selection",
    };
    const result = await executeSemanticSales({
      plan,
      permissions: new Set([
        "sales:read",
        "sales_sankhya:read",
        "sales_vrmaster:read",
        "products:read",
        "products_sankhya:read",
        "products_vrmaster:read",
      ]),
      selection: "vrmaster",
      readers: { vrmaster: vr },
      today,
      signal: signal(),
      productScope: scope,
    });
    expect(vr.readMany.mock.calls[0][2]).toBe(scope);
    expect(result.panels[0].sections[0].result?.productSelection).toEqual({
      source: "vrmaster",
      catalogVersion: "synthetic",
      description: "Synthetic complete selection",
    });
    expect(JSON.stringify(result)).not.toContain("keysSql");
  });
  it("honors cancellation before reading", async () => {
    const vr = reader();
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeSemanticSales({
        plan,
        permissions: new Set([
          "sales:read",
          "sales_sankhya:read",
          "sales_vrmaster:read",
        ]),
        selection: "vrmaster",
        readers: { vrmaster: vr },
        today,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(vr.readMany).not.toHaveBeenCalled();
  });
});
