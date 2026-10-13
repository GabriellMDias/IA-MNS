/** Opt-in live reads with the Runtime identities. No AI, row values or mutations. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { loadLocalEnvironment } from "./local-environment.js";
import { parseServerConfig } from "../src/config.js";
import oracledb from "oracledb";
import { ensureOracleClient } from "../src/oracle-client.js";
import { createOracleReader } from "../src/features/sales/oracle.js";
import { createVrmasterReader } from "../src/features/sales/vrmaster.js";
import { createSankhyaDirectory } from "../src/features/identity/sankhya-directory.js";
import { vrmasterConnection } from "../src/vrmaster-connection.js";
import type { SalesQuery } from "../src/features/sales/domain.js";

async function main() {
  const config = parseServerConfig(await loadLocalEnvironment());
  const vrmaster = vrmasterConnection(config);
  if (
    config.sankhyaUser?.toUpperCase() !== "IA_MNS_RO" ||
    vrmaster?.user !== "ia_mns"
  )
    throw new Error(
      "Live verification requires the designated runtime identities",
    );
  const query: SalesQuery = {
    startDate: "2026-10-10",
    endDate: "2026-10-10",
    productSearch: null,
    metric: "net_value",
    groupBy: "total",
    comparison: "none",
  };
  const findings: {
    capability: string;
    status: "passed" | "failed";
    recordValuesPrinted: false;
    aiCalled: false;
  }[] = [];
  for (const [capability, reader] of [
    ["sankhya-sales", createOracleReader(config)],
    ["vrmaster-sales", createVrmasterReader(vrmaster)],
  ] as const) {
    try {
      await reader.read(query, AbortSignal.timeout(90000));
      findings.push({
        capability,
        status: "passed",
        recordValuesPrinted: false,
        aiCalled: false,
      });
    } catch {
      findings.push({
        capability,
        status: "failed",
        recordValuesPrinted: false,
        aiCalled: false,
      });
      process.exitCode = 1;
    } finally {
      await reader.close();
    }
  }
  const directory = createSankhyaDirectory(config);
  try {
    // A random non-personal search exercises the actual five-column adapter SQL.
    await directory.search(
      `IA_MNS_ACCESS_AUDIT_${randomUUID().replaceAll("-", "")}`,
    );
    findings.push({
      capability: "sankhya-user-directory",
      status: "passed",
      recordValuesPrinted: false,
      aiCalled: false,
    });
  } catch {
    findings.push({
      capability: "sankhya-user-directory",
      status: "failed",
      recordValuesPrinted: false,
      aiCalled: false,
    });
    process.exitCode = 1;
  } finally {
    await directory.close();
  }
  ensureOracleClient(config.oracleClientLibDir);
  const oracle = await oracledb.getConnection({
    user: config.sankhyaUser,
    password: config.sankhyaPassword,
    connectString: config.sankhyaConnectString,
  });
  try {
    oracle.callTimeout = 15000;
    await oracle.execute("SET TRANSACTION READ ONLY");
    const owner = (
      await oracle.execute<{ TABLE_OWNER: string }>(
        "SELECT TABLE_OWNER FROM USER_SYNONYMS WHERE SYNONYM_NAME='IA_MNS_USER_DIRECTORY' AND DB_LINK IS NULL",
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      )
    ).rows?.[0]?.TABLE_OWNER;
    if (!owner) throw new Error("Missing runtime directory name resolution");
    const columns =
      (
        await oracle.execute<{ COLUMN_NAME: string }>(
          "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER=:owner AND TABLE_NAME='IA_MNS_USER_DIRECTORY'",
          { owner },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        )
      ).rows ?? [];
    const projectionVerified =
      columns
        .map((row) => row.COLUMN_NAME)
        .sort()
        .join(",") ===
      ["CODUSU", "NOMEUSU", "NOMEUSUCPLT", "EMAIL", "DTLIMACESSO"]
        .sort()
        .join(",");
    let rawTableDenied = false;
    try {
      await oracle.execute(
        `SELECT CODUSU FROM "${owner.replaceAll('"', '""')}".TSIUSU WHERE 1=0`,
      );
    } catch (cause) {
      rawTableDenied = ["ORA-00942", "ORA-01031"].includes(
        String((cause as { code?: string }).code),
      );
    }
    findings.push({
      capability: "sankhya-directory-projection-and-raw-table-denial",
      status: projectionVerified && rawTableDenied ? "passed" : "failed",
      recordValuesPrinted: false,
      aiCalled: false,
    });
    if (!projectionVerified || !rawTableDenied) process.exitCode = 1;
  } catch {
    findings.push({
      capability: "sankhya-directory-projection-and-raw-table-denial",
      status: "failed",
      recordValuesPrinted: false,
      aiCalled: false,
    });
    process.exitCode = 1;
  } finally {
    try {
      await oracle.rollback();
    } finally {
      await oracle.close();
    }
  }
  await mkdir("evals/.local/runtime-access", { recursive: true });
  await writeFile(
    "evals/.local/runtime-access/runtime-verification.json",
    JSON.stringify({ on: new Date().toISOString(), findings }, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(findings));
}
try {
  await main();
} catch {
  console.error(
    "Runtime access verification failed; inspect safe local diagnostics. No record values or credentials were emitted.",
  );
  process.exitCode = 1;
}
