import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogProblems } from "../src/features/products/catalog.js";
import { createProductCapability } from "../src/features/products/capability.js";
import {
  interpreterInstructions,
  type ProductInterpreter,
} from "../src/features/products/interpreter.js";
import { retrieveProductMetadata } from "../src/features/products/metadata-retrieval.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import type { ProductSelection } from "../src/features/products/selection.js";
import type { ProductSource } from "../src/features/products/source.js";
import {
  emptyProductState,
  loadProductState,
} from "../src/features/products/state.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import {
  compileSelection,
  productStatements,
  quote,
} from "../src/features/products/sankhya/oracle.js";
import {
  createOracleProductReader,
  privilegeProblems,
} from "../src/features/products/sankhya/session.js";
import {
  groupTree,
  matchingDomain,
  metadataProblems,
} from "../src/features/products/sankhya/source.js";
import { sankhyaMetadata } from "../src/features/products/sankhya/snapshot.js";

const driver = vi.hoisted(() => ({
  execute: vi.fn(),
  rollback: vi.fn(),
  close: vi.fn(),
  break: vi.fn(),
  poolClose: vi.fn(),
}));
vi.mock("oracledb", () => ({
  default: {
    thin: false,
    OUT_FORMAT_OBJECT: 1,
    DB_TYPE_CLOB: 2,
    STRING: 3,
    createPool: vi.fn(() =>
      Promise.resolve({
        getConnection: () => Promise.resolve(driver),
        close: driver.poolClose,
      }),
    ),
  },
}));
const signal = () => new AbortController().signal;
const named = (dimension: string, id: string | number): ProductSelection => ({
  criteria: [
    {
      kind: "entity",
      dimension,
      mode: "include",
      text: "synthetic",
      matched: [{ id, label: "synthetic", active: null }],
      values: [{ id, label: "synthetic", active: null }],
    },
  ],
});

