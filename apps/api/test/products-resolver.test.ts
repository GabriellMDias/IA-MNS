import { describe, expect, it, vi } from "vitest";
import type { TSchema } from "typebox";
import { parseServerConfig } from "../src/config.js";
import { createOpenAiModel } from "../src/ai/openai.js";
import {
  catalogProblems,
  loadCatalog,
  type SemanticCatalog,
} from "../src/features/products/catalog.js";
import { createProductCapability } from "../src/features/products/capability.js";
import {
  interpretationSchema,
  selectionChoiceSchema,
  type ProductInterpretation,
  type RequestedCriterion,
  type SelectionChoice,
} from "../src/features/products/interpretation.js";
import {
  createProductInterpreter,
  interpreterInstructions,
  interpreterMessages,
  type ProductInterpreter,
} from "../src/features/products/interpreter.js";
import { productStatements, quote } from "../src/features/products/postgres.js";
import {
  directChoice,
  ProductResolver,
  type ProductTurn,
} from "../src/features/products/resolver.js";
import type {
  HierarchyNode,
  ProductPage,
  ProductSelection,
} from "../src/features/products/selection.js";
import type {
  CategoryCandidate,
  ProductSource,
  RecordMatch,
} from "../src/features/products/source.js";
import {
  emptyProductState,
  loadProductState,
  type ProductState,
} from "../src/features/products/state.js";
import {
  anyTermPattern,
  searchForms,
  significantWords,
} from "../src/features/products/text.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";

// Synthetic, fictional records only: no ERP data appears in these tests.
const node = (
  id: number,
  path: string[],
  codes: number[],
  conventions: string[] = [],
): HierarchyNode => ({
  id,
  level: path.length,
  codes: [...codes, ...Array.from({ length: 5 - codes.length }, () => 0)],
  path,
  conventions,
});
const banana = node(11, ["HORTIFRUTI", "FRUTAS", "BANANA"], [1, 1, 1]);
const bananaProducer = node(
  12,
  ["HORTIFRUTI", "FRUTAS", "BANANA", "PRODUTOR"],
  [1, 1, 1, 1],
);
const bananaChips = node(
  13,
  ["HORTIFRUTI", "FRUTAS", "BANANA", "CHIPS"],
  [1, 1, 1, 2],
);
const yogurt = node(20, ["LATICINIOS", "IOGURTE"], [2, 1]);
const grocery = node(30, ["MERCEARIA"], [3]);
const sweets = node(31, ["MERCEARIA", "DOCES"], [3, 1]);
const candidate = (
  value: HierarchyNode,
  matchedBy: CategoryCandidate["matchedBy"],
  matching = 1,
): CategoryCandidate => ({
  node: value,
  matchedBy,
  products: 10,
  matchingProducts: matching,
  examples: ["PRODUTO SINTETICO"],
});
const record = (id: number, label: string, active = true) => ({
  id,
  label,
  active,
});
const match = (
  id: number,
  label: string,
  covers: number[] = [id],
  active = true,
): RecordMatch => ({
  record: record(id, label, active),
  covers: covers.map((value) => record(value, `${label}-${value}`, active)),
});

type Fake = ProductSource & {
  finds: ProductSelection[];
  candidateCalls: string[][];
  recordCalls: string[][];
};
function fakeSource(
  options: {
    candidates?: (terms: readonly string[]) => CategoryCandidate[];
    textMatches?: number;
    records?: (dimension: string, words: readonly string[]) => RecordMatch[];
    listed?: RecordMatch[];
    page?: ProductPage;
  } = {},
): Fake {
  const finds: ProductSelection[] = [];
  const candidateCalls: string[][] = [];
  const recordCalls: string[][] = [];
  return {
    catalog: vrmasterCatalog,
    finds,
    candidateCalls,
    recordCalls,
    categoryCandidates: (_dimension, terms) => {
      candidateCalls.push([...terms]);
      const candidates = options.candidates?.(terms) ?? [];
      return Promise.resolve({
        candidates,
        truncated: false,
        textMatches:
          options.textMatches ??
          candidates.reduce((sum, item) => sum + item.matchingProducts, 0),
      });
    },
    findRecords: (dimension, words) => {
      recordCalls.push([dimension.id, ...words]);
      return Promise.resolve(options.records?.(dimension.id, words) ?? []);
    },
    listRecords: () => Promise.resolve(options.listed ?? []),
    find: (selection) => {
      finds.push(structuredClone(selection));
      return Promise.resolve(
        options.page ?? {
          total: 2,
          products: [
            { code: "1", description: "PRODUTO A", classification: "X" },
            { code: "2", description: "PRODUTO B", classification: "X" },
          ],
          sections: [{ label: "HORTIFRUTI", count: 2 }],
        },
      );
    },
    close: () => Promise.resolve(),
  };
}

