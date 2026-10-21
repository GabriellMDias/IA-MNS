-- Additive (ADR-0037): data restrictions on explicit grants, and owner-managed
-- groups whose grants every member holds. All tables start empty, so effective
-- access is unchanged until an owner restricts a grant or creates a group; an
-- older application ignores them. Restriction values are ERP record codes
-- read from the owning source when the grant is saved; labels are display
-- copies. Every value of a dimension is admitted; every restricted dimension
-- of a grant must match.
BEGIN;
CREATE TABLE "identity_grant_restrictions" (
  "person_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "dimension" VARCHAR(32) NOT NULL,
  "value" VARCHAR(40) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  CONSTRAINT "identity_grant_restrictions_pkey" PRIMARY KEY ("person_id", "permission", "dimension", "value"),
  CONSTRAINT "identity_grant_restrictions_dimension_check" CHECK (dimension ~ '^[a-z][a-z_]{1,30}$'),
  CONSTRAINT "identity_grant_restrictions_value_check" CHECK (value ~ '^-?[0-9]{1,15}$'),
  CONSTRAINT "identity_grant_restrictions_label_check" CHECK (length(btrim(label)) > 0)
);
ALTER TABLE "identity_grant_restrictions" ADD CONSTRAINT "identity_grant_restrictions_grant_fkey"
  FOREIGN KEY ("person_id", "permission") REFERENCES "identity_capability_grants"("person_id", "permission") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "identity_groups" (
  "id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "name_key" VARCHAR(80) NOT NULL,
  "description" VARCHAR(300),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_groups_name_check" CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT "identity_groups_description_check" CHECK (description IS NULL OR length(btrim(description)) > 0),
  CONSTRAINT "identity_groups_version_check" CHECK (version >= 1)
);
CREATE UNIQUE INDEX "identity_groups_name_key" ON "identity_groups"("name_key");

CREATE TABLE "identity_group_members" (
  "group_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "added_by" UUID NOT NULL,
  "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_group_members_pkey" PRIMARY KEY ("group_id", "person_id")
);
CREATE INDEX "identity_group_members_person_idx" ON "identity_group_members"("person_id");
ALTER TABLE "identity_group_members" ADD CONSTRAINT "identity_group_members_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "identity_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_group_members" ADD CONSTRAINT "identity_group_members_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "identity_group_grants" (
  "group_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "granted_by" UUID NOT NULL,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_group_grants_pkey" PRIMARY KEY ("group_id", "permission"),
  CONSTRAINT "identity_group_grants_permission_check" CHECK (permission ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$')
);
ALTER TABLE "identity_group_grants" ADD CONSTRAINT "identity_group_grants_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "identity_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "identity_group_grant_restrictions" (
  "group_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "dimension" VARCHAR(32) NOT NULL,
  "value" VARCHAR(40) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  CONSTRAINT "identity_group_grant_restrictions_pkey" PRIMARY KEY ("group_id", "permission", "dimension", "value"),
  CONSTRAINT "identity_group_grant_restrictions_dimension_check" CHECK (dimension ~ '^[a-z][a-z_]{1,30}$'),
  CONSTRAINT "identity_group_grant_restrictions_value_check" CHECK (value ~ '^-?[0-9]{1,15}$'),
  CONSTRAINT "identity_group_grant_restrictions_label_check" CHECK (length(btrim(label)) > 0)
);
ALTER TABLE "identity_group_grant_restrictions" ADD CONSTRAINT "identity_group_grant_restrictions_grant_fkey"
  FOREIGN KEY ("group_id", "permission") REFERENCES "identity_group_grants"("group_id", "permission") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
