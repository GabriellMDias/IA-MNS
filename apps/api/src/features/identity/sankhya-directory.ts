import oracledb from "oracledb";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { ServerConfig } from "../../config.js";
import { ensureOracleClient } from "../../oracle-client.js";
import { normalizeEmail } from "./domain.js";

/** A real Sankhya user as read from the ERP directory (never credentials or CPF). */
export type SankhyaUser = Readonly<{
  codusu: string;
  login: string;
  name: string | null;
  email: string | null;
  /** DTLIMACESSO in the past: Sankhya no longer allows this user to sign in. */
  accessExpired: boolean;
}>;

/** Owner-facing lookup used to attest links to existing Sankhya accounts. */
export interface SankhyaDirectory {
  search(query: string): Promise<SankhyaUser[]>;
  find(codusu: string): Promise<SankhyaUser | null>;
  close(): Promise<void>;
}

const rowsSchema = Type.Array(
  Type.Object({
    CODUSU: Type.String({ pattern: "^[1-9][0-9]{0,9}$" }),
    NOMEUSU: Type.String({ minLength: 1 }),
    NOMEUSUCPLT: Type.Union([Type.String(), Type.Null()]),
    EMAIL: Type.Union([Type.String(), Type.Null()]),
    EXPIRED: Type.Integer({ minimum: 0, maximum: 1 }),
  }),
);

// Only these columns are read, from a DBA-provided view (SANKHYA_DIRECTORY_VIEW)
// over TSIUSU that exposes nothing else: never passwords or personal documents.
const columns = `TO_CHAR(CODUSU) AS CODUSU, NOMEUSU, NOMEUSUCPLT, EMAIL,
  CASE WHEN DTLIMACESSO IS NOT NULL AND DTLIMACESSO < TRUNC(SYSDATE) THEN 1 ELSE 0 END AS EXPIRED`;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function view(row: Static<typeof rowsSchema>[number]): SankhyaUser {
  return {
    codusu: row.CODUSU,
    login: row.NOMEUSU.trim(),
    name: row.NOMEUSUCPLT?.trim() || null,
    email: normalizeEmail(row.EMAIL),
    accessExpired: row.EXPIRED === 1,
  };
}

export function createSankhyaDirectory(config: ServerConfig): SankhyaDirectory {
  // Validated by configuration as a plain (optionally schema-qualified) identifier.
  const source = config.sankhyaDirectoryView;
  if (!source) throw new Error("Sankhya directory view is not configured");
  let poolPromise: Promise<oracledb.Pool> | undefined;
  const pool = () => {
    if (!poolPromise) {
      ensureOracleClient(config.oracleClientLibDir);
      poolPromise = oracledb
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
          poolPromise = undefined;
          throw cause;
        });
    }
    return poolPromise;
  };
  async function query(sql: string, binds: Record<string, string>) {
    const connection = await (await pool()).getConnection();
    try {
      connection.callTimeout = 10_000;
      await connection.execute("SET TRANSACTION READ ONLY");
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: 21,
        autoCommit: false,
      });
      if (!Value.Check(rowsSchema, result.rows))
        throw new Error("Invalid Sankhya directory response");
      return result.rows.map(view);
    } finally {
      await connection.rollback().catch(() => undefined);
      await connection.close();
    }
  }
  return {
    async search(text) {
      const term = text.normalize("NFKC").trim().toUpperCase().slice(0, 60);
      if (term.length < 2) return [];
      const pattern = `%${escapeLike(term)}%`;
      return (
        await query(
          `SELECT ${columns} FROM ${source}
            WHERE CODUSU > 0 AND (UPPER(NOMEUSU) LIKE :pattern ESCAPE '\\' OR UPPER(NOMEUSUCPLT) LIKE :pattern ESCAPE '\\')
            ORDER BY NOMEUSU FETCH FIRST 20 ROWS ONLY`,
          { pattern },
        )
      ).slice(0, 20);
    },
    async find(codusu) {
      if (!/^[1-9][0-9]{0,9}$/.test(codusu)) return null;
      const rows = await query(
        `SELECT ${columns} FROM ${source} WHERE CODUSU = TO_NUMBER(:codusu)`,
        { codusu },
      );
      return rows[0] ?? null;
    },
    async close() {
      const current = poolPromise;
      poolPromise = undefined;
      if (current) await (await current).close(0).catch(() => undefined);
    },
  };
}
