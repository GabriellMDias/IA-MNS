import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";
import pg from "pg";
import type { SalesQuery } from "../src/features/sales/domain.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import {
  createVrmasterReader,
  type VrmasterConnection,
} from "../src/features/sales/vrmaster.js";
import { vrmasterAggregateSql } from "../src/features/sales/vrmaster-query.js";

// A synthetic VRMaster with only the reference SQL's tables and columns. The
// data exercises every join of the reference: sales outside its fiscal or
// mercadológico joins must not count, while missing buyers or cost centers
// (left joins) must.
// Disposable container credentials, generated per run so no literal secret exists.
const adminPassword = randomBytes(18).toString("base64url");
const accountPassword = randomBytes(18).toString("base64url");
const wrongPassword = randomBytes(18).toString("base64url");
const schema = `
CREATE TABLE fornecedor (id integer PRIMARY KEY, id_estado integer NOT NULL);
CREATE TABLE loja (id integer PRIMARY KEY, descricao text NOT NULL, id_fornecedor integer NOT NULL);
CREATE TABLE centrocusto (id integer PRIMARY KEY, descricao text NOT NULL);
CREATE TABLE mercadologico (mercadologico1 integer NOT NULL, nivel integer NOT NULL, id_centrocusto integer);
CREATE TABLE produto (id integer PRIMARY KEY, descricaocompleta text, id_tipoembalagem integer, mercadologico1 integer NOT NULL);
CREATE TABLE aliquota (id integer PRIMARY KEY, situacaotributaria integer NOT NULL);
CREATE TABLE produtoaliquota (id_produto integer NOT NULL, id_estado integer NOT NULL, id_aliquotaconsumidor integer NOT NULL);
CREATE TABLE comprador (id integer PRIMARY KEY, nome text NOT NULL);
CREATE TABLE venda (
  id integer PRIMARY KEY, id_produto integer NOT NULL, data date NOT NULL,
  quantidade numeric(12,3) NOT NULL, id_loja integer NOT NULL,
  valortotal numeric(12,2) NOT NULL, id_comprador integer,
  customediocomimposto numeric(12,2), precovenda numeric(12,2),
  customediosemimposto numeric(12,2), icmsdebito numeric(12,2),
  piscofins numeric(12,2), operacional numeric(12,2)
);
INSERT INTO fornecedor VALUES (1, 35), (2, 41);
INSERT INTO loja VALUES (1, 'LOJA SP', 1), (2, 'LOJA PR', 2);
INSERT INTO centrocusto VALUES (1, 'HORTIFRUTI');
INSERT INTO mercadologico VALUES (10, 1, 1), (10, 2, 1), (20, 1, NULL);
INSERT INTO produto VALUES
  (1, 'MAÇÃ GALA', 1, 10),
  (2, 'MACARRÃO ESPAGUETE', 1, 10),
  (3, 'maca fuji  kg', 4, 10),
  (4, 'BANANA PRATA', 4, 20),
  (5, 'PERA (ARGENTINA)', 1, 10),
  (6, 'ABACAXI', 1, 99);
INSERT INTO aliquota VALUES (1, 0);
INSERT INTO produtoaliquota VALUES
  (1, 35, 1), (1, 41, 1), (2, 35, 1), (3, 35, 1), (3, 41, 1),
  (4, 35, 1), (4, 41, 1), (5, 35, 1), (6, 35, 1);
INSERT INTO comprador VALUES (1, 'COMPRADOR');
INSERT INTO venda (id, id_produto, data, quantidade, id_loja, valortotal, id_comprador) VALUES
  (1, 1, '2026-07-05', 1, 1, 5.00, 1),
  (2, 1, '2026-08-31', 1, 1, 10.00, 1),
  (3, 1, '2026-09-01', 2, 1, 0.10, 1),
  (4, 1, '2026-09-15', 3, 2, 0.20, 1),
  (5, 3, '2026-09-30', 1.5, 1, 15.55, NULL),
  (6, 1, '2026-10-01', 1, 1, 99.00, 1),
  (7, 2, '2026-09-10', 4, 1, 20.00, 1),
  (8, 4, '2026-09-11', 2.25, 2, 9.00, NULL),
  (9, 5, '2026-09-12', 1, 2, 1000.00, 1),
  (10, 5, '2026-09-12', 1, 1, 7.00, 1),
  (11, 6, '2026-09-13', 1, 1, 500.00, 1);
-- The dedicated account of PH-19: connect, schema usage and SELECT on the
-- reference tables only, read-only by default, 30-second statements.
CREATE ROLE ia_mns LOGIN;
ALTER ROLE ia_mns SET default_transaction_read_only = on;
ALTER ROLE ia_mns SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE vrmaster TO ia_mns;
GRANT USAGE ON SCHEMA public TO ia_mns;
GRANT SELECT ON venda, produto, loja, fornecedor, produtoaliquota, aliquota,
  mercadologico, centrocusto, comprador TO ia_mns;
`;

let container: StartedTestContainer;
let admin: pg.Client;
let connection: VrmasterConnection;
let reader: SalesReader;
const signal = () => new AbortController().signal;
const query = (overrides: Partial<SalesQuery>): SalesQuery => ({
  productSearch: null,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  metric: "net_value",
  groupBy: "total",
  comparison: "none",
  ...overrides,
});

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
  reader = createVrmasterReader(connection);
}, 180_000);

afterAll(async () => {
  await reader?.close();
  await admin?.end();
  await container?.stop();
});

