import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { requiredColumns } from "../src/features/products/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { referenceSalesCte } from "../src/features/sales/query.js";
import { vrmasterSalesCte } from "../src/features/sales/vrmaster-query.js";

const template = async (name: string) =>
  (
    await readFile(
      new URL(`../scripts/erp-access/${name}-runtime.sql`, import.meta.url),
      "utf8",
    )
  ).replace(/^\s*--[^\n]*$/gm, "");
describe("reviewed external ERP Runtime grants", () => {
  it("Oracle SELECT scope matches actual enabled products, dictionary checks and sales SQL", async () => {
    const sql = await template("sankhya");
    const metadata = await readFile(
      new URL("../src/features/products/sankhya/metadata.ts", import.meta.url),
      "utf8",
    );
    const ctes = new Set(
      [...referenceSalesCte.matchAll(/\b([A-Z][A-Z0-9_]+)\s+AS\s*\(/g)].map(
        (match) => match[1],
      ),
    );
    const required = new Set([
      ...[...requiredColumns(sankhyaCatalog).keys()].map((name) =>
        name.split(".").at(-1)!.toUpperCase(),
      ),
      ...[
        ...referenceSalesCte.matchAll(/\b(?:FROM|JOIN)\s+([A-Z][A-Z0-9_]+)\b/g),
      ]
        .map((match) => match[1])
        .filter((name) => !ctes.has(name)),
      ...[...metadata.matchAll(/\b(?:FROM|JOIN)\s+(TDD[A-Z]+)\b/g)].map(
        (match) => match[1],
      ),
    ]);
    const granted = [
      ...sql.matchAll(
        /GRANT SELECT ON \{\{ERP_OWNER\}\}\.([A-Z_]+) TO IA_MNS_RO/g,
      ),
    ].map((match) => match[1]);
    expect(
      granted.filter((name) => name !== "IA_MNS_USER_DIRECTORY").sort(),
    ).toEqual([...required].sort());
    expect(required.size).toBe(24);
    for (const table of required)
      expect(sql).toContain(
        `CREATE SYNONYM IA_MNS_RO.${table} FOR {{ERP_OWNER}}.${table}`,
      );
    expect(sql).not.toMatch(
      /CREATE USER|ALTER USER|WITH GRANT OPTION|GRANT.*\bANY\b|GRANT.*\bEXECUTE\b|GRANT.*(?:INSERT|UPDATE|DELETE)/i,
    );
  });
  it("the Oracle directory is a five-column view and never a raw TSIUSU table grant", async () => {
    const sql = await template("sankhya");
    expect(sql).toContain(
      "SELECT CODUSU, NOMEUSU, NOMEUSUCPLT, EMAIL, DTLIMACESSO FROM {{ERP_OWNER}}.TSIUSU",
    );
    expect(sql).toContain(
      "GRANT SELECT ON {{ERP_OWNER}}.IA_MNS_USER_DIRECTORY TO IA_MNS_RO",
    );
    expect(sql).not.toContain("GRANT SELECT ON {{ERP_OWNER}}.TSIUSU");
    expect(sql).not.toMatch(/SELECT \*|\bSENHA\b|\bCPF\b|\bPASSWORD\b/);
  });
  it("PostgreSQL retains sales reference objects and grants only declared registration columns", async () => {
    const sql = await template("vrmaster");
    const sales = [
      ...new Set(
        [
          ...vrmasterSalesCte.matchAll(/\b(?:FROM|JOIN) public\.([a-z_]+)/g),
        ].map((match) => match[1]),
      ),
    ];
    const tables = [
      ...sql.matchAll(/GRANT SELECT ON public\.([a-z_]+) TO ia_mns/g),
    ].map((match) => match[1]);
    expect(tables.sort()).toEqual(sales.sort());
    const columns = [
      ...sql.matchAll(
        /GRANT SELECT \(([^)]+)\) ON public\.([a-z_]+) TO ia_mns/g,
      ),
    ];
    expect(columns).toHaveLength(3);
    for (const [, names, table] of columns) {
      const entity = vrmasterCatalog.entities.find(
        (item) => item.table.name === table,
      )!;
      expect(names.split(", ").sort()).toEqual(
        entity.columns.map((column) => column.name).sort(),
      );
      expect(entity.access).toBe("granted");
    }
    expect(sql).not.toMatch(
      /\bREVOKE\b|\bTO PUBLIC\b|ALTER ROLE|CREATE ROLE|WITH GRANT OPTION|ALL PRIVILEGES/i,
    );
    expect(sql).not.toMatch(/\b(?:preco|custo|estoque|cpf|senha|password)\b/i);
  });
});