describe("reviewed Sankhya catalog and Oracle compiler", () => {
  it("retains VR Master validity and records separate executable dictionary paths", () => {
    expect(catalogProblems(vrmasterCatalog)).toEqual([]);
    expect(catalogProblems(sankhyaCatalog)).toEqual([]);
    expect(
      sankhyaCatalog.dimensions.filter((item) => item.exposure === "enabled"),
    ).toHaveLength(12);
    expect(
      sankhyaCatalog.relationships.every(
        (item) => item.dictionary && item.evidence.validated,
      ),
    ).toBe(true);
  });
  it("binds string unit codes and rejects unknown, disabled and hostile identifiers", () => {
    const compiled = compileSelection(
      sankhyaCatalog,
      named("unit", "KG' OR 1=1 --"),
    );
    expect(compiled.where).not.toContain("1=1");
    expect(Object.values(compiled.binds)).toContain("KG' OR 1=1 --");
    expect(() => quote("tgfpro;delete")).toThrow();
    expect(() =>
      compileSelection(sankhyaCatalog, named("classification", 1)),
    ).toThrow("Unavailable");
    expect(() => compileSelection(sankhyaCatalog, named("missing", 1))).toThrow(
      "Unavailable",
    );
    expect(() =>
      productStatements(sankhyaCatalog, named("unit", "KG"), 201),
    ).toThrow();
  });
  it("uses nested EXISTS for supplier and alternate-unit paths without duplicating products", () => {
    const supplier = compileSelection(sankhyaCatalog, named("supplier", 7));
    expect(supplier.where.match(/EXISTS/g)).toHaveLength(2);
    expect(supplier.where).toContain('"FORNECEDOR"');
    expect(Object.values(supplier.binds)).toContain("S");
    const alternate = productStatements(
      sankhyaCatalog,
      named("alternate_unit", "KG"),
      200,
    );
    expect(alternate.list).toContain('FROM "TGFPRO" p WHERE');
    expect(alternate.list).not.toContain("JOIN");
    expect(alternate.list).toContain("ROWNUM <= 200");
  });
  it("compiles reviewed dictionary options and string flags, rejecting invented domain values", () => {
    expect(
      Object.values(
        compileSelection(sankhyaCatalog, named("usage", "R")).binds,
      ),
    ).toContain("R");
    expect(() => compileSelection(sankhyaCatalog, named("usage", "S"))).toThrow(
      "Unknown dictionary option",
    );
    const compiled = compileSelection(sankhyaCatalog, {
      criteria: [
        {
          kind: "flag",
          dimension: "active",
          mode: "exclude",
          text: "inativos",
        },
      ],
    });
    expect(compiled.where).toContain("ELSE 0 END = 0");
    expect(Object.values(compiled.binds)).toEqual(["S"]);
  });
  it("prefers complete domain labels and retains ambiguity between partial matches", () => {
    const options = [
      { value: "R", label: "Revenda" },
      { value: "D", label: "Revenda (por fórmula)" },
    ];
    expect(matchingDomain(options, ["revenda"])).toEqual([options[0]]);
    expect(
      matchingDomain(
        [
          { value: "A", label: "Caixa grande" },
          { value: "B", label: "Caixa pequena" },
        ],
        ["caixa"],
      ),
    ).toHaveLength(2);
  });
  it("compiles custom text as bound whole-word matching with the Oracle pattern bound", () => {
    const selection: ProductSelection = {
      criteria: [
        {
          kind: "text",
          dimension: "epi_certificate",
          mode: "include",
          text: "12345",
          phrase: "12345",
        },
      ],
    };
    expect(compileSelection(sankhyaCatalog, selection).where).toContain(
      'p."AD_CA"',
    );
    expect(() =>
      compileSelection(sankhyaCatalog, {
        criteria: [
          { ...selection.criteria[0], kind: "text", phrase: "x".repeat(600) },
        ],
      }),
    ).toThrow();
  });
  it("uses explicit ancestry instead of numeric code prefixes", () => {
    const tree = groupTree([
      { id: 71, parent: -999999999, label: "ROOT" },
      { id: 3, parent: 71, label: "CHILD" },
      { id: 44, parent: 3, label: "LEAF" },
    ]);
    expect(tree.get(44)).toMatchObject({
      codes: [71, 3, 44],
      level: 3,
      path: ["ROOT", "CHILD", "LEAF"],
    });
    const compiled = compileSelection(sankhyaCatalog, {
      criteria: [
        {
          kind: "hierarchy",
          dimension: "category",
          mode: "include",
          text: "root",
          qualifier: null,
          include: [{ node: tree.get(71)!, scope: "subtree" }],
          exclude: [],
          anywhere: false,
          terms: ["root"],
        },
      ],
    });
    expect(compiled.where).toContain('PRIOR h."CODGRUPOPROD" = h."CODGRUPAI"');
    expect(compiled.where).toContain("LEVEL <= 8");
  });
  it("fails closed for cycles, positive orphan parents and overdeep trees", () => {
    expect(() =>
      groupTree([
        { id: 1, parent: 2, label: "A" },
        { id: 2, parent: 1, label: "B" },
      ]),
    ).toThrow("Cyclic");
    expect(() => groupTree([{ id: 1, parent: 99, label: "A" }])).toThrow(
      "Missing",
    );
    expect(() =>
      groupTree(
        Array.from({ length: 9 }, (_, i) => ({
          id: i + 1,
          parent: i,
          label: "A",
        })),
      ),
    ).toThrow("overdeep");
  });
  it.each(["column", "rule", "domain", "mapping", "property"])(
    "detects used metadata drift: %s",
    (kind) => {
      const live = structuredClone(sankhyaMetadata);
      const root = live.tables.find((item) => item.name === "TGFPRO")!;
      if (kind === "column")
        root.columns.find((item) => item.name === "CODVOL")!.type =
          "VARCHAR2(3)";
      if (kind === "rule")
        root.fields.find((item) => item.name === "AD_CA")!.calculated = true;
      if (kind === "domain")
        root.options.find((item) => item.field === "USOPROD")!.label =
          "changed";
      if (kind === "mapping")
        live.links.find(
          (item) => item.origin === 27 && item.target === 30,
        )!.conditionSignature = "changed";
      if (kind === "property")
        root.properties.push({
          field: "AD_CA",
          name: "metadataInterceptor",
          signature: "changed",
        });
      expect(
        metadataProblems(sankhyaCatalog, sankhyaMetadata, live).length,
      ).toBeGreaterThan(0);
    },
  );
  it("allows an unused additive field but exposes only relevant authorized metadata", () => {
    const live = structuredClone(sankhyaMetadata);
    live.tables[0].columns.push({
      name: "AD_UNUSED",
      type: "VARCHAR2(10)",
      nullable: true,
    });
    live.tables.find((item) => item.name === "TSICUS")!.columns = [];
    live.tables.find((item) => item.name === "TGFCLA")!.columns = [];
    expect(metadataProblems(sankhyaCatalog, sankhyaMetadata, live)).toEqual([]);
    expect(retrieveProductMetadata(sankhyaCatalog, "fornecedor", [])).toEqual(
      [],
    );
    const retrieved = retrieveProductMetadata(sankhyaCatalog, "fornecedor", [
      "supplier",
    ]);
    expect(retrieved.map((item) => item.id)).toEqual(["supplier"]);
    expect(JSON.stringify(retrieved)).not.toMatch(/TGF|TDD|CODPARC|AD_CA/);
    expect(
      interpreterInstructions(sankhyaCatalog, emptyProductState, "EPI"),
    ).not.toMatch(/TGFPRO|TDDCAM|AD_CA|CODPROD/);
  });
});

