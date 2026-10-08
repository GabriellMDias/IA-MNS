-- Additive: values of the owner-administered operational parameters
-- (ADR-0028). Without a row, or with a null value, a parameter keeps its
-- installation default, so existing installations behave exactly as before
-- until an owner saves a value. The application catalog validates every write;
-- these checks repeat the type and domain of each known key so that no other
-- writer can store an untyped or unknown value. A new parameter adds its key
-- here in a later migration.
BEGIN;
CREATE TABLE "operational_parameters" (
  "key" VARCHAR(64) NOT NULL,
  "value" JSONB,
  "version" INTEGER NOT NULL,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "operational_parameters_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "operational_parameters_key_check" CHECK (key IN ('ai.model', 'ai.traceLevel', 'access.providerGrants')),
  CONSTRAINT "operational_parameters_version_check" CHECK (version >= 1),
  CONSTRAINT "operational_parameters_value_check" CHECK (
    value IS NULL
    OR (key = 'ai.model' AND jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$')
    OR (key = 'ai.traceLevel' AND jsonb_typeof(value) = 'string' AND (value #>> '{}') IN ('off', 'metadata', 'content'))
    OR (key = 'access.providerGrants' AND jsonb_typeof(value) = 'array' AND jsonb_array_length(value) <= 32
      AND NOT jsonb_path_exists(value, '$[*] ? (@.type() != "string")'))
  )
);
COMMIT;
