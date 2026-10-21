-- Provider defaults are explicit group assignments, never implicit permissions.
-- Existing grants, memberships and the historical parameter audit are retained.
-- Owners select the groups before enabling automatic membership.
BEGIN;
CREATE TABLE "identity_provider_groups" (
  "provider" VARCHAR(16) NOT NULL,
  "group_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_provider_groups_pkey" PRIMARY KEY ("provider"),
  CONSTRAINT "identity_provider_groups_provider_check" CHECK (provider IN ('pdt', 'sankhya')),
  CONSTRAINT "identity_provider_groups_version_check" CHECK (version >= 0),
  CONSTRAINT "identity_provider_groups_actor_check" CHECK (group_id IS NULL OR updated_by IS NOT NULL),
  CONSTRAINT "identity_provider_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "identity_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "identity_provider_groups" (provider) VALUES ('pdt'), ('sankhya');
COMMIT;
