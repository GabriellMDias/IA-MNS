import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import pg from "pg";
import {
  createVrmasterPool,
  vrmasterTransactionSettings,
  type VrmasterConnection,
} from "../src/vrmaster-connection.js";
import type { SemanticCatalog } from "../src/features/products/catalog.js";
import type { RequestedCriterion } from "../src/features/products/interpretation.js";
import type { ProductInterpreter } from "../src/features/products/interpreter.js";
import {
  catalogMismatches,
  createPostgresProductSource,
} from "../src/features/products/postgres-source.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import type {
  ProductSelection,
  ResolvedCriterion,
} from "../src/features/products/selection.js";
import type { ProductSource } from "../src/features/products/source.js";
import { emptyProductState } from "../src/features/products/state.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { createVrmasterProductSource } from "../src/features/products/vrmaster/source.js";
import { createVrmasterReader } from "../src/features/sales/vrmaster.js";

// A fictional VRMaster with the discovered shapes of the product tables: the
// exact column types the catalog verifies, the five-level mercadológico with
// zero codes below each node's level, cost centers on level-1 nodes only, a
// cost-center tree, buyers with status, and per-store registrations. Only
// the PH-19 grants are given to the runtime role.
const adminPassword = randomBytes(18).toString("base64url");
const accountPassword = randomBytes(18).toString("base64url");
const schema = `
CREATE TABLE centrocusto (
  id integer PRIMARY KEY, centrocusto1 integer NOT NULL, centrocusto2 integer NOT NULL,
  centrocusto3 integer NOT NULL, nivel integer NOT NULL, descricao character varying(40),
  id_situacaocadastro integer NOT NULL);
CREATE TABLE mercadologico (
  id integer PRIMARY KEY, mercadologico1 integer NOT NULL, mercadologico2 integer NOT NULL,
  mercadologico3 integer NOT NULL, mercadologico4 integer NOT NULL, mercadologico5 integer NOT NULL,
  nivel integer NOT NULL, descricao character varying(35) NOT NULL,
  id_centrocusto integer REFERENCES centrocusto (id),
  UNIQUE (mercadologico1, mercadologico2, mercadologico3, mercadologico4, mercadologico5));
CREATE TABLE comprador (
  id integer PRIMARY KEY, nome character varying(40) NOT NULL, id_situacaocadastro integer NOT NULL);
CREATE TABLE produto (
  id integer PRIMARY KEY, descricaocompleta character varying(60) NOT NULL,
  mercadologico1 integer NOT NULL, mercadologico2 integer NOT NULL, mercadologico3 integer NOT NULL,
  mercadologico4 integer NOT NULL, mercadologico5 integer NOT NULL,
  id_comprador integer NOT NULL REFERENCES comprador (id), pesavel boolean NOT NULL,
  FOREIGN KEY (mercadologico1, mercadologico2, mercadologico3, mercadologico4, mercadologico5)
    REFERENCES mercadologico (mercadologico1, mercadologico2, mercadologico3, mercadologico4, mercadologico5));
CREATE TABLE produtocomplemento (
  id serial PRIMARY KEY, id_produto integer NOT NULL REFERENCES produto (id),
  id_loja integer NOT NULL, id_situacaocadastro integer NOT NULL, descontinuado boolean NOT NULL,
  precovenda numeric(11,2) NOT NULL DEFAULT 0);
INSERT INTO centrocusto VALUES
  (1, 1, 0, 0, 1, 'SETORES', 1),
  (2, 1, 1, 0, 2, 'HORTIFRUTI', 1), (3, 1, 1, 1, 3, 'HORTIFRUTI', 1),
  (6, 1, 4, 0, 2, 'SECOS', 1), (10, 1, 4, 1, 3, 'SECOS', 1),
  (12, 1, 6, 0, 2, 'OUTROS', 0), (13, 1, 6, 1, 3, 'OUTROS', 0);
INSERT INTO mercadologico VALUES
  (100, 1, 0, 0, 0, 0, 1, 'HORTIFRUTI', 3),
  (101, 1, 1, 0, 0, 0, 2, 'FRUTAS', NULL),
  (102, 1, 1, 1, 0, 0, 3, 'BANANA', NULL),
  (103, 1, 1, 1, 1, 0, 4, 'PRODUTOR', NULL),
  (104, 1, 1, 1, 1, 1, 5, 'PRATA', NULL),
  (105, 1, 1, 1, 1, 2, 5, 'NANICA', NULL),
  (106, 1, 1, 1, 2, 0, 4, 'CHIPS SALGADA', NULL),
  (107, 1, 1, 1, 2, 1, 5, 'KG', NULL),
  (108, 1, 1, 2, 0, 0, 3, 'MAÇÃ', NULL),
  (109, 1, 1, 2, 1, 0, 4, 'NACIONAL', NULL),
  (110, 1, 1, 2, 1, 1, 5, 'GALA', NULL),
  (200, 2, 0, 0, 0, 0, 1, 'MERCEARIA', 10),
  (201, 2, 1, 0, 0, 0, 2, 'SNACKS', NULL),
  (202, 2, 1, 1, 0, 0, 3, 'BANANA CHIPS', NULL),
  (203, 2, 1, 1, 1, 0, 4, 'MARCA X', NULL),
  (204, 2, 1, 1, 1, 1, 5, '50G', NULL),
  (205, 2, 2, 0, 0, 0, 2, 'DOCES', NULL),
  (206, 2, 2, 1, 0, 0, 3, 'BALA', NULL),
  (207, 2, 2, 1, 1, 0, 4, 'MARCA Y', NULL),
  (208, 2, 2, 1, 1, 1, 5, '100G', NULL),
  (300, 3, 0, 0, 0, 0, 1, 'LATICINIOS', 10),
  (301, 3, 1, 0, 0, 0, 2, 'IOGURTE', NULL),
  (302, 3, 1, 1, 0, 0, 3, 'LIQUIDO', NULL),
  (303, 3, 1, 1, 1, 0, 4, 'MARCA Z', NULL),
  (304, 3, 1, 1, 1, 1, 5, '170G', NULL),
  (400, 4, 0, 0, 0, 0, 1, 'PADARIA', NULL),
  (401, 4, 1, 0, 0, 0, 2, 'MP CONFEITARIA', NULL),
  (402, 4, 1, 1, 0, 0, 3, 'MP HORTIFRUTI', NULL),
  (403, 4, 1, 1, 1, 0, 4, 'MP', NULL),
  (404, 4, 1, 1, 1, 1, 5, 'KG', NULL),
  (500, 5, 0, 0, 0, 0, 1, 'INATIVO', 10),
  (501, 5, 1, 0, 0, 0, 2, 'INATIVO', NULL),
  (502, 5, 1, 1, 0, 0, 3, 'INATIVO', NULL),
  (503, 5, 1, 1, 1, 0, 4, 'INATIVO', NULL),
  (504, 5, 1, 1, 1, 1, 5, 'INATIVO', NULL),
  (600, 6, 0, 0, 0, 0, 1, 'TAXAS', NULL),
  (601, 6, 1, 0, 0, 0, 2, 'ENTREGA', NULL),
  (602, 6, 1, 1, 0, 0, 3, 'ENTREGA', NULL);
INSERT INTO comprador VALUES
  (1, 'PADRAO', 1), (2, 'ANA LIMA', 1), (3, 'BRUNO COSTA', 1), (4, 'BRUNA COSTA', 1),
  (5, 'CARLOS ANTIGO', 0);
INSERT INTO produto VALUES
  (1, 'BANANA PRATA KG', 1, 1, 1, 1, 1, 2, false),
  (2, 'BANANA NANICA KG', 1, 1, 1, 1, 2, 2, false),
  (3, 'BANANA CHIPS SALGADA KG', 1, 1, 1, 2, 1, 2, false),
  (4, 'MAÇÃ GALA KG', 1, 1, 2, 1, 1, 2, true),
  (5, 'BANANA CHIPS 50G', 2, 1, 1, 1, 1, 3, false),
  (6, 'BALA DE BANANA 100G', 2, 2, 1, 1, 1, 3, false),
  (7, 'BALA DE MORANGO 100G', 2, 2, 1, 1, 1, 4, false),
  (8, 'IOGURTE DE BANANA 170G', 3, 1, 1, 1, 1, 4, false),
  (9, 'IOGURTE NATURAL 170G', 3, 1, 1, 1, 1, 1, false),
  (10, 'MP BANANA KG', 4, 1, 1, 1, 1, 2, false),
  (11, 'IOGURTE BANANA ANTIGO', 5, 1, 1, 1, 1, 5, false),
  (12, 'TAXA DE ENTREGA', 6, 1, 1, 0, 0, 1, false),
  (13, 'BANANAS DESIDRATADAS 100G', 2, 1, 1, 1, 1, 3, false),
  (14, 'BANANADA 100G', 2, 2, 1, 1, 1, 3, false);
-- Product 1 is active in three stores, product 3 in none.
INSERT INTO produtocomplemento (id_produto, id_loja, id_situacaocadastro, descontinuado)
  SELECT p.id, l.loja, CASE WHEN p.id = 3 THEN 0 WHEN p.id = 1 THEN 1 ELSE (l.loja = 1)::int END, false
  FROM produto p CROSS JOIN (VALUES (1), (2), (3)) l (loja);
CREATE ROLE ia_mns LOGIN;
ALTER ROLE ia_mns SET default_transaction_read_only = on;
ALTER ROLE ia_mns SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE vrmaster TO ia_mns;
GRANT USAGE ON SCHEMA public TO ia_mns;
GRANT SELECT ON produto, mercadologico, centrocusto, comprador TO ia_mns;
`;