const criterion = (
  dimension: string,
  text: string,
  extra: Partial<RequestedCriterion> = {},
): RequestedCriterion => ({
  dimension,
  mode: "include",
  text,
  qualifier: null,
  searchTerms: [],
  ...extra,
});
const reading = (
  criteria: RequestedCriterion[],
  extra: Partial<ProductInterpretation> = {},
): ProductInterpretation => ({
  decision: "resolve",
  relation: "new",
  choice: null,
  criteria,
  unsupportedReason: null,
  ...extra,
});
function scripted(
  readings: ProductInterpretation[],
  selections: SelectionChoice[] = [],
) {
  const interpret = vi.fn<ProductInterpreter["interpret"]>();
  for (const item of readings) interpret.mockResolvedValueOnce(item);
  const select = vi.fn<ProductInterpreter["select"]>();
  for (const item of selections) select.mockResolvedValueOnce(item);
  return { interpret, select };
}
const choose = (
  include: number[],
  exclude: number[] = [],
  allText = false,
): SelectionChoice => ({
  decision: "select",
  include,
  exclude,
  allText,
  alternatives: [],
});

async function run(
  resolver: ProductResolver,
  message: string,
  state: ProductState = emptyProductState,
  sourceSelected = true,
): Promise<ProductTurn> {
  return resolver.execute({
    message,
    state,
    signal: new AbortController().signal,
    progress: () => Promise.resolve(),
    sourceSelected,
  });
}

describe("semantic catalog", () => {
  it("accepts the VRMaster catalog and enables only verified, readable paths", () => {
    expect(catalogProblems(vrmasterCatalog)).toEqual([]);
    const enabled = vrmasterCatalog.dimensions
      .filter((item) => item.exposure === "enabled")
      .map((item) => item.id);
    expect(enabled).toEqual([
      "category",
      "cost_center",
      "buyer",
      "description",
      "weighable",
    ]);
    // The manufacturer meaning is not reliable; granted status/packaging/family paths await validation.
    expect(
      vrmasterCatalog.dimensions.find((item) => item.id === "manufacturer")
        ?.exposure,
    ).toBe("pending_validation");
    expect(
      vrmasterCatalog.dimensions.find((item) => item.id === "store_status")
        ?.exposure,
    ).toBe("pending_validation");
  });

  const broken = (change: (catalog: SemanticCatalog) => void) => {
    const copy = structuredClone(vrmasterCatalog);
    change(copy);
    return catalogProblems(copy);
  };
  it("grant readiness metadata does not change model instructions or expose pending paths", () => {
    const before = structuredClone(vrmasterCatalog);
    for (const id of ["packaging_type", "product_family", "store_registration"])
      before.entities.find((entity) => entity.id === id)!.access =
        "not_granted";
    for (const id of ["store_status", "packaging", "family"])
      before.dimensions.find((dimension) => dimension.id === id)!.exposure =
        "requires_grant";
    expect(interpreterInstructions(vrmasterCatalog, emptyProductState)).toBe(
      interpreterInstructions(before, emptyProductState),
    );
  });
  it.each([
    [
      "an enabled dimension through an unreadable table",
      (catalog: SemanticCatalog) => {
        catalog.entities.find((item) => item.id === "packaging_type")!.access =
          "not_granted";
        catalog.dimensions.find((item) => item.id === "packaging")!.exposure =
          "enabled";
        catalog.dimensions.find((item) => item.id === "packaging")!.blocker =
          null;
      },
      "unreadable packaging_type",
    ],
    [
      "an enabled dimension through a hypothesis",
      (catalog: SemanticCatalog) => {
        catalog.relationships.find(
          (item) => item.id === "product_buyer",
        )!.status = "hypothesis";
      },
      "hypothesis product_buyer",
    ],
    [
      "an unknown column",
      (catalog: SemanticCatalog) => {
        catalog.relationships.find(
          (item) => item.id === "product_buyer",
        )!.join[0].from = "id_vendedor";
      },
      "unknown product.id_vendedor",
    ],
    [
      "a broken path",
      (catalog: SemanticCatalog) => {
        catalog.dimensions.find((item) => item.id === "cost_center")!.path = [
          "section_cost_center",
        ];
      },
      "path breaks",
    ],
    [
      "a verified relationship without its constraint",
      (catalog: SemanticCatalog) => {
        catalog.relationships.find(
          (item) => item.id === "product_buyer",
        )!.evidence.declared = null;
      },
      "verified without a constraint",
    ],
    [
      "an unsafe identifier",
      (catalog: SemanticCatalog) => {
        catalog.entities[0].table.name = 'produto"; DROP TABLE x; --';
      },
      "schema",
    ],
    [
      "a disabled dimension without its blocker",
      (catalog: SemanticCatalog) => {
        catalog.dimensions.find((item) => item.id === "family")!.blocker = null;
      },
      "states no blocker",
    ],
  ])("rejects %s", (_name, change, expected) => {
    expect(broken(change).join("\n")).toContain(expected);
    expect(() =>
      loadCatalog(
        (() => {
          const copy = structuredClone(vrmasterCatalog);
          change(copy);
          return copy;
        })(),
      ),
    ).toThrow("Invalid semantic catalog");
  });
});

