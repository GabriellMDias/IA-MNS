import type { ServerConfig } from "../../config.js";
import type { SourceReaders } from "./application.js";
import { createOracleReader } from "./oracle.js";
import { createVrmasterReader, vrmasterConnection } from "./vrmaster.js";

/** One adapter per configured source; VRMaster is optional. */
export function createSalesReaders(config: ServerConfig): SourceReaders {
  const vrmaster = vrmasterConnection(config);
  return {
    sankhya: createOracleReader(config),
    ...(vrmaster ? { vrmaster: createVrmasterReader(vrmaster) } : {}),
  };
}
