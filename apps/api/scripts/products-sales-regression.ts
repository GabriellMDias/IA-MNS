/** Opt-in Runtime-only reconciliation. Never loads administrative credentials. */
import { mkdir, writeFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import { parseServerConfig } from "../src/config.js";
import { createOpenAiModel } from "../src/ai/openai.js";
import { noTrace } from "../src/ai/trace.js";
import {
  createVrmasterPool,
  vrmasterConnection,
  vrmasterTransactionSettings,
} from "../src/vrmaster-connection.js";
import { createSalesReaders } from "../src/features/sales/readers.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import { createModelInterpreter } from "../src/features/sales/interpreter.js";
import {
  comparisonQuery,
  type SalesQuery,
  type SalesRow,
} from "../src/features/sales/domain.js";
import {
  vrmasterAggregateSql,
  vrmasterParameters,
} from "../src/features/sales/vrmaster-query.js";
import { aggregateSql, queryBindings } from "../src/features/sales/query.js";
import type { SalesSource } from "../src/features/sales/sources.js";
import type {
  ProductSelection,
  ResolvedCriterion,
} from "../src/features/products/selection.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import {
  createProductInterpreter,
  productModelTimeoutMs,
} from "../src/features/products/interpreter.js";
import { createSemanticSalesCapability } from "../src/features/products/sales.js";
import { createVrmasterProductSource } from "../src/features/products/vrmaster/source.js";
import { createSankhyaProductSource } from "../src/features/products/sankhya/source.js";
import { createOracleProductReader } from "../src/features/products/sankhya/session.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { emptyProductState } from "../src/features/products/state.js";

