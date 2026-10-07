import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Type, type Static, type TSchema } from "typebox";
import { Value } from "typebox/value";
import {
  comparisonSchema,
  groupingSchema,
  measureSchema,
} from "../src/features/sales/analysis.js";
import { clarificationSchema } from "../src/features/sales/conversation-state.js";
import {
  sourceSchema,
  sourceSelectionSchema,
} from "../src/features/sales/contracts.js";
import { interpretationFixtureSchema, routeFixtureSchema } from "./fixtures.js";

const object = { additionalProperties: false };
const optional = <T extends TSchema>(schema: T) => Type.Optional(schema);
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
const isoDate = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const filterExpectation = Type.Object(
  { product: optional(nullable(Type.String())) },
  object,
);

/** Expected executed query fields; product absence is checked unless allowed. */
export const queryExpectationSchema = Type.Object(
  {
    productSearch: optional(nullable(Type.String())),
    startDate: optional(isoDate),
    endDate: optional(isoDate),
    metric: optional(measureSchema),
    groupBy: optional(groupingSchema),
    comparison: optional(comparisonSchema),
  },
  object,
);
export type QueryExpectation = Static<typeof queryExpectationSchema>;

/** Retained conversation state after the turn. */
export const stateExpectationSchema = Type.Object(
  {
    pending: optional(
      nullable(
        Type.Object(
          {
            awaiting: optional(Type.Array(Type.String())),
            measure: optional(nullable(measureSchema)),
            filters: optional(filterExpectation),
          },
          object,
        ),
      ),
    ),
    active: optional(
      nullable(
        Type.Object(
          {
            measure: optional(measureSchema),
            filters: optional(filterExpectation),
            groupBy: optional(groupingSchema),
            comparison: optional(comparisonSchema),
          },
          object,
        ),
      ),
    ),
  },
  object,
);
export type StateExpectation = Static<typeof stateExpectationSchema>;

export const turnExpectationSchema = Type.Object(
  {
    /** Capability id or conversational intent the turn must reach. */
    route: optional(Type.String({ maxLength: 80 })),
    kind: optional(
      Type.Union([
        Type.Literal("answer"),
        Type.Literal("clarification"),
        Type.Literal("unavailable"),
        Type.Literal("conversation"),
      ]),
    ),
    clarification: optional(clarificationSchema),
    /** Sources actually queried, in order; [] when none ran. */
    sources: optional(Type.Array(sourceSchema, { maxItems: 2 })),
    /** Whether the reply tells that the message names another source. */
    sourceNotice: optional(Type.Boolean()),
    query: optional(queryExpectationSchema),
    /** Accept product filters the expectation does not name. */
    allowExtraFilters: optional(Type.Boolean()),
    state: optional(stateExpectationSchema),
  },
  object,
);
export type TurnExpectation = Static<typeof turnExpectationSchema>;

export const evalTurnSchema = Type.Object(
  {
    user: Type.String({ minLength: 1, maxLength: 2000 }),
    /** Source selected in the interface for this turn; sankhya when absent. */
    source: optional(sourceSelectionSchema),
    /**
     * Reference model outputs for deterministic replay. They describe a
     * correct reading, or a recorded faulty one the system must withstand.
     */
    fixture: optional(
      Type.Object(
        {
          route: optional(routeFixtureSchema),
          interpretation: optional(interpretationFixtureSchema),
        },
        object,
      ),
    ),
    expect: optional(turnExpectationSchema),
  },
  object,
);
export type EvalTurn = Static<typeof evalTurnSchema>;

export const caseSchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-z0-9][a-z0-9/-]{2,120}$" }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    /** Only active cases gate quality; candidates await human review. */
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("candidate"),
      Type.Literal("quarantined"),
    ]),
    source: Type.Union([
      Type.Literal("curated"),
      Type.Literal("trace"),
      Type.Literal("synthetic"),
      Type.Literal("simulation"),
    ]),
    tags: Type.Array(Type.String({ pattern: "^[a-z0-9-]{1,40}$" }), {
      maxItems: 12,
    }),
    /** Business date in America/Sao_Paulo for relative periods. */
    today: isoDate,
    notes: optional(Type.String({ maxLength: 2000 })),
    /** Initial agent contexts, for reproducing a conversation mid-way. */
    context: optional(Type.Record(Type.String(), Type.Unknown())),
    provenance: optional(
      Type.Object(
        {
          reviewed: Type.Boolean(),
          generator: optional(Type.String()),
          model: optional(Type.String()),
          createdAt: optional(Type.String()),
          turnId: optional(Type.String()),
        },
        object,
      ),
    ),
    turns: Type.Array(evalTurnSchema, { minItems: 1, maxItems: 12 }),
  },
  object,
);
export type EvalCase = Static<typeof caseSchema>;

export const datasetSchema = Type.Object(
  {
    version: Type.Literal(1),
    description: Type.String({ minLength: 1 }),
    cases: Type.Array(caseSchema),
  },
  object,
);
export type Dataset = Static<typeof datasetSchema>;
export type LoadedCase = EvalCase & { file: string };

export const evalRoot = resolve(import.meta.dirname);
export const curatedDirectory = join(evalRoot, "datasets", "curated");
/** Ignored local workspace for candidates and run reports; never committed. */
export const localDirectory = join(evalRoot, ".local");
export const candidateDirectory = join(localDirectory, "candidates");

export class DatasetError extends Error {}

export function parseDataset(file: string, value: unknown): Dataset {
  if (!Value.Check(datasetSchema, value)) {
    const first = [...Value.Errors(datasetSchema, value)][0];
    throw new DatasetError(
      `${basename(file)}: ${first ? `${first.instancePath || "/"} ${first.message}` : "invalid dataset"}`,
    );
  }
  for (const item of value.cases) {
    if (item.source === "curated" && item.status === "candidate")
      throw new DatasetError(`${item.id}: curated cases cannot be candidates`);
    if (item.status === "active" && item.provenance?.reviewed === false)
      throw new DatasetError(`${item.id}: unreviewed cases cannot be active`);
  }
  return value;
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => join(directory, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Loads dataset files (or every file in directories) and rejects duplicate ids. */
export async function loadCases(
  sources: readonly string[] = [curatedDirectory],
): Promise<{
  cases: LoadedCase[];
  files: { file: string; description: string }[];
}> {
  const files: string[] = [];
  for (const source of sources)
    files.push(
      ...(source.endsWith(".json")
        ? [resolve(source)]
        : await jsonFiles(source)),
    );
  const cases: LoadedCase[] = [];
  const descriptions: { file: string; description: string }[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const dataset = parseDataset(
      file,
      JSON.parse(await readFile(file, "utf8")) as unknown,
    );
    descriptions.push({
      file: basename(file),
      description: dataset.description,
    });
    for (const item of dataset.cases) {
      if (seen.has(item.id))
        throw new DatasetError(`${item.id}: duplicate case id`);
      seen.add(item.id);
      cases.push({ ...item, file: basename(file) });
    }
  }
  return { cases, files: descriptions };
}