describe("PostgreSQL compilation", () => {
  const selection: ProductSelection = {
    criteria: [
      {
        kind: "hierarchy",
        dimension: "category",
        mode: "include",
        text: "banana'; DROP TABLE produto; --",
        qualifier: null,
        include: [
          { node: banana, scope: "subtree" },
          { node: yogurt, scope: "matching_text" },
        ],
        anywhere: false,
        exclude: [bananaChips],
        terms: ["banana'; DROP TABLE produto; --"],
      },
      {
        kind: "entity",
        dimension: "cost_center",
        mode: "include",
        text: "SECOS",
        matched: [record(6, "SECOS")],
        values: [record(6, "SECOS"), record(10, "SECOS")],
      },
      {
        kind: "entity",
        dimension: "buyer",
        mode: "exclude",
        text: "Ana",
        matched: [record(4, "ANA")],
        values: [record(4, "ANA")],
      },
      {
        kind: "text",
        dimension: "description",
        mode: "include",
        text: "prata",
        phrase: "PRATA",
      },
      {
        kind: "flag",
        dimension: "weighable",
        mode: "exclude",
        text: "pesáveis",
      },
    ],
  };

  it("binds every value and uses only quoted catalog identifiers", () => {
    const statements = productStatements(vrmasterCatalog, selection, 200);
    for (const sql of [
      statements.list,
      statements.count,
      statements.sections!,
    ]) {
      expect(sql).not.toContain("DROP");
      expect(sql).not.toContain("SECOS");
      expect(sql).not.toContain("PRATA");
      expect(sql).not.toMatch(/\$\d+(?!::)/);
    }
    expect(statements.values).toContainEqual([11]);
    expect(statements.values).toContainEqual([20]);
    expect(statements.values).toContainEqual([13]);
    expect(statements.values).toContainEqual([6, 10]);
    expect(statements.values).toContainEqual([4]);
    expect(statements.list).toContain('FROM "public"."produto" p');
    expect(statements.list).toContain("LIMIT 201");
    // Cost centers follow the section (level-1 node) of each product.
    expect(statements.count).toContain('(p."mercadologico1") IN (SELECT t');
    expect(statements.count).toMatch(
      /"nivel" = 1 AND \(t\d+\."id_centrocusto"\) IN/,
    );
    // Exclusions never lose rows to NULLs; inclusions require TRUE.
    expect(statements.count).toMatch(/"id_comprador"\) IN .*\) IS NOT TRUE/s);
    expect(statements.count).toContain('p."pesavel" = $');
    expect(statements.count).toContain(") IS NOT TRUE");
    // The hierarchy is matched by code prefix, so subtrees need no joins.
    expect(statements.count).toContain('."nivel" < 2 OR');
  });

  it("binds a pattern only when a clause reads it", () => {
    const { values, count } = productStatements(
      vrmasterCatalog,
      {
        criteria: [
          {
            kind: "hierarchy",
            dimension: "category",
            mode: "include",
            text: "banana",
            qualifier: null,
            include: [{ node: banana, scope: "subtree" }],
            anywhere: false,
            exclude: [],
            terms: ["banana"],
          },
        ],
      },
      10,
    );
    expect(values).toEqual([[11]]);
    expect(count).not.toContain("$2");
  });

  it("refuses unsafe identifiers, limits and disabled dimensions", () => {
    expect(() => quote('produto"')).toThrow("Unsafe catalog identifier");
    expect(() => productStatements(vrmasterCatalog, selection, 0)).toThrow();
    expect(() => productStatements(vrmasterCatalog, selection, 501)).toThrow();
    expect(() =>
      productStatements(
        vrmasterCatalog,
        {
          criteria: [
            {
              kind: "flag",
              dimension: "category",
              mode: "include",
              text: "x",
            },
          ],
        },
        10,
      ),
    ).toThrow("Criterion does not match its dimension");
  });

  it("compiles one-to-many status paths as semi-joins, never joins", () => {
    const catalog = structuredClone(vrmasterCatalog);
    catalog.entities.find((item) => item.id === "store_registration")!.access =
      "granted";
    const status = catalog.dimensions.find(
      (item) => item.id === "store_status",
    )!;
    status.exposure = "enabled";
    status.blocker = null;
    expect(catalogProblems(catalog)).toEqual([]);
    const { count, values } = productStatements(
      catalog,
      {
        criteria: [
          {
            kind: "status",
            dimension: "store_status",
            mode: "include",
            text: "ativos",
          },
        ],
      },
      10,
    );
    expect(count).toContain(
      '(p."id") IN (SELECT t1."id_produto" FROM "public"."produtocomplemento" t1 WHERE t1."id_situacaocadastro" = $1::integer)',
    );
    expect(count).not.toMatch(/\bJOIN\b/);
    expect(values).toEqual([1]);
  });
});

