import { describe, expect, it } from "vitest";
import {
  answerFor,
  assembleResult,
  businessToday,
  comparisonQuery,
  validateQuery,
  type SalesData,
  type SalesQuery,
} from "../src/features/sales/domain.js";
import {
  aggregateSql,
  queryBindings,
  referenceSalesCte,
} from "../src/features/sales/query.js";
import { parseServerConfig, clientConfigFrom } from "../src/config.js";

const query: SalesQuery = {
  productSearch: "maçã",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  metric: "net_value",
  groupBy: "month",
  comparison: "none",
};
const data = (values: [string, string][]): SalesData => ({
  rows: values.map(([unit, value]) => ({
    period: "2026-07",
    product: null,
    unit,
    value,
  })),
  products: [],
  missingWeight: false,
});
describe("sales business rules", () => {
  it.each(["previous_year", "previous_period"] as const)(
    "rejects %s when the derived period precedes the supported boundary",
    (comparison) => {
      expect(() =>
        validateQuery(
          {
            ...query,
            startDate: "2000-01-01",
            endDate: "2000-01-31",
            comparison,
          },
          "2026-10-01",
        ),
      ).toThrow("SALES_QUERY_INVALID");
    },
  );
  it("bounds monthly zero filling and makes an empty current comparison explicit", () => {
    expect(() =>
      assembleResult(
        { ...query, metric: "quantity" },
        data(Array.from({ length: 200 }, (_, i) => [`UNIT_${i}`, "1"])),
        null,
      ),
    ).toThrow("SALES_RESULT_TOO_LARGE");
    const result = assembleResult(
      { ...query, comparison: "previous_year", groupBy: "product" },
      data([]),
      data([["BRL", "10"]]),
    );
    expect(result.warnings.join(" ")).toContain("Não houve vendas");
    expect(answerFor(result)).toContain("R$");
  });
  it("shows zero months without changing totals and preserves large values in answers", () => {
    const result = assembleResult(
      query,
      data([["BRL", "9999999999999999.99"]]),
      null,
    );
    expect(result.rows.map((row) => [row.period, row.value])).toEqual([
      ["2026-07", "9999999999999999.99"],
      ["2026-08", "0"],
      ["2026-09", "0"],
    ]);
    expect(answerFor(result)).toContain("9.999.999.999.999.999,99");
  });
  it("uses Sao Paulo dates and clamps leap days in year comparisons", () => {
    expect(businessToday(new Date("2026-10-01T01:30:00Z"))).toBe("2026-09-30");
    expect(
      comparisonQuery({
        ...query,
        startDate: "2024-02-29",
        endDate: "2024-02-29",
        comparison: "previous_year",
      }),
    ).toMatchObject({ startDate: "2023-02-28", endDate: "2023-02-28" });
    expect(
      comparisonQuery({ ...query, comparison: "previous_period" }),
    ).toMatchObject({ startDate: "2026-03-31", endDate: "2026-06-30" });
  });
  it.each([
    { startDate: "2026-02-30" },
    { startDate: "2026-10-01" },
    { endDate: "2026-10-02" },
    { startDate: "2024-01-01" },
    { productSearch: " " },
    { startDate: "2026-7-01" },
  ])(
    "rejects impossible, reversed, future, oversized or empty queries %#",
    (change) => {
      expect(() =>
        validateQuery({ ...query, ...change }, "2026-10-01"),
      ).toThrow("SALES_QUERY_INVALID");
    },
  );
  it("keeps decimal precision and separates quantity units and zero bases", () => {
    const result = assembleResult(
      { ...query, metric: "quantity", comparison: "previous_year" },
      data([
        ["KG", "0.1"],
        ["KG", "0.2"],
        ["CX", "5"],
      ]),
      data([
        ["KG", "0"],
        ["CX", "4"],
      ]),
    );
    expect(result.totals).toEqual([
      {
        unit: "KG",
        value: "0.300000000",
        previousValue: "0.000000000",
        changePercent: null,
      },
      {
        unit: "CX",
        value: "5.000000000",
        previousValue: "4.000000000",
        changePercent: "25.00",
      },
    ]);
    expect(
      assembleResult(
        query,
        data([
          ["BRL", "9999999999999999.99"],
          ["BRL", "0.01"],
        ]),
        null,
      ).totals[0].value,
    ).toBe("10000000000000000.00");
    expect(answerFor(assembleResult(query, data([]), null))).toMatch(
      /Não encontrei vendas/,
    );
  });
  it("marks missing weights and retains comparative-only units", () => {
    const result = assembleResult(
      { ...query, metric: "weight", comparison: "previous_year" },
      { ...data([]), missingWeight: true },
      data([["PESOLIQ", "12"]]),
    );
    expect(result.totals[0]).toMatchObject({
      value: "0.000000000",
      changePercent: "-100.00",
    });
    expect(result.warnings.join(" ")).toMatch(/sem PESOLIQ/);
  });
  it("keeps ERP reference semantics and treats SQL-looking descriptions as bound data", () => {
    const malicious = { ...query, productSearch: "maçã%_' OR 1=1 --" };
    expect(aggregateSql(malicious)).not.toContain(malicious.productSearch);
    expect(queryBindings(malicious).productSearch).toBe("MACA%_' OR 1=1 --");
    expect(referenceSalesCte).toContain("SELECT DISTINCT");
    expect(referenceSalesCte).toContain("WHERE TIPMOV = 'V'");
    expect(referenceSalesCte).toContain("CAB.DHTIPOPER = TOP.DHALTER");
    expect(referenceSalesCte).toContain("CAB.STATUSNOTA = 'L'");
    expect(referenceSalesCte).toContain(
      "CAB.DTNEG < TO_DATE(:endDate, 'YYYY-MM-DD') + 1",
    );
    expect(aggregateSql({ ...query, metric: "quantity" })).toContain(
      "VOLUME AS UNIT",
    );
    expect(aggregateSql(query)).toContain("HAVING COUNT(*) > 0");
    expect(referenceSalesCte).toContain("EC.CONTROLE = LOT.CONTROLE");
    expect(queryBindings(query).productPattern).toBe(
      "(^|[^[:alnum:]])MACA([^[:alnum:]]|$)",
    );
    expect(
      queryBindings({ ...query, productSearch: "a+b.c" }).productPattern,
    ).toBe("(^|[^[:alnum:]])A\\+B\\.C([^[:alnum:]]|$)");
    expect(
      queryBindings({ ...query, productSearch: null }).productPattern,
    ).toBeNull();
  });
  it("includes products from both comparison periods and localizes percentage decimals", () => {
    const result = assembleResult(
      { ...query, comparison: "previous_year" },
      {
        ...data([["BRL", "11"]]),
        products: [{ code: "1", description: "CURRENT" }],
      },
      {
        ...data([["BRL", "10"]]),
        products: [
          { code: "1", description: "CURRENT" },
          { code: "2", description: "PREVIOUS ONLY" },
        ],
      },
    );
    expect(result.products.map((product) => product.code)).toEqual(["1", "2"]);
    expect(answerFor(result)).toContain("10,00%");
  });
});
describe("sales configuration security", () => {
  it("rejects partial credentials and any production or public local bypass", () => {
    expect(() =>
      parseServerConfig({ ORION_ENV: "test", SANKHYA_DB_USER: "synthetic" }),
    ).toThrow("incomplete Sankhya");
    for (const changes of [
      { ORION_ENV: "production" },
      { ORION_API_HOST: "0.0.0.0" },
      { IA_MNS_LOCAL_ACCESS: "yes" },
    ])
      expect(() =>
        parseServerConfig({
          ORION_ENV: "test",
          IA_MNS_LOCAL_ACCESS: "true",
          ...changes,
        }),
      ).toThrow();
    const config = parseServerConfig({
      ORION_ENV: "test",
      OPENAI_API_KEY: "synthetic-test-only",
      SANKHYA_DB_USER: "test",
      SANKHYA_DB_PASSWORD: "synthetic",
      SANKHYA_DB_CONNECT_STRING: "db.example.test:1521/ERP",
    });
    expect(clientConfigFrom(config)).toEqual({});
  });
});
