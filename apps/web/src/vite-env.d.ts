interface ImportMetaEnv {
  readonly VITE_ORION_API_BASE_URL?: string;
}

declare const __ORION_FOUNDATION_VERSION__: {
  label: string;
  commit: string | null;
};

/** Internal engineering tool; excluded from default production builds. */
declare const __ORION_INTERNAL_DOCS__: boolean;

/** Display name from the project manifest, embedded at build time. */
declare const __PROJECT_NAME__: string;