describe("product text", () => {
  it("matches singular and plural forms as whole words", () => {
    expect(searchForms("banana")).toEqual(["banana", "bananas"]);
    expect(searchForms("paes")).toContain("pao");
    expect(searchForms("pao")).toContain("paes");
    expect(significantWords("Quais produtos do comprador")).toEqual([
      "quais",
      "produtos",
      "comprador",
    ]);
    const pattern = new RegExp(
      anyTermPattern(["pão de forma"])!
        .replaceAll("[^[:alnum:]]", "[^A-Z0-9]")
        .replaceAll("[[:alnum:]]", "[A-Z0-9]"),
    );
    expect(pattern.test("PAO DE FORMA INTEGRAL")).toBe(true);
    expect(pattern.test("PAES DE FORMA")).toBe(true);
    expect(pattern.test("PAOZINHO DE FORMATO")).toBe(false);
  });
});

describe("model boundary schemas", () => {
  // OpenAI strict function calling needs every property required and no
  // additional properties at every object level.
  function strictProblems(schema: TSchema, path = "$"): string[] {
    const value = schema as Record<string, unknown>;
    const problems: string[] = [];
    if (value.type === "object") {
      const properties = Object.keys(
        (value.properties as Record<string, unknown>) ?? {},
      );
      if (value.additionalProperties !== false)
        problems.push(`${path} allows additional properties`);
      const required = (value.required as string[] | undefined) ?? [];
      for (const key of properties)
        if (!required.includes(key))
          problems.push(`${path}.${key} is optional`);
      for (const key of properties)
        problems.push(
          ...strictProblems(
            (value.properties as Record<string, TSchema>)[key],
            `${path}.${key}`,
          ),
        );
    }
    for (const nested of ["anyOf", "items"] as const) {
      const child = value[nested];
      if (Array.isArray(child))
        child.forEach((item, index) =>
          problems.push(
            ...strictProblems(item as TSchema, `${path}.${nested}[${index}]`),
          ),
        );
      else if (child)
        problems.push(...strictProblems(child, `${path}.${nested}`));
    }
    return problems;
  }
  it("are strict-mode compatible", () => {
    expect(strictProblems(interpretationSchema(vrmasterCatalog))).toEqual([]);
    expect(strictProblems(selectionChoiceSchema)).toEqual([]);
  });
  it("expose every catalog dimension and no table or column names", () => {
    const instructions = interpreterInstructions(
      vrmasterCatalog,
      emptyProductState,
    );
    for (const dimension of vrmasterCatalog.dimensions)
      expect(instructions).toContain(`"id":"${dimension.id}"`);
    for (const entity of vrmasterCatalog.entities) {
      expect(instructions).not.toContain(`public.${entity.table.name}`);
      for (const column of entity.columns.filter((item) =>
        item.name.includes("_"),
      ))
        expect(instructions).not.toContain(column.name);
    }
    expect(instructions).not.toContain("mercadologico1");
    expect(instructions).not.toContain("descricaocompleta");
  });
});