async function main() {
  const config = parseServerConfig(process.env);
  const vr = vrmasterConnection(config);
  if (
    config.environment === "production" ||
    !vr ||
    vr.user !== "ia_mns" ||
    config.sankhyaUser?.toUpperCase() !== "IA_MNS_RO"
  )
    throw new Error("Development Runtime readers are required");
  const model = createOpenAiModel(config, config.openaiModel, {
    timeoutMs: productModelTimeoutMs,
  });
  const sources = {
    vrmaster: createVrmasterProductSource(vr),
    sankhya: createSankhyaProductSource(config),
  };
  const resolvers = [
    new ProductResolver(
      sources.vrmaster,
      createProductInterpreter(model, vrmasterCatalog),
    ),
    new ProductResolver(
      sources.sankhya,
      createProductInterpreter(model, sankhyaCatalog),
    ),
  ];
  const readers = createSalesReaders(config);
  const service = new SalesChat(
    createModelInterpreter(createOpenAiModel(config, config.openaiModel)),
    readers,
  );
  const capability = createSemanticSalesCapability(
    createSalesCapability(config, service),
    service,
    resolvers,
  );
  const pgPool = createVrmasterPool(vr);
  const oracle = createOracleProductReader(config);
  const query: SalesQuery = {
    productSearch: null,
    startDate: "2026-09-15",
    endDate: "2026-09-15",
    metric: "net_value",
    groupBy: "total",
    comparison: "previous_year",
  };
  const findings: {
    id: string;
    status: "passed" | "failed";
    ms: number;
    ai: boolean;
  }[] = [];
  const normalized = (rows: readonly SalesRow[]) =>
    rows
      .map((row) =>
        JSON.stringify([
          row.period,
          row.product,
          row.unit,
          new Decimal(row.value).toFixed(9),
        ]),
      )
      .sort();
  const entity = (
    dimension: string,
    id: string | number,
  ): ResolvedCriterion => ({
    kind: "entity",
    dimension,
    mode: "include",
    text: String(id),
    matched: [{ id, label: "Local verified value", active: null }],
    values: [{ id, label: "Local verified value", active: null }],
  });
  try {
    const costDimension = vrmasterCatalog.dimensions.find(
      (item) => item.id === "cost_center",
    )!;
    const matches = await sources.vrmaster.findRecords(
      costDimension,
      ["secos"],
      AbortSignal.timeout(45000),
    );
    if (!matches.length)
      throw new Error("Required cost-center reference is absent");
    const costs = [
      ...new Map(
        matches
          .flatMap((match) => match.covers)
          .map((value) => [value.id, value]),
      ).values(),
    ];
    const cost: ResolvedCriterion = {
      kind: "entity",
      dimension: "cost_center",
      mode: "include",
      text: "SECOS",
      matched: matches.map((match) => match.record),
      values: costs,
    };
    const scenarios: {
      id: string;
      erp: SalesSource;
      selection: ProductSelection;
      reference: string;
      values?: unknown[];
      binds?: Record<string, string>;
      message?: string;
    }[] = [
      {
        id: "vr-description",
        erp: "vrmaster",
        selection: {
          criteria: [
            {
              kind: "text",
              dimension: "description",
              mode: "include",
              text: "banana prata",
              phrase: "BANANA PRATA",
            },
          ],
        },
        reference: "",
        message: undefined,
      },
      {
        id: "vr-indirect-cost-center",
        erp: "vrmaster",
        selection: { criteria: [cost] },
        reference:
          "EXISTS(SELECT 1 FROM public.mercadologico m WHERE m.nivel=1 AND m.mercadologico1=selected.mercadologico1 AND m.id_centrocusto=ANY($5::integer[]))",
        values: [costs.map((value) => value.id)],
        message:
          "Qual o valor vendido dos produtos do centro de custo SECOS em 15 de setembro de 2026, comparado ao mesmo período do ano passado?",
      },
      {
        id: "sk-base-unit",
        erp: "sankhya",
        selection: { criteria: [entity("unit", "KG")] },
        reference:
          "EXISTS(SELECT 1 FROM TGFPRO P WHERE P.CODPROD=FILTERED.CODPROD AND P.CODVOL=:referenceUnit)",
        binds: { referenceUnit: "KG" },
      },
      {
        id: "sk-indirect-alternate-unit",
        erp: "sankhya",
        selection: { criteria: [entity("alternate_unit", "KG")] },
        reference:
          "EXISTS(SELECT 1 FROM TGFVOA V WHERE V.CODPROD=FILTERED.CODPROD AND V.CODVOL=:referenceUnit)",
        binds: { referenceUnit: "KG" },
        message:
          "Qual o valor vendido dos produtos com unidade alternativa KG em 15 de setembro de 2026, comparado ao mesmo período do ano passado?",
      },
    ];
    for (const scenario of scenarios) {
      const started = performance.now();
      try {
        const signal = AbortSignal.timeout(90000);
        const resolver = resolvers.find(
          (item) => item.catalog.source.id === scenario.erp,
        )!;
        const scope = await resolver.salesScope(scenario.selection, signal);
        const actual = await readers[scenario.erp]!.read(query, signal, scope);
        const expected: SalesRow[][] = [];
        for (const period of [query, comparisonQuery(query)!]) {
          if (scenario.erp === "vrmaster") {
            const client = await pgPool.connect();
            try {
              for (const statement of vrmasterTransactionSettings)
                await client.query(statement);
              const referenceQuery =
                scenario.id === "vr-description"
                  ? { ...period, productSearch: "banana prata" }
                  : period;
              const sql = scenario.reference
                ? vrmasterAggregateSql(referenceQuery).replace(
                    "FROM base\nGROUP BY",
                    `FROM base JOIN public.produto selected ON selected.id=base.id_produto WHERE ${scenario.reference}\nGROUP BY`,
                  )
                : vrmasterAggregateSql(referenceQuery);
              expected.push(
                (
                  await client.query<SalesRow>(sql, [
                    ...vrmasterParameters(referenceQuery),
                    ...(scenario.values ?? []),
                  ])
                ).rows,
              );
            } finally {
              try {
                await client.query("ROLLBACK");
              } finally {
                client.release();
              }
            }
          } else {
            expected.push(
              await oracle.read(signal, async (session) =>
                (
                  await session.query(
                    aggregateSql(period).replace(
                      "FROM FILTERED GROUP BY",
                      `FROM FILTERED WHERE ${scenario.reference} GROUP BY`,
                    ),
                    { ...queryBindings(period), ...scenario.binds },
                    501,
                  )
                ).map((row) => ({
                  period: String(row.PERIOD),
                  product:
                    row.PRODUCT === null
                      ? null
                      : typeof row.PRODUCT === "string"
                        ? row.PRODUCT
                        : (() => {
                            throw new Error("Invalid reference product label");
                          })(),
                  unit: String(row.UNIT),
                  value: String(row.VALUE),
                })),
              ),
            );
          }
        }
        const same = (left: SalesRow[], right: SalesRow[]) =>
          JSON.stringify(normalized(left)) ===
          JSON.stringify(normalized(right));
        if (
          !same(actual.current.rows, expected[0]) ||
          !same(actual.previous!.rows, expected[1])
        )
          throw new Error("Independent selection reconciliation failed");
        findings.push({
          id: scenario.id,
          status: "passed",
          ms: Math.round(performance.now() - started),
          ai: false,
        });
        if (process.argv.includes("--model") && scenario.message) {
          const modelStarted = performance.now();
          const outcome = await capability.execute({
            message: scenario.message,
            history: [],
            context: null,
            contexts: {},
            permissions: new Set(["sales:read", "products:read"]),
            source: scenario.erp,
            signal: AbortSignal.timeout(90000),
            progress: () => Promise.resolve(),
            trace: noTrace,
          });
          const answer = outcome.reply.result as {
            sections?: {
              result?: {
                rows: SalesRow[];
                comparison: { rows: SalesRow[] } | null;
                productSelection?: { source: string };
              };
            }[];
          } | null;
          const result = answer?.sections?.[0].result;
          if (
            outcome.reply.kind !== "answer" ||
            result?.productSelection?.source !== scenario.erp ||
            !same(result.rows, expected[0]) ||
            !result.comparison ||
            !same(result.comparison.rows, expected[1])
          )
            throw new Error("Model pipeline reconciliation failed");
          findings.push({
            id: `${scenario.id}-model`,
            status: "passed",
            ms: Math.round(performance.now() - modelStarted),
            ai: true,
          });
          const reuseStarted = performance.now();
          const reused = await capability.execute({
            message:
              "Quanto vendi desses produtos em 15 de setembro de 2026, comparado ao mesmo período do ano passado?",
            history: [],
            context: null,
            contexts: {
              products: {
                productSources: {
                  [scenario.erp]: {
                    catalogVersion: resolver.catalog.version,
                    state: { ...emptyProductState, active: scenario.selection },
                  },
                },
              },
            },
            permissions: new Set(["sales:read", "products:read"]),
            source: scenario.erp,
            signal: AbortSignal.timeout(90000),
            progress: () => Promise.resolve(),
            trace: noTrace,
          });
          const reuseAnswer = reused.reply.result as typeof answer;
          const reuseResult = reuseAnswer?.sections?.[0].result;
          if (
            reused.reply.kind !== "answer" ||
            reuseResult?.productSelection?.source !== scenario.erp ||
            !same(reuseResult.rows, expected[0]) ||
            !reuseResult.comparison ||
            !same(reuseResult.comparison.rows, expected[1])
          )
            throw new Error("Lookup reuse reconciliation failed");
          findings.push({
            id: `${scenario.id}-lookup-reuse-model`,
            status: "passed",
            ms: Math.round(performance.now() - reuseStarted),
            ai: true,
          });
        }
      } catch {
        findings.push({
          id: scenario.id,
          status: "failed",
          ms: Math.round(performance.now() - started),
          ai: process.argv.includes("--model") && !!scenario.message,
        });
      }
    }
  } finally {
    const closed = await Promise.allSettled([
      service.close(),
      ...resolvers.map((resolver) => resolver.close()),
      pgPool.end(),
      oracle.close(),
    ]);
    if (closed.some((result) => result.status === "rejected"))
      findings.push({ id: "cleanup", status: "failed", ms: 0, ai: false });
  }
  await mkdir("evals/.local/products", { recursive: true });
  await writeFile(
    "evals/.local/products/sales-regression.json",
    JSON.stringify({ ranAt: new Date().toISOString(), findings }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: findings.filter((item) => item.status === "passed").length,
      failed: findings.filter((item) => item.status === "failed").length,
      findings,
    }),
  );
  if (findings.some((item) => item.status === "failed")) process.exitCode = 1;
}
await main().catch(() => {
  console.error(
    "Read-only product-sales verification failed; no credential or record details are printed.",
  );
  process.exitCode = 1;
});
