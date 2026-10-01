interface ImportMetaEnv {
  readonly VITE_ORION_API_BASE_URL?: string;
}

declare const __ORION_FOUNDATION_VERSION__: {
  label: string;
  commit: string | null;
};

/** Display name from `.orion/project.json`, embedded at build time. */
declare const __PROJECT_NAME__: string;