describe("product resolver", () => {
  it("selects among real candidates and compiles the chosen subtree minus exclusions", async () => {
    const source = fakeSource({
      candidates: () => [
        candidate(banana, "name", 3),
        candidate(bananaProducer, "child", 2),
        candidate(bananaChips, "child", 1),
        candidate(yogurt, "products", 4),
      ],
    });
    const model = scripted(
      [reading([criterion("category", "banana", { qualifier: "fruta" })])],
      [choose([1], [3])],
    );
    const resolver = new ProductResolver(source, model);
    const turn = await run(resolver, "Quais produtos são banana fruta?");
    expect(turn.reply.kind).toBe("answer");
    expect(source.finds[0].criteria[0]).toMatchObject({
      kind: "hierarchy",
      include: [{ node: { id: 11 }, scope: "subtree" }],
      exclude: [{ id: 13 }],
      anywhere: false,
      terms: ["banana"],
    });
    const selected = model.select.mock.calls[0][0];
    expect(selected.criterion.qualifier).toBe("fruta");
    expect(selected.candidates).toHaveLength(4);
    expect(turn.state.active?.criteria).toHaveLength(1);
    expect(turn.state.pending).toBeNull();
    expect(turn.awaiting).toBeNull();
    expect(turn.reply.result).toMatchObject({
      kind: "products",
      total: 2,
      criteria: [
        {
          dimension: "category",
          values: ["HORTIFRUTI › FRUTAS › BANANA"],
          excluded: ["HORTIFRUTI › FRUTAS › BANANA › CHIPS"],
        },
      ],
    });
    // The answer transcript keeps the person's words, not ERP values.
    expect(turn.state.transcript.at(-1)?.text).toBe(
      "classificação mercadológica “banana” (fruta)",
    );
  });

  it("selects a single named node holding every mention without a model choice", async () => {
    const source = fakeSource({
      candidates: () => [candidate(yogurt, "name", 4)],
    });
    const model = scripted([reading([criterion("category", "iogurte")])]);
    const turn = await run(
      new ProductResolver(source, model),
      "Quais são iogurtes?",
    );
    expect(model.select).not.toHaveBeenCalled();
    expect(turn.reply.kind).toBe("answer");
    expect(source.finds[0].criteria[0]).toMatchObject({
      include: [{ node: { id: 20 }, scope: "subtree" }],
    });
  });

  it("asks between interpretations and resolves the numbered answer without the model", async () => {
    const source = fakeSource({
      candidates: () => [
        candidate(banana, "name", 3),
        candidate(yogurt, "products", 4),
      ],
      textMatches: 7,
    });
    const model = scripted(
      [reading([criterion("category", "banana")])],
      [
        {
          decision: "ambiguous",
          include: [],
          exclude: [],
          allText: false,
          alternatives: [
            { include: [1], exclude: [], allText: false },
            { include: [], exclude: [], allText: true },
          ],
        },
      ],
    );
    const resolver = new ProductResolver(source, model);
    const asked = await run(resolver, "Quais produtos são banana?");
    expect(asked.reply.kind).toBe("clarification");
    expect(asked.awaiting).toEqual(["choice"]);
    expect(asked.reply.result).toMatchObject({
      kind: "product_options",
      options: [
        { number: 1, label: "HORTIFRUTI › FRUTAS › BANANA" },
        { number: 2, label: "todos os produtos com “banana” na descrição (7)" },
      ],
    });
    expect(source.finds).toHaveLength(0);
    const answered = await run(resolver, "2", asked.state);
    expect(model.interpret).toHaveBeenCalledTimes(1);
    expect(answered.reply.kind).toBe("answer");
    expect(source.finds[0].criteria[0]).toMatchObject({
      anywhere: true,
      include: [],
    });
    const again = await run(resolver, "9", asked.state);
    expect(again.reply.kind).toBe("clarification");
    expect(again.state.pending).toEqual(asked.state.pending);
  });

  it("resolves names deterministically and keeps personal names away from the model", async () => {
    const source = fakeSource({
      records: (dimension, words) =>
        dimension === "buyer" && words.includes("costa")
          ? [match(7, "BRUNO COSTA"), match(8, "BRUNA COSTA")]
          : [],
    });
    const model = scripted([reading([criterion("buyer", "comprador Costa")])]);
    const resolver = new ProductResolver(source, model);
    const asked = await run(resolver, "Quais produtos são do comprador Costa?");
    // The dimension word is not part of the name.
    expect(source.recordCalls[0]).toEqual(["buyer", "costa"]);
    expect(asked.reply.kind).toBe("clarification");
    expect(asked.reply.message).not.toContain("BRUNO");
    expect(asked.reply.message).not.toContain("BRUNA");
    expect(asked.state.pending?.options.every((item) => item.personal)).toBe(
      true,
    );
    const instructions = interpreterInstructions(vrmasterCatalog, asked.state);
    expect(instructions).not.toContain("BRUNO");
    expect(instructions).toContain("(nome não compartilhado)");
    const messages = interpreterMessages({
      message: "o Bruno",
      state: asked.state,
    });
    expect(JSON.stringify(messages)).not.toContain("BRUNA");
    // The person's own words choose the option without a model call.
    expect(directChoice("Bruna Costa", asked.state.pending!.options)).toBe(2);
    expect(directChoice("Costa", asked.state.pending!.options)).toBeNull();
    const answered = await run(resolver, "Bruna Costa", asked.state);
    expect(model.interpret).toHaveBeenCalledTimes(1);
    expect(source.finds[0].criteria[0]).toMatchObject({
      kind: "entity",
      values: [{ id: 8 }],
    });
    expect(answered.state.transcript.at(-1)?.text).not.toContain("BRUNA");
  });

  it("treats a matched record and its hierarchy descendants as one value", async () => {
    const source = fakeSource({
      records: () => [match(6, "SECOS", [6, 10]), match(10, "SECOS", [10])],
    });
    const model = scripted([reading([criterion("cost_center", "SECOS")])]);
    const turn = await run(
      new ProductResolver(source, model),
      "Produtos do centro de custo SECOS",
    );
    expect(turn.reply.kind).toBe("answer");
    expect(source.finds[0].criteria[0]).toMatchObject({
      matched: [{ id: 6 }],
      values: [{ id: 6 }, { id: 10 }],
    });
  });

  it("offers the most specific records when a name matches none", async () => {
    const source = fakeSource({
      records: () => [],
      listed: [
        match(1, "SETORES", [1, 2, 3, 6, 10]),
        match(3, "HORTIFRUTI", [3]),
        match(6, "SECOS", [6, 10]),
        match(10, "SECOS", [10]),
      ],
    });
    const model = scripted([reading([criterion("cost_center", "Frios")])]);
    const turn = await run(
      new ProductResolver(source, model),
      "Produtos do centro de custo Frios",
    );
    expect(turn.reply.kind).toBe("clarification");
    expect(turn.reply.result).toMatchObject({
      options: [
        { number: 1, label: "HORTIFRUTI" },
        { number: 2, label: "SECOS" },
      ],
    });
  });

  it("combines different paths with AND and disjoint values of one dimension with OR", async () => {
    const source = fakeSource({
      records: (dimension, words) =>
        dimension === "cost_center"
          ? [match(10, "SECOS")]
          : words.includes("ana")
            ? [match(4, "ANA LIMA")]
            : [match(5, "CARLOS SOUZA")],
    });
    const model = scripted([
      reading([
        criterion("cost_center", "SECOS"),
        criterion("buyer", "Ana"),
        criterion("buyer", "Carlos"),
      ]),
    ]);
    const turn = await run(
      new ProductResolver(source, model),
      "Produtos do centro de custo SECOS da Ana ou do Carlos",
    );
    const criteria = source.finds[0].criteria;
    expect(criteria).toHaveLength(2);
    expect(criteria[1]).toMatchObject({
      dimension: "buyer",
      text: "Ana, Carlos",
      values: [{ id: 4 }, { id: 5 }],
    });
    expect(turn.reply.kind).toBe("answer");
  });

  it("keeps overlapping classifications as an intersection", async () => {
    const source = fakeSource({
      candidates: (terms) =>
        terms[0] === "mercearia"
          ? [candidate(grocery, "name", 5)]
          : [candidate(sweets, "name", 2)],
    });
    const model = scripted([
      reading([
        criterion("category", "mercearia"),
        criterion("category", "doces"),
      ]),
    ]);
    await run(
      new ProductResolver(source, model),
      "Produtos de mercearia que são doces",
    );
    expect(source.finds[0].criteria).toHaveLength(2);
  });

  it("reports contradictory criteria instead of an empty list", async () => {
    const source = fakeSource({ records: () => [match(10, "SECOS")] });
    const model = scripted([
      reading([
        criterion("cost_center", "SECOS"),
        criterion("cost_center", "SECOS", { mode: "exclude" }),
      ]),
    ]);
    const turn = await run(
      new ProductResolver(source, model),
      "Produtos do centro de custo SECOS exceto os do centro de custo SECOS",
    );
    expect(turn.reply.kind).toBe("clarification");
    expect(turn.reply.message).toContain("se contradizem");
    expect(source.finds).toHaveLength(0);
  });

  it("keeps an inclusion that an exclusion explicitly spares", async () => {
    const sweetCorn = node(32, ["MERCEARIA", "DOCES", "MILHO DOCE"], [3, 1, 1]);
    const source = fakeSource({
      candidates: (terms) =>
        terms[0] === "milho doce"
          ? [candidate(sweetCorn, "name", 1)]
          : [candidate(sweets, "name", 3), candidate(sweetCorn, "child", 1)],
    });
    const model = scripted(
      [
        reading([
          criterion("category", "milho doce"),
          criterion("category", "doces", { mode: "exclude" }),
        ]),
      ],
      [choose([1], [2])],
    );
    const turn = await run(
      new ProductResolver(source, model),
      "Produtos de milho doce, exceto doces",
    );
    expect(turn.reply.kind).toBe("answer");
    expect(source.finds).toHaveLength(1);
  });

  it("drops values the person never wrote", async () => {
    const source = fakeSource({ records: () => [match(4, "ANA LIMA")] });
    const model = scripted([reading([criterion("buyer", "Ana")])]);
    const turn = await run(
      new ProductResolver(source, model),
      "Quais produtos?",
    );
    expect(turn.reply.kind).toBe("clarification");
    expect(source.recordCalls).toHaveLength(0);
  });

  it("explains unavailable dimensions and sales requests without querying", async () => {
    const source = fakeSource();
    const unavailable = await run(
      new ProductResolver(
        source,
        scripted([reading([criterion("store_status", "ativos")])]),
      ),
      "Quais produtos ativos?",
    );
    expect(unavailable.reply.kind).toBe("unsupported");
    expect(unavailable.reply.message).toContain("situação nas lojas");
    const sales = await run(
      new ProductResolver(
        source,
        scripted([
          reading([], {
            decision: "unsupported",
            unsupportedReason: "sales_or_metrics",
          }),
        ]),
      ),
      "Quanto vendi de banana?",
    );
    expect(sales.reply.message).toContain("não calcula vendas");
    expect(source.finds).toHaveLength(0);
  });

  it("refuses a source without a product catalog before calling the model", async () => {
    const model = scripted([]);
    const turn = await run(
      new ProductResolver(fakeSource(), model),
      "Quais produtos são banana?",
      emptyProductState,
      false,
    );
    expect(turn.reply.kind).toBe("unsupported");
    expect(model.interpret).not.toHaveBeenCalled();
  });

  it("refines the active request, replacing only the restated dimension", async () => {
    const source = fakeSource({
      records: (dimension, words) =>
        dimension === "cost_center"
          ? [match(10, "SECOS")]
          : words.includes("ana")
            ? [match(4, "ANA LIMA")]
            : [match(5, "CARLOS SOUZA")],
    });
    const model = scripted([
      reading([criterion("cost_center", "SECOS"), criterion("buyer", "Ana")]),
      reading([criterion("buyer", "Carlos")], { relation: "refine" }),
      reading([criterion("buyer", "Carlos")], { relation: "refine" }),
    ]);
    const resolver = new ProductResolver(source, model);
    const first = await run(
      resolver,
      "Produtos do centro de custo SECOS da Ana",
    );
    await run(resolver, "E do Carlos?", first.state);
    expect(
      source.finds[1].criteria.map((item) => [item.dimension, item.text]),
    ).toEqual([
      ["cost_center", "SECOS"],
      ["buyer", "Carlos"],
    ]);
    const orphan = await run(resolver, "E do Carlos?");
    expect(orphan.reply.kind).toBe("clarification");
    expect(orphan.reply.message).toContain("A qual consulta");
  });

  it("loads only trusted stored state", () => {
    expect(loadProductState({ version: 1, active: "x" })).toEqual(
      emptyProductState,
    );
    expect(loadProductState(null)).toEqual(emptyProductState);
  });
});

