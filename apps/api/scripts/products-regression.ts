/**
 * Live regression of product lookup (`pnpm -C apps/api products:regression`):
 * the real resolver, the configured OpenAI model and the real VRMaster through
 * the restricted read-only account. Each turn is checked against the expected
 * outcome and, when the case supplies one, an independent hand-written SELECT
 * whose complete id set must equal the resolver's complete selection.
 *
 * The dataset holds real product codes and expectations, so it lives in the
 * ignored `evals/.local/products/` folder; `products-regression.example.json`
 * documents the format with fictional values. Reports go to the same folder.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { createOpenAiModel } from "../src/ai/openai.js";
import { parseServerConfig } from "../src/config.js";
import { TurnTrace } from "../src/features/agent/trace.js";
import { entityOf } from "../src/features/products/catalog.js";
import { ProductFailure } from "../src/features/products/errors.js";
import {
  createProductInterpreter,
  productInterpreterVersion,
  productModelTimeoutMs,
  productSelectorVersion,
} from "../src/features/products/interpreter.js";
import {
  compileSelection,
  quote,
  tableOf,
} from "../src/features/products/postgres.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import {
  emptyProductState,
  type ProductState,
} from "../src/features/products/state.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { createVrmasterProductSource } from "../src/features/products/vrmaster/source.js";
import {
  vrmasterConnection,
  vrmasterTransactionSettings,
} from "../src/vrmaster-connection.js";

const optional = Type.Optional;
const expectation = Type.Object(
  {
    kind: optional(
      Type.Union([
        Type.Literal("answer"),
        Type.Literal("clarification"),
        Type.Literal("unsupported"),
      ]),
    ),
    /** Dimension ids of the executed criteria, in order. */
    dimensions: optional(Type.Array(Type.String())),
    total: optional(Type.Integer({ minimum: 0 })),
    minTotal: optional(Type.Integer({ minimum: 0 })),
    maxTotal: optional(Type.Integer({ minimum: 0 })),
    /** Product codes that must be selected. */
    includes: optional(Type.Array(Type.String())),
    /** Product codes that must not be selected. */
    excludes: optional(Type.Array(Type.String())),
    /** Independent SELECT returning a column "id": the exact expected set. */
    sql: optional(Type.String({ pattern: "^\\s*(?:SELECT|WITH)\\b" })),
    /** At least this many options in a clarification. */
    options: optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