let container: StartedTestContainer;
let admin: pg.Client;
let connection: VrmasterConnection;
let source: ProductSource;
const signal = () => new AbortController().signal;
const category = vrmasterCatalog.dimensions.find(
  (item) => item.id === "category",
)!;
const costCenter = vrmasterCatalog.dimensions.find(
  (item) => item.id === "cost_center",
)!;
const buyer = vrmasterCatalog.dimensions.find((item) => item.id === "buyer")!;

/** Independent read of the expected product ids, written by hand. */
async function expected(
  sql: string,
  values: unknown[] = [],
): Promise<string[]> {
  return (await admin.query<{ id: number }>(sql, values)).rows.map((row) =>
    String(row.id),
  );
}
async function found(selection: ProductSelection): Promise<string[]> {
  const page = await source.find(selection, 200, signal());
  const codes = page.products.map((product) => product.code);
  expect(new Set(codes).size).toBe(codes.length);
  expect(page.total).toBe(codes.length);
  return codes.sort((a, b) => Number(a) - Number(b));
}
async function nodeOf(id: number) {
  const candidates = await source.categoryCandidates(
    category,
    ["banana", "mp", "doces", "mercearia", "hortifruti", "iogurte"],
    signal(),
  );
  const match = candidates.candidates.find((item) => item.node.id === id);
  if (!match) throw new Error(`Synthetic node ${id} was not offered`);
  return match.node;
}
async function records(
  dimension: typeof buyer,
  words: string[],
): Promise<ResolvedCriterion> {
  const matches = await source.findRecords(dimension, words, signal());
  const top = matches.filter(
    (item) =>
      !matches.some(
        (other) =>
          other !== item &&
          other.covers.some((value) => value.id === item.record.id),
      ),
  );
  return {
    kind: "entity",
    dimension: dimension.id,
    mode: "include",
    text: words.join(" "),
    matched: top.map((item) => item.record),
    values: top.flatMap((item) => item.covers),
  };
}

