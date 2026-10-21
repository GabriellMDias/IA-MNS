-- Additive: the owner-administered WhatsApp channel switch joins the
-- operational parameters (ADR-0028). The key and value checks are replaced by
-- supersets: every row valid before remains valid, so the replacement only
-- validates the small existing table once. Without a row the installation
-- default (IA_MNS_WHATSAPP_CHANNEL, disabled unless set) applies.
BEGIN;
ALTER TABLE "operational_parameters"
  DROP CONSTRAINT "operational_parameters_key_check",
  DROP CONSTRAINT "operational_parameters_value_check";
ALTER TABLE "operational_parameters"
  ADD CONSTRAINT "operational_parameters_key_check" CHECK (key IN ('ai.model', 'ai.traceLevel', 'access.providerGrants', 'channels.whatsapp')),
  ADD CONSTRAINT "operational_parameters_value_check" CHECK (
    value IS NULL
    OR (key = 'ai.model' AND jsonb_typeof(value) = 'string' AND (value #>> '{}') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$')
    OR (key = 'ai.traceLevel' AND jsonb_typeof(value) = 'string' AND (value #>> '{}') IN ('off', 'metadata', 'content'))
    OR (key = 'access.providerGrants' AND jsonb_typeof(value) = 'array' AND jsonb_array_length(value) <= 32
      AND NOT jsonb_path_exists(value, '$[*] ? (@.type() != "string")'))
    OR (key = 'channels.whatsapp' AND jsonb_typeof(value) = 'string' AND (value #>> '{}') IN ('enabled', 'disabled'))
  );
COMMIT;