const datasetSchema = Type.Object(
  {
    version: Type.Literal(1),
    cases: Type.Array(
      Type.Object(
        {
          id: Type.String({ minLength: 1 }),
          description: optional(Type.String()),
          turns: Type.Array(
            Type.Object(
              {
                message: Type.String({ minLength: 1 }),
                source: optional(
                  Type.Union([
                    Type.Literal("vrmaster"),
                    Type.Literal("all"),
                    Type.Literal("sankhya"),
                  ]),
                ),
                expect: expectation,
              },
              { additionalProperties: false },
            ),
            { minItems: 1 },
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
type Expectation = Static<typeof expectation>;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readOnly<T>(
  client: pg.Client,
  work: () => Promise<T>,
): Promise<T> {
  for (const statement of vrmasterTransactionSettings)
    await client.query(statement);
  try {
    return await work();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function main() {
  const datasetPath = resolve(
    option("--dataset") ?? "evals/.local/products/regression.json",
  );
  const only = option("--case");
  const parsed: unknown = JSON.parse(await readFile(datasetPath, "utf8"));
  if (!Value.Check(datasetSchema, parsed)) {
    const first = [...Value.Errors(datasetSchema, parsed)][0];
    throw new Error(
      `Invalid dataset: ${first?.instancePath ?? "/"} ${first?.message ?? ""}`,
    );
  }
  const config = parseServerConfig({
    ...process.env,
    ORION_ENV: "development",
  });
  const connection = vrmasterConnection(config);
  if (!connection || !config.openaiApiKey) {
    console.error("VRMASTER_DB_* and OPENAI_API_KEY must be configured.");
    process.exit(2);
  }
  const model = createOpenAiModel(config, config.openaiModel, {
    timeoutMs: productModelTimeoutMs,
  });
  const resolver = new ProductResolver(
    createVrmasterProductSource(connection),
    createProductInterpreter(model, vrmasterCatalog),
  );
  const client = new pg.Client({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl:
      connection.ssl === "verify-full" ? { rejectUnauthorized: true } : false,
    application_name: "ia-mns-product-regression",
  });
  await client.connect();
  const root = entityOf(vrmasterCatalog, vrmasterCatalog.root);
  const results: unknown[] = [];
  let failed = 0;
  let retried = 0;
  try {
    for (const evalCase of parsed.cases) {
      if (only && evalCase.id !== only) continue;
      let state: ProductState = structuredClone(emptyProductState);
      for (const [index, turn] of evalCase.turns.entries()) {
        const problems: string[] = [];
        const started = performance.now();
        let trace = new TurnTrace("metadata");
        let outcome: Awaited<ReturnType<ProductResolver["execute"]>> | null =
          null;
        for (let attempt = 0; attempt < 2 && !outcome; attempt++) {
          trace = new TurnTrace("metadata");
          try {
            outcome = await resolver.execute({
              message: turn.message,
              state,
              signal: AbortSignal.timeout(90000),
              progress: () => Promise.resolve(),
              trace,
              sourceSelected: (turn.source ?? "vrmaster") !== "sankhya",
            });
          } catch (error) {
            // One retry of a transient model provider error, as in evaluations.
            const transient =
              error instanceof ProductFailure &&
              error.boundary.provider === "openai" &&
              attempt === 0;
            if (!transient) {
              problems.push(
                `failed: ${error instanceof ProductFailure ? `${error.code} ${JSON.stringify(error.boundary)}` : String(error).slice(0, 200)}`,
              );
              break;
            }
            retried++;
          }
        }
        let selected: string[] | null = null;
        if (outcome) {
          state = outcome.state;
          const expected: Expectation = turn.expect;
          if (expected.kind && outcome.reply.kind !== expected.kind)
            problems.push(`kind ${outcome.reply.kind}`);
          const result = outcome.reply.result;
          if (expected.options !== undefined)
            if (
              result?.kind !== "product_options" ||
              result.options.length < expected.options
            )
              problems.push("missing options");
          if (outcome.reply.kind === "answer" && state.active) {
            const dimensions = state.active.criteria.map(
              (item) => item.dimension,
            );
            if (
              expected.dimensions &&
              dimensions.join() !== expected.dimensions.join()
            )
              problems.push(`dimensions ${dimensions.join()}`);
            const { where, values } = compileSelection(
              vrmasterCatalog,
              state.active,
            );
            selected = await readOnly(client, async () =>
              (
                await client.query<{ id: number }>(
                  `SELECT p.${quote(root.key[0])} AS id FROM ${tableOf(root)} p WHERE ${where}`,
                  [...values],
                )
              ).rows.map((row) => String(row.id)),
            );
            const total = selected.length;
            if (result?.kind === "products" && result.total !== total)
              problems.push(
                `answer total ${result.total} != selection ${total}`,
              );
            if (expected.total !== undefined && total !== expected.total)
              problems.push(`total ${total}`);
            if (expected.minTotal !== undefined && total < expected.minTotal)
              problems.push(`total ${total} < ${expected.minTotal}`);
            if (expected.maxTotal !== undefined && total > expected.maxTotal)
              problems.push(`total ${total} > ${expected.maxTotal}`);
            const set = new Set(selected);
            for (const code of expected.includes ?? [])
              if (!set.has(code)) problems.push(`missing ${code}`);
            for (const code of expected.excludes ?? [])
              if (set.has(code)) problems.push(`unexpected ${code}`);
            if (expected.sql) {
              const independent = await readOnly(client, async () =>
                (await client.query<{ id: number }>(expected.sql!)).rows.map(
                  (row) => String(row.id),
                ),
              );
              const other = new Set(independent);
              const extra = selected.filter((code) => !other.has(code));
              const lacking = independent.filter((code) => !set.has(code));
              if (extra.length || lacking.length)
                problems.push(
                  `independent SQL differs: ${extra.length} extra (${extra.slice(0, 10).join(",")}), ${lacking.length} missing (${lacking.slice(0, 10).join(",")})`,
                );
            }
          } else if (expected.kind === "answer")
            problems.push("no executed selection");
        }
        const metadata = trace.metadata({
          kind:
            outcome?.reply.kind === "unsupported"
              ? "unavailable"
              : (outcome?.reply.kind ?? "failed"),
          capabilityId: "products",
          failureCode: null,
        });
        const passed = problems.length === 0;
        if (!passed) failed++;
        console.log(
          `${passed ? "passed" : "FAILED"}  ${evalCase.id}#${index + 1}  ${Math.round(performance.now() - started)} ms${passed ? "" : `  ${problems.join("; ")}`}`,
        );
        results.push({
          case: evalCase.id,
          turn: index + 1,
          passed,
          problems,
          kind: outcome?.reply.kind ?? null,
          selected: selected?.length ?? null,
          latencyMs: Math.round(performance.now() - started),
          invocations: metadata.invocations.map((item) => ({
            stage: item.stage,
            latencyMs: item.latencyMs,
            inputTokens: item.inputTokens,
            outputTokens: item.outputTokens,
          })),
          notes: metadata.notes,
        });
      }
    }
  } finally {
    await client.end();
    await resolver.close();
  }
  const report = {
    ranAt: new Date().toISOString(),
    model: model.model,
    interpreter: productInterpreterVersion,
    selector: productSelectorVersion,
    catalog: vrmasterCatalog.version,
    turns: results.length,
    failed,
    retriedAfterProviderErrors: retried,
    results,
  };
  const out = resolve(
    option("--out") ??
      `evals/.local/products/runs/${report.ranAt.replace(/[^0-9]/g, "").slice(0, 14)}.json`,
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Turns: ${results.length - failed}/${results.length} passed; retried after provider errors: ${retried}\nReport: ${out}`,
  );
  if (failed > 0) process.exit(1);
}

await main();