beforeAll(async () => {
  container = await new GenericContainer("postgres:16")
    .withEnvironment({
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: adminPassword,
      POSTGRES_DB: "vrmaster",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  admin = new pg.Client({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: "vrmaster",
    user: "postgres",
    password: adminPassword,
  });
  await admin.connect();
  await admin.query(schema);
  await admin.query(
    `ALTER ROLE ia_mns PASSWORD ${admin.escapeLiteral(accountPassword)}`,
  );
  connection = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: "vrmaster",
    user: "ia_mns",
    password: accountPassword,
    ssl: "disable",
  };
  source = createVrmasterProductSource(connection);
}, 180_000);

afterAll(async () => {
  await source?.close();
  await admin?.end();
  await container?.stop();
});

describe("VRMaster product source", () => {
  it("executes complete semantic sales scope with reference joins, comparison and current responsibility", async () => {
    // Only this disposable ERP fixture is changed. The real ERPs are read-only.
    await admin.query(`
      ALTER TABLE produto ADD COLUMN id_tipoembalagem integer DEFAULT 1;
      CREATE TABLE fornecedor (id integer PRIMARY KEY, id_estado integer NOT NULL);
      CREATE TABLE loja (id integer PRIMARY KEY, id_fornecedor integer NOT NULL);
      CREATE TABLE aliquota (id integer PRIMARY KEY);
      CREATE TABLE produtoaliquota (id_produto integer NOT NULL, id_estado integer NOT NULL, id_aliquotaconsumidor integer NOT NULL);
      CREATE TABLE venda (id integer PRIMARY KEY, id_produto integer NOT NULL, data date NOT NULL, quantidade numeric NOT NULL, id_loja integer NOT NULL, valortotal numeric NOT NULL, id_comprador integer);
      INSERT INTO fornecedor VALUES (1,35);
      INSERT INTO loja VALUES (1,1);
      INSERT INTO aliquota VALUES (1);
      INSERT INTO produtoaliquota SELECT id,35,1 FROM produto;
      INSERT INTO venda SELECT id,id,'2026-09-15',id,1,id*10,3 FROM produto;
      INSERT INTO venda SELECT id+100,id,'2025-09-15',id,1,id*5,4 FROM produto;
      GRANT SELECT ON venda,loja,fornecedor,aliquota,produtoaliquota TO ia_mns;
    `);
    const sales = createVrmasterReader(connection);
    try {
      const selected: ProductSelection = {
        criteria: [
          await records(buyer, ["bruna"]),
          await records(costCenter, ["secos"]),
        ],
      };
      const scope = await source.salesScope!(selected, signal());
      const query = {
        productSearch: null,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        metric: "net_value" as const,
        groupBy: "total" as const,
        comparison: "previous_year" as const,
      };
      const result = await sales.read(query, signal(), scope);
      const independent = await admin.query<{ total: string }>(
        `SELECT SUM(v.valortotal)::text total FROM venda v JOIN produto p ON p.id=v.id_produto JOIN mercadologico m ON m.mercadologico1=p.mercadologico1 AND m.nivel=1 JOIN centrocusto cc ON cc.id=m.id_centrocusto WHERE p.id_comprador=4 AND cc.centrocusto1=1 AND cc.centrocusto2=4 AND v.data BETWEEN '2026-09-01' AND '2026-09-30'`,
      );
      expect(result.current.rows[0].value).toBe(independent.rows[0].total);
      expect(result.current.rows[0].value).toBe("150");
      expect(result.previous!.rows[0].value).toBe("75");
      expect(result.current.products.map((item) => item.code)).toEqual([
        "7",
        "8",
      ]);
      // No sale was assigned to this buyer; membership uses current product responsibility.
      expect(result.current.products).toHaveLength(2);
      await expect(
        sales.read({ ...query, productSearch: "banana" }, signal(), scope),
      ).rejects.toMatchObject({ code: "SALES_QUERY_INVALID" });
    } finally {
      await sales.close();
    }
  });
  it("verifies the catalog against the live schema and the runtime grants", async () => {
    const client = new pg.Client({ ...connection, ssl: false });
    await client.connect();
    try {
      expect(await catalogMismatches(client, vrmasterCatalog)).toEqual([]);
      const changed = structuredClone(vrmasterCatalog);
      changed.entities.find((item) => item.id === "buyer")!.columns[1].type =
        "character varying(80)";
      expect(await catalogMismatches(client, changed)).toEqual([
        "public.comprador.nome is character varying(40)",
      ]);
      const unreadable = structuredClone(vrmasterCatalog);
      unreadable.entities.find(
        (item) => item.id === "store_registration",
      )!.access = "granted";
      const status = unreadable.dimensions.find(
        (item) => item.id === "store_status",
      )!;
      status.exposure = "enabled";
      status.blocker = null;
      expect(await catalogMismatches(client, unreadable)).toContain(
        "public.produtocomplemento.id_situacaocadastro is not readable",
      );
    } finally {
      await client.end();
    }
  });

  it("offers named nodes, their children and description groups with paths and conventions", async () => {
    const result = await source.categoryCandidates(
      category,
      ["banana"],
      signal(),
    );
    const byId = new Map(result.candidates.map((item) => [item.node.id, item]));
    expect(result.truncated).toBe(false);
    // Whole words in singular or plural: BANANADA is another word.
    expect(result.textMatches).toBe(9);
    expect(byId.get(102)).toMatchObject({
      matchedBy: "name",
      products: 3,
      matchingProducts: 3,
      node: { path: ["HORTIFRUTI", "FRUTAS", "BANANA"], level: 3 },
    });
    expect(byId.get(202)?.matchedBy).toBe("name");
    expect(byId.get(103)?.matchedBy).toBe("child");
    expect(byId.get(106)?.matchedBy).toBe("child");
    expect(byId.get(206)).toMatchObject({
      matchedBy: "products",
      products: 3,
      matchingProducts: 1,
      examples: [
        "BALA DE BANANA 100G",
        "BALA DE MORANGO 100G",
        "BANANADA 100G",
      ],
    });
    expect(byId.get(402)?.node.conventions).toEqual(["raw_material"]);
    expect(byId.get(502)?.node.conventions).toEqual([
      "inactive_classification",
    ]);
    expect(byId.has(101)).toBe(false);
  });

  it("matches names by whole words and expands cost centers to their descendants", async () => {
    const costa = await source.findRecords(buyer, ["costa"], signal());
    expect(costa.map((item) => item.record.label)).toEqual([
      "BRUNA COSTA",
      "BRUNO COSTA",
    ]);
    expect(
      await source.findRecords(buyer, ["bruno", "costa"], signal()),
    ).toHaveLength(1);
    expect(await source.findRecords(buyer, ["cost"], signal())).toEqual([]);
    const secos = await source.findRecords(costCenter, ["secos"], signal());
    expect(
      secos.map((item) => [
        item.record.id,
        item.covers.map((value) => value.id),
      ]),
    ).toEqual([
      [6, [6, 10]],
      [10, [10]],
    ]);
    const inactive = await source.findRecords(buyer, ["carlos"], signal());
    expect(inactive[0].record.active).toBe(false);
    const listed = await source.listRecords(buyer, signal());
    expect(listed.map((item) => item.record.label)).not.toContain(
      "CARLOS ANTIGO",
    );
  });

  it("returns fresh bananas through the classification, matching independent SQL (scenario A)", async () => {
    const selection: ProductSelection = {
      criteria: [
        {
          kind: "hierarchy",
          dimension: "category",
          mode: "include",
          text: "banana",
          qualifier: "fruta",
          include: [{ node: await nodeOf(102), scope: "subtree" }],
          anywhere: false,
          exclude: [await nodeOf(106)],
          terms: ["banana"],
        },
      ],
    };
    expect(await found(selection)).toEqual(
      await expected(`SELECT id FROM produto
        WHERE (mercadologico1, mercadologico2, mercadologico3) = (1, 1, 1)
          AND NOT (mercadologico4 = 2) ORDER BY id`),
    );
    expect(await found(selection)).toEqual(["1", "2"]);
  });

  it("follows the section's cost center, including its sub-centers (scenario B)", async () => {
    const secos = await records(costCenter, ["secos"]);
    expect(await found({ criteria: [secos] })).toEqual(
      await expected(`SELECT p.id FROM produto p
        JOIN mercadologico s ON s.nivel = 1 AND s.mercadologico1 = p.mercadologico1
        JOIN centrocusto c ON c.id = s.id_centrocusto
        WHERE c.descricao = 'SECOS' ORDER BY p.id`),
    );
  });

  it("uses the product's registered buyer (scenario C) and combines paths (scenario D)", async () => {
    const ana = await records(buyer, ["ana"]);
    expect(await found({ criteria: [ana] })).toEqual(
      await expected(
        "SELECT id FROM produto WHERE id_comprador = 2 ORDER BY id",
      ),
    );
    const bruno = await records(buyer, ["bruno"]);
    const secos = await records(costCenter, ["secos"]);
    expect(await found({ criteria: [secos, bruno] })).toEqual(
      await expected(`SELECT p.id FROM produto p
        JOIN mercadologico s ON s.nivel = 1 AND s.mercadologico1 = p.mercadologico1
        WHERE s.id_centrocusto = 10 AND p.id_comprador = 3 ORDER BY p.id`),
    );
  });

  it("supports subtree exclusions, description-scoped nodes, flags and null-safe exclusions (scenario E)", async () => {
    const grocery = await nodeOf(200);
    const sweets = await nodeOf(205);
    const candy = await nodeOf(206);
    type Hierarchy = Extract<ResolvedCriterion, { kind: "hierarchy" }>;
    const hierarchy = (
      include: Hierarchy["include"],
      extra: Partial<Hierarchy> = {},
    ): ResolvedCriterion => ({
      kind: "hierarchy",
      dimension: "category",
      mode: "include",
      text: "banana",
      qualifier: null,
      include,
      anywhere: false,
      exclude: [],
      terms: ["banana"],
      ...extra,
    });
    expect(
      await found({
        criteria: [
          hierarchy([{ node: grocery, scope: "subtree" }], {
            exclude: [sweets],
          }),
        ],
      }),
    ).toEqual(["5", "13"]);
    expect(
      await found({
        criteria: [hierarchy([{ node: candy, scope: "matching_text" }])],
      }),
    ).toEqual(["6"]);
    expect(
      await found({ criteria: [hierarchy([], { anywhere: true })] }),
    ).toEqual(
      await expected(
        `SELECT id FROM produto WHERE descricaocompleta ~ '(^| )BANANAS?( |$)' ORDER BY id`,
      ),
    );
    expect(
      await found({
        criteria: [
          {
            kind: "flag",
            dimension: "weighable",
            mode: "include",
            text: "pesáveis",
          },
        ],
      }),
    ).toEqual(["4"]);
    // Products of sections without a cost center are not lost by NULLs.
    const secos = await records(costCenter, ["secos"]);
    expect(await found({ criteria: [{ ...secos, mode: "exclude" }] })).toEqual(
      await expected(`SELECT p.id FROM produto p
        JOIN mercadologico s ON s.nivel = 1 AND s.mercadologico1 = p.mercadologico1
        WHERE s.id_centrocusto IS DISTINCT FROM 10 ORDER BY p.id`),
    );
  });

  it("binds text that looks like SQL or a regular expression", async () => {
    for (const phrase of [
      "'; DROP TABLE produto; --",
      "(.*)",
      "BANANA|IOGURTE",
    ])
      expect(
        await found({
          criteria: [
            {
              kind: "text",
              dimension: "description",
              mode: "include",
              text: phrase,
              phrase,
            },
          ],
        }),
      ).toEqual([]);
    expect(
      (
        await admin.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM produto",
        )
      ).rows[0].count,
    ).toBe(14);
  });

  it("returns each product once through one-to-many store registrations once granted", async () => {
    const catalog: SemanticCatalog = structuredClone(vrmasterCatalog);
    catalog.entities.find((item) => item.id === "store_registration")!.access =
      "granted";
    const status = catalog.dimensions.find(
      (item) => item.id === "store_status",
    )!;
    status.exposure = "enabled";
    status.blocker = null;
    const ungranted = createPostgresProductSource(
      catalog,
      () => createVrmasterPool(connection),
      vrmasterTransactionSettings,
    );
    await expect(
      ungranted.find(
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
        200,
        signal(),
      ),
    ).rejects.toMatchObject({
      code: "PRODUCTS_PROVIDER_UNAVAILABLE",
      boundary: { provider: "postgresql", stage: "catalog" },
    });
    await ungranted.close();
    // The least-privilege grant PH-27 asks for: status columns only.
    await admin.query(
      "GRANT SELECT (id, id_produto, id_loja, id_situacaocadastro, descontinuado) ON produtocomplemento TO ia_mns",
    );
    const granted = createPostgresProductSource(
      catalog,
      () => createVrmasterPool(connection),
      vrmasterTransactionSettings,
    );
    try {
      const page = await granted.find(
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
        200,
        signal(),
      );
      const codes = page.products.map((product) => product.code);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes.sort((a, b) => Number(a) - Number(b))).toEqual(
        await expected(`SELECT DISTINCT id_produto AS id FROM produtocomplemento
          WHERE id_situacaocadastro = 1 ORDER BY 1`),
      );
      expect(codes).toContain("1");
      expect(codes).not.toContain("3");
    } finally {
      await granted.close();
      await admin.query(
        "REVOKE SELECT (id, id_produto, id_loja, id_situacaocadastro, descontinuado) ON produtocomplemento FROM ia_mns",
      );
    }
  });

  it("fails closed when a required column becomes unreadable and leaves no transaction open", async () => {
    await admin.query("REVOKE SELECT ON comprador FROM ia_mns");
    const fresh = createVrmasterProductSource(connection);
    try {
      await expect(
        fresh.find(
          { criteria: [await records(costCenter, ["secos"])] },
          10,
          signal(),
        ),
      ).rejects.toMatchObject({ boundary: { stage: "catalog" } });
    } finally {
      await fresh.close();
      await admin.query("GRANT SELECT ON comprador TO ia_mns");
    }
    const open = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = 'ia_mns' AND state LIKE 'idle in transaction%'",
    );
    expect(open.rows[0].count).toBe(0);
  });

  it("refuses writes through the runtime account", async () => {
    const client = new pg.Client({ ...connection, ssl: false });
    await client.connect();
    try {
      await expect(
        client.query("UPDATE produto SET pesavel = true WHERE id = 1"),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});

describe("product resolver over the synthetic VRMaster", () => {
  // A scripted model: it reads the request as given and picks candidates by
  // path, so the pipeline from candidates to SQL runs without a provider.
  function interpreter(
    criteria: RequestedCriterion[],
    pick: (path: string) => "include" | "exclude" | null,
  ): ProductInterpreter {
    return {
      interpret: () =>
        Promise.resolve({
          decision: "resolve",
          relation: "new",
          choice: null,
          criteria,
          unsupportedReason: null,
        }),
      select: (input) => {
        const include: number[] = [];
        const exclude: number[] = [];
        input.candidates.forEach((item, index) => {
          const decision = pick(item.node.path.join(" › "));
          if (decision === "include") include.push(index + 1);
          if (decision === "exclude") exclude.push(index + 1);
        });
        return Promise.resolve({
          decision: "select",
          include,
          exclude,
          allText: false,
          alternatives: [],
        });
      },
    };
  }

  it("resolves banana fruta end to end", async () => {
    const resolver = new ProductResolver(
      source,
      interpreter(
        [
          {
            dimension: "category",
            mode: "include",
            text: "banana",
            qualifier: "fruta",
            searchTerms: [],
          },
        ],
        (path) =>
          path === "HORTIFRUTI › FRUTAS › BANANA"
            ? "include"
            : path.endsWith("CHIPS SALGADA")
              ? "exclude"
              : null,
      ),
    );
    const turn = await resolver.execute({
      message: "Quais produtos são banana fruta?",
      state: emptyProductState,
      signal: signal(),
      progress: () => Promise.resolve(),
      sourceSelected: true,
    });
    expect(turn.reply.result).toMatchObject({
      kind: "products",
      total: 2,
      products: [
        {
          code: "2",
          classification: "HORTIFRUTI › FRUTAS › BANANA › PRODUTOR › NANICA",
        },
        {
          code: "1",
          classification: "HORTIFRUTI › FRUTAS › BANANA › PRODUTOR › PRATA",
        },
      ],
      sections: [{ label: "HORTIFRUTI", count: 2 }],
    });
  });

  it("resolves the combined cost center and buyer request end to end", async () => {
    const resolver = new ProductResolver(
      source,
      interpreter(
        [
          {
            dimension: "cost_center",
            mode: "include",
            text: "SECOS",
            qualifier: null,
            searchTerms: [],
          },
          {
            dimension: "buyer",
            mode: "include",
            text: "Bruno",
            qualifier: null,
            searchTerms: [],
          },
        ],
        () => null,
      ),
    );
    const turn = await resolver.execute({
      message:
        "Quais produtos do centro de custo SECOS pertencem ao comprador Bruno?",
      state: emptyProductState,
      signal: signal(),
      progress: () => Promise.resolve(),
      sourceSelected: true,
    });
    expect(turn.reply.result).toMatchObject({
      total: 4,
      criteria: [
        { dimension: "cost_center", values: ["SECOS"] },
        { dimension: "buyer", values: ["BRUNO COSTA"] },
      ],
    });
  });
});
