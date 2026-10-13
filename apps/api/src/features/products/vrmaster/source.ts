import {
  createVrmasterPool,
  vrmasterTransactionSettings,
  type VrmasterConnection,
} from "../../../vrmaster-connection.js";
import { createPostgresProductSource } from "../postgres-source.js";
import type { ProductSource } from "../source.js";
import { vrmasterCatalog } from "./catalog.js";

/** VRMaster product lookup: its catalog over the dedicated read-only account. */
export function createVrmasterProductSource(
  connection: VrmasterConnection,
): ProductSource {
  return createPostgresProductSource(
    vrmasterCatalog,
    () => createVrmasterPool(connection),
    vrmasterTransactionSettings,
  );
}
