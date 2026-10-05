import oracledb from "oracledb";

/**
 * Selects Thick mode once per process when an Oracle Client directory is
 * configured. node-oracledb initialization is process-global, so every module
 * that opens Sankhya connections calls this instead of initOracleClient.
 */
export function ensureOracleClient(libDir: string | undefined): void {
  if (libDir && oracledb.thin) oracledb.initOracleClient({ libDir });
}
