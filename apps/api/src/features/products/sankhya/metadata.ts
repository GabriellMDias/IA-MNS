import { createHash } from "node:crypto";
import type { OracleRow, OracleSession } from "./session.js";

/** Reviewed product frontier, reached from TGFPRO mappings; no ERP-wide crawl. */
export const discoveryTables = [
  "TGFPRO",
  "TGFGRU",
  "TGFMAR",
  "TGFVOL",
  "TGFVOA",
  "TGFCLP",
  "TGFCLA",
  "TSICUS",
  "TGFPAP",
  "TGFPAR",
  "AD_LISTADCEMB",
] as const;
const scalar = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  throw new Error("Unexpected dictionary scalar");
};
const signature = (value: unknown): string | null =>
  scalar(value).trim() === ""
    ? null
    : createHash("sha256").update(scalar(value)).digest("hex");
const string = (row: OracleRow, key: string) => scalar(row[key]).trim();
export function nativeType(row: OracleRow): string {
  const type = string(row, "DATA_TYPE");
  if (type === "NUMBER" && row.DATA_PRECISION !== null)
    return `NUMBER(${Number(row.DATA_PRECISION)},${Number(row.DATA_SCALE ?? 0)})`;
  if (["VARCHAR2", "CHAR", "NVARCHAR2", "NCHAR", "RAW"].includes(type))
    return `${type}(${Number(row.DATA_LENGTH)})`;
  return type;
}

