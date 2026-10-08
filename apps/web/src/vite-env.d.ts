interface ImportMetaEnv {
  readonly VITE_ORION_API_BASE_URL?: string;
  readonly VITE_ORION_DOCS?: "enabled" | "disabled";
}

declare const __ORION_FOUNDATION_VERSION__: {
  label: string;
  commit: string | null;
};

/** Display name from `.orion/project.json`, embedded at build time. */
declare const __PROJECT_NAME__: string;

/**
 * Whether this build contains the /docs portal (VITE_ORION_DOCS, ADR-0029).
 * A literal at build time, so the bundler drops the portal when false.
 */
declare const __ORION_DOCUMENTATION__: boolean;
