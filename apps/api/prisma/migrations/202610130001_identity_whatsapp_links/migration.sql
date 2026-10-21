-- Additive: the WhatsApp number that an owner links to a Person, the only
-- authorization of the WhatsApp channel. One number per Person and one Person
-- per number (or per legacy Brazilian identifier, or per learned WhatsApp
-- user identifier). The table starts empty, so no existing behavior changes
-- until an owner links a number; an older application ignores it.
BEGIN;
CREATE TABLE "identity_whatsapp_links" (
  "person_id" UUID NOT NULL,
  "phone_number" VARCHAR(15) NOT NULL,
  "legacy_identifier" VARCHAR(15),
  "platform_user_id" VARCHAR(140),
  "version" INTEGER NOT NULL DEFAULT 1,
  "linked_by" UUID NOT NULL,
  "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMPTZ(3),
  CONSTRAINT "identity_whatsapp_links_pkey" PRIMARY KEY ("person_id"),
  CONSTRAINT "identity_whatsapp_links_phone_check" CHECK (phone_number ~ '^[1-9][0-9]{7,14}$'),
  CONSTRAINT "identity_whatsapp_links_legacy_check" CHECK (
    legacy_identifier IS NULL
    OR (legacy_identifier ~ '^55[1-9]{2}[6-9][0-9]{7}$' AND legacy_identifier <> phone_number)
  ),
  CONSTRAINT "identity_whatsapp_links_platform_user_check" CHECK (
    platform_user_id IS NULL OR platform_user_id ~ '^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$'
  ),
  CONSTRAINT "identity_whatsapp_links_version_check" CHECK (version >= 1)
);
CREATE UNIQUE INDEX "identity_whatsapp_links_phone_key" ON "identity_whatsapp_links"("phone_number");
CREATE UNIQUE INDEX "identity_whatsapp_links_legacy_key" ON "identity_whatsapp_links"("legacy_identifier");
CREATE UNIQUE INDEX "identity_whatsapp_links_platform_user_key" ON "identity_whatsapp_links"("platform_user_id");
ALTER TABLE "identity_whatsapp_links" ADD CONSTRAINT "identity_whatsapp_links_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
