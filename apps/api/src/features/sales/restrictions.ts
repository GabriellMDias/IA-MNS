import oracledb from "oracledb";
import type pg from "pg";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { RestrictionDirectory, RestrictionOption } from "../../access.js";
import { restrictionLimits } from "../../access.js";
import type { ServerConfig } from "../../config.js";
import { ensureOracleClient } from "../../oracle-client.js";
import {
  createVrmasterPool,
  vrmasterConnection,
  vrmasterTransactionSettings,
} from "../../vrmaster-connection.js";
import { salesPermissions } from "./access.js";
import { accentedLetters, plainLetters } from "./product-match.js";

/** Values offered per search; owners narrow by typing. */
export const restrictionOptionLimit = 30;

type Definition = Readonly<{
  table: string;
  value: string;
  label: string;
  detail: string;
}>;

// Oracle expressions over the alias T. Every table is already read by the
// sales reference, except TSICUS (centros de resultado), whose Runtime grant
// awaits the owner (PH-36).
const sankhya: Readonly<Record<string, Definition>> = {
  company: {
    table: "TSIEMP",
    value: "CODEMP",
    label: "NVL(T.NOMEFANTASIA, T.RAZAOSOCIAL)",
    detail: "T.RAZAOSOCIAL",
  },
  project: {
    table: "TCSPRJ",
    value: "CODPROJ",
    label: "T.IDENTIFICACAO",
    detail: `'Nível ' || NVL(TO_CHAR(T.GRAU), '-') || CASE WHEN T.ANALITICO = 'S' THEN '' ELSE ' · inclui os subprojetos' END || CASE WHEN T.ATIVO = 'N' THEN ' · inativo' END`,
  },
  seller: {
    table: "TGFVEN",
    value: "CODVEND",
    label: "T.APELIDO",
    detail: `NVL((SELECT MAX(O.OPCAO) FROM TDDCAM DC JOIN TDDOPC O ON O.NUCAMPO = DC.NUCAMPO WHERE DC.NOMETAB = 'TGFVEN' AND DC.NOMECAMPO = 'TIPVEND' AND O.VALOR = T.TIPVEND), 'Sem tipo') || CASE WHEN T.ATIVO = 'N' THEN ' · inativo' END`,
  },
  product_group: {
    table: "TGFGRU",
    value: "CODGRUPOPROD",
    label: "T.DESCRGRUPOPROD",
    detail: `'Nível ' || NVL(TO_CHAR(T.GRAU), '-') || CASE WHEN T.ANALITICO = 'S' THEN '' ELSE ' · inclui os subgrupos' END || CASE WHEN T.ATIVO = 'N' THEN ' · inativo' END`,
  },
  result_center: {
    table: "TSICUS",
    value: "CODCENCUS",
    label: "T.DESCRCENCUS",
    detail: `'Nível ' || NVL(TO_CHAR(T.GRAU), '-') || CASE WHEN T.ANALITICO = 'S' THEN '' ELSE ' · inclui os centros abaixo' END || CASE WHEN T.ATIVO = 'N' THEN ' · inativo' END`,
  },
};

// PostgreSQL expressions over the alias t; all tables are read by the sales reference.
const vrmaster: Readonly<Record<string, Definition>> = {
  store: {
    table: "public.loja",
    value: "id",
    label: "t.descricao",
    detail: `CASE WHEN t.id_situacaocadastro = 1 THEN 'Ativa' ELSE 'Inativa' END`,
  },
  buyer: {
    table: "public.comprador",
    value: "id",
    label: "t.nome",
    detail: `CASE WHEN t.id_situacaocadastro = 1 THEN 'Ativo' ELSE 'Inativo' END`,
  },
  cost_center: {
    table: "public.centrocusto",
    value: "id",
    label: "COALESCE(NULLIF(btrim(t.descricao), ''), 'sem descrição')",
    detail: `'Nível ' || t.nivel || CASE WHEN t.nivel < 3 THEN ' · inclui os centros abaixo' ELSE '' END || CASE WHEN t.id_situacaocadastro = 1 THEN '' ELSE ' · inativo' END`,
  },
  classification: {
    table: "public.mercadologico",
    value: "id",
    label: "t.descricao",
    detail: `'Nível ' || t.nivel || COALESCE(' · ' || (SELECT string_agg(p.descricao, ' › ' ORDER BY p.nivel) FROM public.mercadologico p WHERE p.nivel < t.nivel AND p.mercadologico1 = t.mercadologico1 AND (p.nivel < 2 OR p.mercadologico2 = t.mercadologico2) AND (p.nivel < 3 OR p.mercadologico3 = t.mercadologico3) AND (p.nivel < 4 OR p.mercadologico4 = t.mercadologico4)), '')`,
  },
};

