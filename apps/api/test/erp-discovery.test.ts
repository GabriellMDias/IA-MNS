import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

const driver = vi.hoisted(() => ({
  load: vi.fn(),
  oracle: vi.fn(),
  connect: vi.fn(),
  query:
    vi.fn<
      (
        sql: string,
        ...args: unknown[]
      ) => Promise<{ rows: Record<string, unknown>[] }>
    >(),
  end: vi.fn(),
  close: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  mkdir: driver.mkdir,
  writeFile: driver.writeFile,
}));
vi.mock("../scripts/discovery-config.js", () => ({
  loadDiscoveryConfig: driver.load,
}));
vi.mock("../src/features/products/sankhya/session.js", () => ({
  createOracleProductReader: driver.oracle,
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      connect = driver.connect;
      query = driver.query;
      end = driver.end;
    },
  },
}));

const argv = process.argv;
const exitCode = process.exitCode;
let log: MockInstance<typeof console.log>;
let error: MockInstance<typeof console.error>;
async function run(erp: string, ...args: string[]) {
  process.argv = [
    "node",
    "erp-discovery.ts",
    erp,
    "--schema",
    "synthetic",
    "--table",
    "products",
    ...args,
  ];
  await import("../scripts/erp-discovery.js");
}

describe("bounded ERP inspection command", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.exitCode = undefined;
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    driver.load.mockResolvedValue({
      sankhyaUser: "synthetic_oracle_admin",
      sankhyaPassword: "synthetic_private_password",
      sankhyaConnectString: "example.test/service",
      vrmasterHost: "example.test",
      vrmasterPort: 5432,
      vrmasterDatabase: "synthetic",
      vrmasterUser: "synthetic_pg_admin",
      vrmasterPassword: "synthetic_private_password",
      vrmasterSslMode: "verify-full",
    });
    driver.connect.mockResolvedValue(undefined);
    driver.end.mockResolvedValue(undefined);
    driver.close.mockResolvedValue(undefined);
    driver.mkdir.mockResolvedValue(undefined);
    driver.writeFile.mockResolvedValue(undefined);
    driver.query.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: /pg_attribute|ALL_TAB_COLUMNS/.test(sql)
          ? [{ column_name: "id" }]
          : /pg_constraint|ALL_CONSTRAINTS/.test(sql)
            ? [{ name: "synthetic_fk" }]
            : /^SELECT/.test(sql)
              ? [{ id: 1, name: "synthetic confidential record" }]
              : [],
      }),
    );
    driver.oracle.mockReturnValue({
      read: async (
        _signal: AbortSignal,
        operation: (session: {
          query: (sql: string, ...args: unknown[]) => Promise<unknown[]>;
        }) => Promise<void>,
      ) =>
        operation({
          query: async (sql: string, ...args: unknown[]) =>
            (await driver.query(sql, ...args)).rows,
        }),
      close: driver.close,
    });
  });
  afterEach(() => {
    process.argv = argv;
    process.exitCode = exitCode;
    vi.restoreAllMocks();
  });

  it.each(["sankhya", "vrmaster"])(
    "%s inspects metadata and explicitly selected bounded data without console disclosure",
    async (erp) => {
      await run(erp, "--columns", "id,name", "--limit", "3");
      expect(driver.load).toHaveBeenCalledWith(erp);
      const statements = driver.query.mock.calls.map(([sql]) => sql);
      expect(statements.filter((sql) => /^SELECT/.test(sql))).toHaveLength(3);
      expect(
        statements.some((sql) =>
          sql.includes('SELECT "id", "name" FROM "synthetic"."products"'),
        ),
      ).toBe(true);
      expect(driver.writeFile).toHaveBeenCalledOnce();
      expect(driver.writeFile.mock.calls[0][1]).toContain(
        "synthetic confidential record",
      );
      const output =
        JSON.stringify(log.mock.calls) + JSON.stringify(error.mock.calls);
      expect(output).not.toContain("synthetic confidential record");
      expect(output).not.toContain("synthetic_private_password");
      expect(process.exitCode).toBeUndefined();
      if (erp === "vrmaster") {
        expect(statements[0]).toBe(
          "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        expect(statements.at(-1)).toBe("ROLLBACK");
        expect(driver.end).toHaveBeenCalledOnce();
        expect(driver.query.mock.calls.at(-2)?.[1]).toEqual([3]);
      } else {
        expect(driver.oracle).toHaveBeenCalledWith(
          expect.objectContaining({ sankhyaUser: "synthetic_oracle_admin" }),
          "discovery",
        );
        expect(driver.query.mock.calls.at(-1)?.[1]).toEqual({ rowLimit: 3 });
        expect(driver.close).toHaveBeenCalledOnce();
      }
    },
  );
  it("metadata-only inspection never queries record values", async () => {
    await run("vrmaster");
    expect(
      driver.query.mock.calls.filter(([sql]) => /^SELECT/.test(sql)),
    ).toHaveLength(2);
    expect(driver.writeFile.mock.calls[0][1]).not.toContain(
      "synthetic confidential record",
    );
  });
  it.each([
    ["--columns", "id;DELETE"],
    ["--table", "other"],
    ["--limit", "101"],
    ["--limit", "0"],
    ["--sql", "DELETE FROM products"],
  ])(
    "refuses unsafe or unsupported arguments before credential access: %s %s",
    async (...args) => {
      await run("vrmaster", ...args);
      expect(driver.load).not.toHaveBeenCalled();
      expect(driver.query).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    },
  );
  it("rolls back and closes on a driver failure without exposing private errors", async () => {
    driver.query.mockImplementation((sql: string) => {
      if (/^SELECT/.test(sql))
        return Promise.reject(new Error("synthetic-private-driver-password"));
      return Promise.resolve({ rows: [] });
    });
    await run("vrmaster");
    expect(driver.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(driver.end).toHaveBeenCalledOnce();
    expect(driver.writeFile).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      "synthetic-private-driver-password",
    );
    expect(process.exitCode).toBe(1);
  });
  it("refuses metadata overflow without publishing a truncated inspection", async () => {
    driver.query.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: /^SELECT/.test(sql)
          ? Array.from({ length: 2001 }, () => ({ id: 1 }))
          : [],
      }),
    );
    await run("vrmaster");
    expect(driver.writeFile).not.toHaveBeenCalled();
    expect(driver.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(driver.end).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });
});