describe("VRMaster sales reader", () => {
  it("totals the period with the reference joins and inclusive dates", async () => {
    const { current, previous } = await reader.read(query({}), signal());
    // 0.10 + 0.20 + 15.55 + 20.00 + 9.00 + 7.00: excludes the 31 Aug and
    // 1 Oct sales, the store whose state has no fiscal row for the product
    // and the product without a level-1 mercadológico; keeps sales without
    // buyer or cost center; the level-2 mercadológico row adds nothing.
    expect(current.rows).toEqual([
      { period: "total", product: null, unit: "BRL", value: "51.85" },
    ]);
    expect(current.products).toEqual([]);
    expect(previous).toBeNull();
  });
  it("groups the period by month", async () => {
    const { current } = await reader.read(
      query({ startDate: "2026-07-01", groupBy: "month" }),
      signal(),
    );
    expect(current.rows).toEqual([
      { period: "2026-07", product: null, unit: "BRL", value: "5.00" },
      { period: "2026-08", product: null, unit: "BRL", value: "10.00" },
      { period: "2026-09", product: null, unit: "BRL", value: "51.85" },
    ]);
  });
  it("groups by product", async () => {
    const { current } = await reader.read(
      query({ groupBy: "product" }),
      signal(),
    );
    expect(current.rows.map((row) => [row.product, row.value])).toEqual([
      ["1 - MAÇÃ GALA", "0.30"],
      ["2 - MACARRÃO ESPAGUETE", "20.00"],
      ["3 - maca fuji  kg", "15.55"],
      ["4 - BANANA PRATA", "9.00"],
      ["5 - PERA (ARGENTINA)", "7.00"],
    ]);
  });
  it("filters a product phrase as whole words, ignoring accents and case", async () => {
    const { current } = await reader.read(
      query({ productSearch: "Maçã" }),
      signal(),
    );
    expect(current.rows[0].value).toBe("15.85");
    expect(current.products).toEqual([
      { code: "1", description: "MAÇÃ GALA" },
      { code: "3", description: "maca fuji  kg" },
    ]);
    const phrase = await reader.read(
      query({ productSearch: "maca fuji kg" }),
      signal(),
    );
    expect(phrase.current.rows[0].value).toBe("15.55");
  });
  it("combines period grouping, product filter and comparison", async () => {
    const { current, previous } = await reader.read(
      query({
        productSearch: "maçã",
        startDate: "2026-08-01",
        groupBy: "month",
        comparison: "previous_period",
      }),
      signal(),
    );
    expect(current.rows).toEqual([
      { period: "2026-08", product: null, unit: "BRL", value: "10.00" },
      { period: "2026-09", product: null, unit: "BRL", value: "15.85" },
    ]);
    // 2026-08-01..2026-09-30 is 61 days; the previous period starts in June.
    expect(previous?.rows).toEqual([
      { period: "2026-07", product: null, unit: "BRL", value: "5.00" },
    ]);
  });
  it("keeps quantities of different packaging types apart", async () => {
    const { current } = await reader.read(
      query({ metric: "quantity" }),
      signal(),
    );
    expect(current.rows).toEqual([
      { period: "total", product: null, unit: "EMBALAGEM:1", value: "10.000" },
      { period: "total", product: null, unit: "EMBALAGEM:4", value: "3.750" },
    ]);
  });
  it("treats product text as data, never as SQL or a regular expression", async () => {
    for (const productSearch of [
      "maçã'); DROP TABLE public.venda; --",
      ".*",
      "MAÇÃ|BANANA",
      "\\d+",
    ]) {
      const { current } = await reader.read(query({ productSearch }), signal());
      expect(current.rows).toEqual([]);
      expect(current.products).toEqual([]);
    }
    const count = await admin.query<{ count: string }>(
      "SELECT count(*) FROM public.venda",
    );
    expect(count.rows[0].count).toBe("11");
    expect(() => vrmasterAggregateSql(query({ metric: "weight" }))).toThrow();
  });
  it("leaves no transaction open after reading", async () => {
    await reader.read(query({ productSearch: "banana" }), signal());
    const open = await admin.query<{ count: string }>(
      "SELECT count(*) FROM pg_stat_activity WHERE usename = 'ia_mns' AND state LIKE 'idle in transaction%'",
    );
    expect(open.rows[0].count).toBe("0");
  });
  it("stops a blocked read when the turn is aborted", async () => {
    const blocker = new pg.Client({
      host: connection.host,
      port: connection.port,
      database: "vrmaster",
      user: "postgres",
      password: adminPassword,
    });
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE public.venda IN ACCESS EXCLUSIVE MODE");
      const controller = new AbortController();
      const started = Date.now();
      setTimeout(() => controller.abort(), 300);
      await expect(
        reader.read(query({}), controller.signal),
      ).rejects.toMatchObject({
        code: "SALES_PROVIDER_UNAVAILABLE",
        boundary: { provider: "postgresql", stage: "query" },
      });
      expect(Date.now() - started).toBeLessThan(4000);
    } finally {
      await blocker.query("ROLLBACK");
      await blocker.end();
    }
    // The pool recovers with a new connection.
    const { current } = await reader.read(query({}), signal());
    expect(current.rows[0].value).toBe("51.85");
  });
  it("fails safely when VRMaster is unavailable or refuses the account", async () => {
    const closed = createVrmasterReader({ ...connection, port: 1 });
    const refused = createVrmasterReader({
      ...connection,
      password: wrongPassword,
    });
    try {
      for (const failing of [closed, refused]) {
        const error = await failing
          .read(query({}), signal())
          .catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(SalesFailure);
        expect(error).toMatchObject({
          code: "SALES_PROVIDER_UNAVAILABLE",
          boundary: { provider: "postgresql", stage: "connection" },
        });
        expect(String((error as Error).message)).not.toContain(wrongPassword);
      }
    } finally {
      await closed.close();
      await refused.close();
    }
  });
});