/** Tables the directory reads, for the Runtime grant review. */
export const restrictionTables = {
  sankhya: Object.values(sankhya).map((item) => item.table),
  vrmaster: Object.values(vrmaster).map((item) =>
    item.table.replace(/^public\./, ""),
  ),
} as const;

const rowsSchema = Type.Array(
  Type.Object({
    VALUE: Type.String({ pattern: "^-?\\d{1,15}$" }),
    LABEL: Type.Union([Type.String(), Type.Null()]),
    DETAIL: Type.Union([Type.String(), Type.Null()]),
  }),
);
const pgRowsSchema = Type.Array(
  Type.Object({
    value: Type.String({ pattern: "^-?\\d{1,15}$" }),
    label: Type.Union([Type.String(), Type.Null()]),
    detail: Type.Union([Type.String(), Type.Null()]),
  }),
);

function option(
  value: string,
  label: string | null,
  detail: string | null,
): RestrictionOption {
  return {
    value,
    label: (label?.trim() || value).slice(0, restrictionLimits.labelLength),
    detail: detail?.trim().slice(0, restrictionLimits.labelLength) || null,
  };
}

/** Upper-case, accent-free search words; digits also match a code exactly. */
function term(query: string): { pattern: string | null; code: string | null } {
  const text = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 60);
  return {
    pattern: text
      ? `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
      : null,
    code: /^-?\d{1,15}$/.test(text) ? text : null,
  };
}

function definition(
  permission: string,
  dimension: string,
): { source: "sankhya" | "vrmaster"; definition: Definition } | null {
  for (const source of ["sankhya", "vrmaster"] as const)
    if (
      salesPermissions[source].permission === permission &&
      salesPermissions[source].restrictions.some(
        (item) => item.id === dimension,
      )
    ) {
      const table = source === "sankhya" ? sankhya : vrmaster;
      const found = table[dimension];
      return found ? { source, definition: found } : null;
    }
  return null;
}

/**
 * Read-only directory of the values of the sales restriction dimensions, so
 * an owner chooses real ERP records and identity stores labels read from the
 * ERP, never typed by the browser. Each lookup is one bounded statement in a
 * read-only transaction with its own small pools.
 */
export function createSalesRestrictionDirectory(
  config: ServerConfig,
): (RestrictionDirectory & { close(): Promise<void> }) | undefined {
  const vr = vrmasterConnection(config);
  const oracleConfigured = Boolean(
    config.sankhyaUser && config.sankhyaPassword && config.sankhyaConnectString,
  );
  if (!oracleConfigured && !vr) return undefined;
  let oraclePool: Promise<oracledb.Pool> | undefined;
  let postgresPool: pg.Pool | undefined;
  const oracle = () => {
    if (!oraclePool) {
      ensureOracleClient(config.oracleClientLibDir);
      oraclePool = oracledb
        .createPool({
          user: config.sankhyaUser,
          password: config.sankhyaPassword,
          connectString: config.sankhyaConnectString,
          poolMin: 0,
          poolMax: 2,
          poolIncrement: 1,
          queueMax: 4,
          queueTimeout: 5000,
          connectTimeout: 5,
        })
        .catch((cause: unknown) => {
          oraclePool = undefined;
          throw cause;
        });
    }
    return oraclePool;
  };
  async function readOracle(
    sql: string,
    binds: Record<string, string | number | null>,
    signal: AbortSignal,
  ): Promise<RestrictionOption[]> {
    signal.throwIfAborted();
    const connection = await (await oracle()).getConnection();
    const interrupt = () => void connection.break().catch(() => undefined);
    signal.addEventListener("abort", interrupt, { once: true });
    try {
      connection.callTimeout = 10_000;
      await connection.execute("SET TRANSACTION READ ONLY");
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: restrictionLimits.values + 1,
        autoCommit: false,
      });
      if (!Value.Check(rowsSchema, result.rows))
        throw new Error("Invalid Sankhya restriction values");
      return result.rows.map((row) => option(row.VALUE, row.LABEL, row.DETAIL));
    } finally {
      signal.removeEventListener("abort", interrupt);
      await connection.rollback().catch(() => undefined);
      await connection.close();
    }
  }
  async function readPostgres(
    sql: string,
    values: unknown[],
    signal: AbortSignal,
  ): Promise<RestrictionOption[]> {
    signal.throwIfAborted();
    postgresPool ??= createVrmasterPool(vr!);
    const client = await postgresPool.connect();
    let broken = false;
    try {
      for (const statement of vrmasterTransactionSettings)
        await client.query(statement);
      await client.query("SET LOCAL statement_timeout = '10s'");
      const result = await client.query(sql, values);
      if (!Value.Check(pgRowsSchema, result.rows))
        throw new Error("Invalid VR Master restriction values");
      return result.rows.map((row) => option(row.value, row.label, row.detail));
    } catch (error) {
      broken = true;
      throw error;
    } finally {
      try {
        await client.query("ROLLBACK");
        client.release();
      } catch (cause) {
        client.release(cause instanceof Error ? cause : broken);
      }
    }
  }
  const oraclePlain = (expression: string) =>
    `UPPER(TRANSLATE(${expression}, '${accentedLetters}', '${plainLetters}'))`;
  const postgresPlain = (expression: string) =>
    `upper(translate(${expression}, '${accentedLetters}', '${plainLetters}'))`;
  return {
    async search(permission, dimension, query, signal) {
      const found = definition(permission, dimension);
      if (!found) return [];
      const { pattern, code } = term(query);
      const item = found.definition;
      if (found.source === "sankhya") {
        if (!oracleConfigured) throw new Error("Sankhya is not configured");
        return readOracle(
          `SELECT TO_CHAR(T.${item.value}) AS VALUE, ${item.label} AS LABEL, ${item.detail} AS DETAIL
            FROM ${item.table} T
            WHERE :pattern IS NULL OR TO_CHAR(T.${item.value}) = :code
              OR ${oraclePlain(item.label)} LIKE :pattern ESCAPE '\\'
            ORDER BY T.${item.value} FETCH FIRST ${restrictionOptionLimit} ROWS ONLY`,
          { pattern, code },
          signal,
        );
      }
      if (!vr) throw new Error("VR Master is not configured");
      return readPostgres(
        `SELECT t.${item.value}::text AS value, ${item.label} AS label, ${item.detail} AS detail
          FROM ${item.table} t
          WHERE $1::text IS NULL OR t.${item.value}::text = $2::text
            OR ${postgresPlain(item.label)} LIKE $1::text
          ORDER BY t.${item.value} LIMIT ${restrictionOptionLimit}`,
        [pattern, code],
        signal,
      );
    },
    async resolve(permission, dimension, values, signal) {
      const found = definition(permission, dimension);
      if (!found || values.length === 0) return [];
      if (
        values.length > restrictionLimits.values ||
        values.some((value) => !/^-?\d{1,15}$/.test(value))
      )
        throw new Error("Invalid restriction values");
      const item = found.definition;
      if (found.source === "sankhya") {
        if (!oracleConfigured) throw new Error("Sankhya is not configured");
        const binds = Object.fromEntries(
          values.map((value, index) => [`v${index}`, Number(value)]),
        );
        return readOracle(
          `SELECT TO_CHAR(T.${item.value}) AS VALUE, ${item.label} AS LABEL, ${item.detail} AS DETAIL
            FROM ${item.table} T
            WHERE T.${item.value} IN (${values.map((_, index) => `:v${index}`).join(", ")})
            ORDER BY T.${item.value}`,
          binds,
          signal,
        );
      }
      if (!vr) throw new Error("VR Master is not configured");
      return readPostgres(
        `SELECT t.${item.value}::text AS value, ${item.label} AS label, ${item.detail} AS detail
          FROM ${item.table} t
          WHERE t.${item.value} = ANY($1::int[])
          ORDER BY t.${item.value}`,
        [values.map(Number)],
        signal,
      );
    },
    async close() {
      const closing = oraclePool;
      oraclePool = undefined;
      const postgres = postgresPool;
      postgresPool = undefined;
      await Promise.all([
        closing?.then((pool) => pool.close(0)).catch(() => undefined),
        postgres?.end().catch(() => undefined),
      ]);
    },
  };
}