describe("product capability", () => {
  const capability = (resolver: ProductResolver) =>
    createProductCapability(resolver);
  const input = (source: "sankhya" | "vrmaster" | "all") => ({
    message: "Produtos da Ana",
    history: [],
    context: null,
    permissions: new Set(["products:read", "products_vrmaster:read"]),
    signal: new AbortController().signal,
    progress: () => Promise.resolve(),
    trace: {
      invocation: () => undefined,
      note: () => undefined,
      content: () => undefined,
    },
    source,
  });
  it("follows the interface source selection and notes that Sankhya was not read", async () => {
    const source = fakeSource({ records: () => [match(4, "ANA LIMA")] });
    const model = scripted([
      reading([criterion("buyer", "Ana")]),
      reading([criterion("buyer", "Ana")]),
    ]);
    const products = capability(new ProductResolver(source, model));
    const refused = await products.execute(input("sankhya"));
    expect(refused.reply).toMatchObject({
      kind: "unavailable",
      capabilityId: "products",
    });
    const all = await products.execute(input("all"));
    expect(all.reply.kind).toBe("answer");
    const notes = (result: unknown) => (result as { notes: string[] }).notes;
    expect(
      notes(all.reply.result).some((note) => note.includes("Sankhya")),
    ).toBe(true);
    const vrmaster = await products.execute(input("vrmaster"));
    expect(notes(vrmaster.reply.result).join()).not.toContain("Sankhya");
  });
});