describe("read-only Oracle execution boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    driver.rollback.mockResolvedValue(undefined);
    driver.close.mockResolvedValue(undefined);
    driver.poolClose.mockResolvedValue(undefined);
    driver.break.mockResolvedValue(undefined);
    driver.execute.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: sql.includes("SESSION_PRIVS")
          ? [{ PRIVILEGE: "CREATE SESSION" }]
          : sql.includes("USER_TABLES")
            ? [{ N: 0 }]
            : [{ VALUE: 1 }],
      }),
    );
  });
  it("rejects ownership, DML, DDL, execution and broad SELECT privileges", () => {
    expect(privilegeProblems(["CREATE SESSION", "SELECT"], false)).toEqual([]);
    for (const privilege of [
      "UPDATE",
      "EXECUTE",
      "ALTER ANY TABLE",
      "CREATE TABLE",
      "SELECT ANY TABLE",
      "SELECT ANY DICTIONARY",
    ])
      expect(privilegeProblems([privilege], false)).toContain(privilege);
    expect(privilegeProblems([], true)).toContain("ERP object ownership");
  });
  it("begins read-only, disables autocommit, bounds rows and always rolls back", async () => {
    const reader = createOracleProductReader({});
    await expect(
      reader.read(signal(), (session) =>
        session.query("SELECT 1 VALUE FROM DUAL", {}, 1),
      ),
    ).resolves.toEqual([{ VALUE: 1 }]);
    expect(driver.execute.mock.calls[0][0]).toBe("SET TRANSACTION READ ONLY");
    expect(driver.execute.mock.calls.at(-1)?.[2]).toMatchObject({
      autoCommit: false,
      maxRows: 2,
    });
    expect(driver.rollback).toHaveBeenCalled();
    expect(driver.close).toHaveBeenCalledWith({ drop: false });
    await reader.close();
  });
  it("refuses a broad runtime account before any product read", async () => {
    driver.execute.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: sql.includes("SESSION_PRIVS")
          ? [{ PRIVILEGE: "UPDATE ANY TABLE" }]
          : [{ N: 0 }],
      }),
    );
    const reader = createOracleProductReader({});
    const operation = vi.fn();
    await expect(reader.read(signal(), operation)).rejects.toMatchObject({
      boundary: { provider: "oracle", stage: "catalog" },
    });
    expect(operation).not.toHaveBeenCalled();
    expect(driver.close).toHaveBeenCalledWith({ drop: true });
    await reader.close();
  });
  it.each([
    "DELETE FROM TGFPRO",
    "CREATE TABLE X (ID NUMBER)",
    "BEGIN NULL END",
    "SELECT * FROM TGFPRO FOR UPDATE",
  ])("refuses internal statement misuse: %s", async (sql) => {
    const reader = createOracleProductReader({}, "discovery");
    await expect(
      reader.read(signal(), (session) => session.query(sql)),
    ).rejects.toMatchObject({ boundary: { stage: "query" } });
    expect(driver.execute).toHaveBeenCalledTimes(1);
    expect(driver.rollback).toHaveBeenCalled();
    await reader.close();
  });
  it("rejects excess rows and wraps cleanup errors without driver text", async () => {
    driver.execute.mockResolvedValue({ rows: [{ VALUE: 1 }, { VALUE: 2 }] });
    const reader = createOracleProductReader({}, "discovery");
    await expect(
      reader.read(signal(), (session) =>
        session.query("SELECT 1 VALUE FROM DUAL", {}, 1),
      ),
    ).rejects.toMatchObject({ code: "PRODUCTS_PROVIDER_UNAVAILABLE" });
    driver.execute.mockResolvedValue({ rows: [{ VALUE: 1 }] });
    driver.close.mockRejectedValueOnce(new Error("private driver detail"));
    await expect(
      reader.read(signal(), (session) =>
        session.query("SELECT 1 VALUE FROM DUAL", {}, 1),
      ),
    ).rejects.toMatchObject({
      message: "PRODUCTS_PROVIDER_UNAVAILABLE",
      boundary: { stage: "cleanup" },
    });
    await reader.close();
  });
  it("does not acquire a connection for an already aborted operation", async () => {
    const reader = createOracleProductReader({}, "discovery");
    const controller = new AbortController();
    controller.abort();
    await expect(
      reader.read(controller.signal, () => Promise.resolve()),
    ).rejects.toMatchObject({ code: "PRODUCTS_PROVIDER_UNAVAILABLE" });
    expect(driver.execute).not.toHaveBeenCalled();
    await reader.close();
  });
  it("drops and closes a connection even when rollback fails", async () => {
    const reader = createOracleProductReader({}, "discovery");
    driver.rollback.mockRejectedValue(new Error("private driver detail"));
    await expect(
      reader.read(signal(), () => Promise.resolve()),
    ).rejects.toMatchObject({ boundary: { stage: "cleanup" } });
    expect(driver.close).toHaveBeenCalledWith({ drop: true });
    await reader.close();
  });
  it("interrupts an in-flight read and drops its connection on cancellation", async () => {
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<{ rows: { VALUE: number }[] }>();
    driver.execute.mockImplementation((sql: string) => {
      if (sql.startsWith("SELECT")) {
        started.resolve();
        return response.promise;
      }
      return Promise.resolve({ rows: [] });
    });
    const reader = createOracleProductReader({}, "discovery");
    const controller = new AbortController();
    const read = reader.read(controller.signal, (session) =>
      session.query("SELECT 1 VALUE FROM DUAL", {}, 1),
    );
    await started.promise;
    controller.abort();
    response.resolve({ rows: [{ VALUE: 1 }] });
    await expect(read).rejects.toMatchObject({
      code: "PRODUCTS_PROVIDER_UNAVAILABLE",
    });
    expect(driver.break).toHaveBeenCalled();
    expect(driver.close).toHaveBeenCalledWith({ drop: true });
    await reader.close();
  });
});