/** Raw rules are fingerprinted, never executable catalog SQL or model input. */
export async function discoverMetadata(session: OracleSession) {
  const binds = Object.fromEntries(
    discoveryTables.map((name, index) => [`n${index}`, name]),
  );
  const list = discoveryTables.map((_, index) => `:n${index}`).join(",");
  const owner = (table: string) =>
    `COALESCE((SELECT S.TABLE_OWNER FROM USER_SYNONYMS S WHERE S.SYNONYM_NAME=${table} AND S.DB_LINK IS NULL), USER)`;
  const columns = await session.query(
    `SELECT C.TABLE_NAME,C.COLUMN_NAME,C.DATA_TYPE,C.DATA_LENGTH,C.DATA_PRECISION,C.DATA_SCALE,C.NULLABLE FROM ALL_TAB_COLUMNS C WHERE C.TABLE_NAME IN (${list}) AND C.OWNER=${owner("C.TABLE_NAME")} ORDER BY C.TABLE_NAME,C.COLUMN_ID`,
    binds,
    6000,
  );
  const tables = await session.query(
    `SELECT NOMETAB,DESCRTAB FROM TDDTAB WHERE NOMETAB IN (${list}) ORDER BY NOMETAB`,
    binds,
    20,
  );
  const fields = await session.query(
    `SELECT NOMETAB,NOMECAMPO,DESCRCAMPO,CALCULADO,ADICIONAL,EXPRESSAO FROM TDDCAM WHERE NOMETAB IN (${list}) ORDER BY NOMETAB,NOMECAMPO`,
    binds,
    6000,
  );
  const options = await session.query(
    `SELECT C.NOMETAB,C.NOMECAMPO,O.VALOR,O.OPCAO FROM TDDCAM C JOIN TDDOPC O ON O.NUCAMPO=C.NUCAMPO WHERE C.NOMETAB IN (${list}) ORDER BY C.NOMETAB,C.NOMECAMPO,O.VALOR`,
    binds,
    6000,
  );
  const properties = await session.query(
    `SELECT C.NOMETAB,C.NOMECAMPO,P.NOME,P.VALOR FROM TDDCAM C JOIN TDDPCO P ON P.NUCAMPO=C.NUCAMPO WHERE C.NOMETAB IN (${list}) ORDER BY C.NOMETAB,C.NOMECAMPO,P.NOME`,
    binds,
    12000,
  );
  const instances = await session.query(
    `SELECT NUINSTANCIA,NOMETAB,NOMEINSTANCIA,ATIVO,NUINSTANCIAPAI,EXPRESSAO,NOMESCRIPTCHAVE FROM TDDINS WHERE NOMETAB IN (${list}) ORDER BY NOMETAB,NUINSTANCIA`,
    binds,
    2000,
  );
  const links = await session.query(
    `SELECT O.NOMETAB ORIGIN_TABLE,O.NOMEINSTANCIA ORIGIN_INSTANCE,D.NOMETAB TARGET_TABLE,D.NOMEINSTANCIA TARGET_INSTANCE,L.NUINSTORIG,L.NUINSTDEST,L.TIPLIGACAO,L.OBRIGATORIA,L.EXPRESSAO,L.CONDICAO,O.EXPRESSAO ORIGIN_EXPRESSION,D.EXPRESSAO TARGET_EXPRESSION,D.NOMESCRIPTCHAVE TARGET_KEY_SCRIPT,D.ATIVO TARGET_ACTIVE FROM TDDLIG L JOIN TDDINS O ON O.NUINSTANCIA=L.NUINSTORIG JOIN TDDINS D ON D.NUINSTANCIA=L.NUINSTDEST WHERE O.NOMETAB IN (${list}) ORDER BY O.NUINSTANCIA,D.NUINSTANCIA`,
    binds,
    6000,
  );
  const mappings = await session.query(
    `SELECT L.NUINSTORIG,L.NUINSTDEST,O.NOMETAB ORIGIN_TABLE,O.NOMECAMPO ORIGIN_COLUMN,D.NOMETAB TARGET_TABLE,D.NOMECAMPO TARGET_COLUMN,L.ORIG_OBRIGATORIA FROM TDDLGC L JOIN TDDCAM O ON O.NUCAMPO=L.NUCAMPOORIG JOIN TDDCAM D ON D.NUCAMPO=L.NUCAMPODEST WHERE O.NOMETAB IN (${list}) ORDER BY L.NUINSTORIG,L.NUINSTDEST,L.NUCAMPOORIG`,
    binds,
    6000,
  );
  const constraints = await session.query(
    `SELECT C.TABLE_NAME,C.CONSTRAINT_NAME,C.CONSTRAINT_TYPE,C.STATUS,C.VALIDATED,F.COLUMN_NAME,F.POSITION,R.TABLE_NAME TARGET_TABLE,RF.COLUMN_NAME TARGET_COLUMN FROM ALL_CONSTRAINTS C JOIN ALL_CONS_COLUMNS F ON F.OWNER=C.OWNER AND F.CONSTRAINT_NAME=C.CONSTRAINT_NAME LEFT JOIN ALL_CONSTRAINTS R ON R.OWNER=C.R_OWNER AND R.CONSTRAINT_NAME=C.R_CONSTRAINT_NAME LEFT JOIN ALL_CONS_COLUMNS RF ON RF.OWNER=R.OWNER AND RF.CONSTRAINT_NAME=R.CONSTRAINT_NAME AND RF.POSITION=F.POSITION WHERE C.TABLE_NAME IN (${list}) AND C.OWNER=${owner("C.TABLE_NAME")} AND C.CONSTRAINT_TYPE IN ('P','U','R') ORDER BY C.TABLE_NAME,C.CONSTRAINT_NAME,F.POSITION`,
    binds,
    3000,
  );
  const indexes = await session.query(
    `SELECT I.TABLE_NAME,I.INDEX_NAME,I.UNIQUENESS,C.COLUMN_NAME,C.COLUMN_POSITION FROM ALL_INDEXES I JOIN ALL_IND_COLUMNS C ON C.INDEX_OWNER=I.OWNER AND C.INDEX_NAME=I.INDEX_NAME WHERE I.TABLE_NAME IN (${list}) AND I.TABLE_OWNER=${owner("I.TABLE_NAME")} ORDER BY I.TABLE_NAME,I.INDEX_NAME,C.COLUMN_POSITION`,
    binds,
    3000,
  );
  return {
    root: "TGFPRO",
    depth: 2,
    maximumTables: Number(discoveryTables.length),
    tables: discoveryTables.map((name) => ({
      name: String(name),
      description: string(
        tables.find((row) => row.NOMETAB === name) ?? {},
        "DESCRTAB",
      ),
      columns: columns
        .filter((row) => row.TABLE_NAME === name)
        .map((row) => ({
          name: string(row, "COLUMN_NAME"),
          type: nativeType(row),
          nullable: row.NULLABLE === "Y",
        })),
      fields: fields
        .filter((row) => row.NOMETAB === name)
        .map((row) => ({
          name: string(row, "NOMECAMPO"),
          description: string(row, "DESCRCAMPO"),
          calculated: row.CALCULADO === "S",
          custom:
            row.ADICIONAL === "S" || string(row, "NOMECAMPO").startsWith("AD_"),
          expressionSignature: signature(row.EXPRESSAO),
        })),
      options: options
        .filter((row) => row.NOMETAB === name)
        .map((row) => ({
          field: string(row, "NOMECAMPO"),
          value: string(row, "VALOR"),
          label: string(row, "OPCAO"),
        })),
      properties: properties
        .filter((row) => row.NOMETAB === name)
        .map((row) => ({
          field: string(row, "NOMECAMPO"),
          name: string(row, "NOME"),
          signature: signature(row.VALOR),
        })),
      instances: instances
        .filter((row) => row.NOMETAB === name)
        .map((row) => ({
          id: Number(row.NUINSTANCIA),
          name: string(row, "NOMEINSTANCIA"),
          active: row.ATIVO === "S",
          parent:
            row.NUINSTANCIAPAI === null ? null : Number(row.NUINSTANCIAPAI),
          expressionSignature: signature(row.EXPRESSAO),
          keyScript: Boolean(row.NOMESCRIPTCHAVE),
        })),
      constraints: constraints
        .filter((row) => row.TABLE_NAME === name)
        .map((row) => ({
          name: string(row, "CONSTRAINT_NAME"),
          kind: string(row, "CONSTRAINT_TYPE"),
          column: string(row, "COLUMN_NAME"),
          position: Number(row.POSITION),
          target:
            row.TARGET_TABLE === null ? null : string(row, "TARGET_TABLE"),
          targetColumn:
            row.TARGET_COLUMN === null ? null : string(row, "TARGET_COLUMN"),
          enabled: row.STATUS === "ENABLED",
          validated: row.VALIDATED === "VALIDATED",
        })),
      indexes: indexes
        .filter((row) => row.TABLE_NAME === name)
        .map((row) => ({
          name: string(row, "INDEX_NAME"),
          unique: row.UNIQUENESS === "UNIQUE",
          column: string(row, "COLUMN_NAME"),
          position: Number(row.COLUMN_POSITION),
        })),
    })),
    links: links.map((row) => ({
      originTable: string(row, "ORIGIN_TABLE"),
      originInstance: string(row, "ORIGIN_INSTANCE"),
      targetTable: string(row, "TARGET_TABLE"),
      targetInstance: string(row, "TARGET_INSTANCE"),
      origin: Number(row.NUINSTORIG),
      target: Number(row.NUINSTDEST),
      joinType: string(row, "TIPLIGACAO"),
      mandatory: row.OBRIGATORIA === "S",
      targetActive: row.TARGET_ACTIVE === "S",
      expressionSignature: signature(row.EXPRESSAO),
      conditionSignature: signature(row.CONDICAO),
      originExpressionSignature: signature(row.ORIGIN_EXPRESSION),
      targetExpressionSignature: signature(row.TARGET_EXPRESSION),
      targetKeyScript: Boolean(row.TARGET_KEY_SCRIPT),
      join: mappings
        .filter(
          (map) =>
            map.NUINSTORIG === row.NUINSTORIG &&
            map.NUINSTDEST === row.NUINSTDEST,
        )
        .map((map) => ({
          fromTable: string(map, "ORIGIN_TABLE"),
          from: string(map, "ORIGIN_COLUMN"),
          toTable: string(map, "TARGET_TABLE"),
          to: string(map, "TARGET_COLUMN"),
          required: map.ORIG_OBRIGATORIA === "S",
        })),
      status: "discovered" as const,
    })),
  };
}
export type SankhyaMetadata = Awaited<ReturnType<typeof discoverMetadata>>;
export const metadataFingerprint = (metadata: unknown) =>
  createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