describe("OpenAI product interpreter", () => {
  it("retrieves the verified VR Master section abbreviation for synonym grounding", () => {
    expect(
      interpreterInstructions(
        vrmasterCatalog,
        emptyProductState,
        "hortifrúti pesável",
      ),
    ).toContain("registrado como FLV neste cadastro");
    expect(
      interpreterInstructions(vrmasterCatalog, emptyProductState),
    ).toContain("Include verified ERP abbreviations");
  });
  const config = parseServerConfig({
    ORION_ENV: "test",
    OPENAI_API_KEY: "synthetic-test-key",
  });
  const completed = (name: string, args: unknown) =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "function_call",
            name,
            call_id: "call_synthetic",
            arguments: JSON.stringify(args),
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const interpreter = () =>
    createProductInterpreter(
      createOpenAiModel(config, "synthetic-model"),
      vrmasterCatalog,
    );

  it.each(["caller", "provider"])(
    "cancels %s waits without retrying the chargeable request",
    async (reason) => {
      let started!: () => void;
      const fetching = new Promise<void>((resolve) => {
        started = resolve;
      });
      const fetchMock = vi.fn(
        (_url: unknown, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () =>
              reject(new DOMException("Aborted", "AbortError"));
            if (options.signal?.aborted) abort();
            else
              options.signal?.addEventListener("abort", abort, { once: true });
            started();
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const controller = new AbortController();
      try {
        const model = createOpenAiModel(config, "synthetic-model", {
          timeoutMs: reason === "provider" ? 40 : 2000,
        });
        const result = expect(
          createProductInterpreter(model, vrmasterCatalog).interpret(
            { message: "Produtos", state: emptyProductState },
            controller.signal,
          ),
        ).rejects.toMatchObject({
          code: "PRODUCTS_PROVIDER_UNAVAILABLE",
          boundary: { provider: "openai", stage: "interpretation" },
        });
        await fetching;
        if (reason === "caller") controller.abort();
        await result;
        expect(fetchMock).toHaveBeenCalledOnce();
      } finally {
        controller.abort();
        vi.unstubAllGlobals();
      }
    },
  );

  it("accepts a valid strict reading", async () => {
    const fetchMock = vi.fn((_url: unknown, options: RequestInit) => {
      const body = JSON.parse(
        typeof options.body === "string" ? options.body : "{}",
      ) as {
        tools: { strict: boolean; name: string }[];
        store: boolean;
      };
      expect(body.store).toBe(false);
      expect(body.tools).toMatchObject([
        { strict: true, name: "interpret_product_request" },
      ]);
      return Promise.resolve(
        completed(
          "interpret_product_request",
          reading([criterion("buyer", "Ana")]),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      interpreter().interpret(
        { message: "Produtos da Ana", state: emptyProductState },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ criteria: [{ dimension: "buyer" }] });
    vi.unstubAllGlobals();
  });

  it.each([
    reading([criterion("supplier_sql", "x")]),
    reading([], { decision: "unsupported", unsupportedReason: null }),
    reading([], { choice: 1 }),
    { ...reading([]), sql: "SELECT 1" },
  ])("rejects an invalid reading %#", async (value) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(completed("interpret_product_request", value)),
      ),
    );
    await expect(
      interpreter().interpret(
        { message: "x", state: emptyProductState },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "PRODUCTS_PROVIDER_UNAVAILABLE",
      boundary: { provider: "openai", stage: "interpretation" },
    });
    vi.unstubAllGlobals();
  });

  it("rejects selections of candidates that were not offered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(completed("select_product_categories", choose([3]))),
      ),
    );
    await expect(
      interpreter().select(
        {
          message: "banana",
          dimension: vrmasterCatalog.dimensions[0],
          criterion: criterion("category", "banana"),
          candidates: [candidate(banana, "name")],
          textMatches: 1,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ boundary: { stage: "selection" } });
    vi.unstubAllGlobals();
  });
});