describe("one capability with ERP-scoped state", () => {
  const fake = (catalog: typeof sankhyaCatalog): ProductSource => ({
    catalog,
    categoryCandidates: vi.fn(),
    findRecords: vi.fn(),
    listRecords: vi.fn(),
    find: vi.fn(() =>
      Promise.resolve({
        total: 1,
        products: [
          { code: "7", description: "SYNTHETIC", classification: "GROUP" },
        ],
        sections: [],
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
  });
  const interpreter = (): ProductInterpreter => ({
    interpret: vi.fn<ProductInterpreter["interpret"]>((input) =>
      Promise.resolve({
        decision: "resolve",
        relation: input.message.startsWith("desses") ? "refine" : "new",
        choice: null,
        unsupportedReason: null,
        criteria: input.message.startsWith("desses")
          ? []
          : [
              {
                dimension: "description",
                mode: "include",
                text: "synthetic",
                qualifier: null,
                searchTerms: [],
              },
            ],
      }),
    ),
    select: vi.fn(),
  });
  const input = (
    source: "sankhya" | "vrmaster" | "all",
    context: unknown = null,
    message = "synthetic",
  ) => ({
    source,
    context,
    message,
    history: [],
    signal: signal(),
    progress: () => Promise.resolve(),
    trace: {
      note: () => undefined,
      content: () => undefined,
      invocation: () => undefined,
    },
  });
  it("does not reuse another ERP's ids or pending selection", async () => {
    const vr = fake(vrmasterCatalog),
      sk = fake(sankhyaCatalog);
    const capability = createProductCapability(
      new ProductResolver(vr, interpreter()),
      new ProductResolver(sk, interpreter()),
    );
    const first = await capability.execute(input("vrmaster"));
    const second = await capability.execute(
      input("sankhya", first.context, "desses"),
    );
    expect(second.reply.kind).toBe("clarification");
    expect(sk.find).not.toHaveBeenCalled();
    const third = await capability.execute(input("sankhya", second.context));
    expect(third.reply.result).toMatchObject({ source: "sankhya" });
    expect(vr.find).toHaveBeenCalledTimes(1);
    await capability.close();
    expect(vr.close).toHaveBeenCalled();
    expect(sk.close).toHaveBeenCalled();
  });
  it("asks for an explicit ERP when both are selected", async () => {
    const vr = fake(vrmasterCatalog),
      sk = fake(sankhyaCatalog);
    const capability = createProductCapability(
      new ProductResolver(vr, interpreter()),
      new ProductResolver(sk, interpreter()),
    );
    expect((await capability.execute(input("all"))).awaiting).toEqual([
      "source",
    ]);
    expect(vr.find).not.toHaveBeenCalled();
    expect(sk.find).not.toHaveBeenCalled();
  });
  it("keeps a domain value even when it is also a dimension synonym", async () => {
    const sk = fake(sankhyaCatalog);
    const record = { id: "R", label: "Revenda", active: null };
    sk.findRecords = vi.fn(() =>
      Promise.resolve([{ record, covers: [record] }]),
    );
    const model = interpreter();
    model.interpret = vi.fn<ProductInterpreter["interpret"]>(() =>
      Promise.resolve({
        decision: "resolve",
        relation: "new",
        choice: null,
        unsupportedReason: null,
        criteria: [
          {
            dimension: "usage",
            mode: "include",
            text: "revenda",
            qualifier: null,
            searchTerms: [],
          },
        ],
      }),
    );
    const turn = await new ProductResolver(sk, model).execute({
      message: "produtos de revenda",
      state: structuredClone(emptyProductState),
      sourceSelected: true,
      signal: signal(),
      progress: () => Promise.resolve(),
    });
    expect(turn.reply.kind).toBe("answer");
    expect(sk.findRecords).toHaveBeenCalledWith(
      sankhyaCatalog.dimensions.find((item) => item.id === "usage"),
      ["revenda"],
      expect.any(AbortSignal),
    );
  });
  it("loads string-key selections while rejecting malformed persisted state", () => {
    expect(
      loadProductState({ ...emptyProductState, active: named("unit", "KG") })
        .active,
    ).not.toBeNull();
    expect(
      loadProductState({ ...emptyProductState, active: { sql: "SELECT 1" } }),
    ).toEqual(emptyProductState);
  });
});
