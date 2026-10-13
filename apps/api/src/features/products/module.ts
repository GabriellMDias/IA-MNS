import type { ServerConfig } from "../../config.js";
import type { ApiModule } from "../../module.js";
import { vrmasterConnection } from "../../vrmaster-connection.js";
import { productErrors } from "./errors.js";

/** Product lookup needs the model provider and at least one ERP connection. */
export function productsConfigured(config: ServerConfig): boolean {
  return Boolean(
    config.openaiApiKey &&
    (vrmasterConnection(config) ||
      (config.sankhyaUser &&
        config.sankhyaPassword &&
        config.sankhyaConnectString)),
  );
}

/**
 * Product lookup runs through the corporate agent and has no HTTP routes of
 * its own yet; the module owns its public error codes. ERP configuration is
 * optional; the Sankhya adapter additionally verifies least privilege at use.
 */
export function createProductsModule(): ApiModule {
  return {
    name: "products",
    tag: "Products",
    requires: [],
    operations: [],
    errors: productErrors,
    activate: () => ({ name: "products", register: () => undefined }),
  };
}
