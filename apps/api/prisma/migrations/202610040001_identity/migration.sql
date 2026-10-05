-- Additive identity persistence owned by the identity module. No ERP or PDT changes.
-- Old application versions ignore these tables; existing agent history is untouched.
BEGIN;
CREATE TABLE "identity_persons" (
  "id" UUID NOT NULL,
  "display_name" VARCHAR(120) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "merged_into" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_persons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_persons_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "identity_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "identity_persons_display_name_check" CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT "identity_persons_status_check" CHECK (status IN ('active', 'disabled', 'merged')),
  CONSTRAINT "identity_persons_merge_check" CHECK ((status = 'merged') = (merged_into IS NOT NULL) AND (merged_into IS NULL OR merged_into <> id))
);
CREATE INDEX "identity_persons_display_name_idx" ON "identity_persons"("display_name", "id");

CREATE TABLE "identity_external_identities" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL,
  "issuer" VARCHAR(300) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "label" VARCHAR(200),
  "email" VARCHAR(254),
  "established_by" VARCHAR(16) NOT NULL DEFAULT 'proof',
  "linked_by" UUID,
  "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_external_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_external_identities_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_external_identities_provider_check" CHECK (provider IN ('pdt', 'sankhya')),
  CONSTRAINT "identity_external_identities_issuer_check" CHECK (length(issuer) > 0),
  CONSTRAINT "identity_external_identities_subject_check" CHECK (length(subject) > 0),
  CONSTRAINT "identity_external_identities_email_check" CHECK (email IS NULL OR email = lower(btrim(email))),
  CONSTRAINT "identity_external_identities_established_check" CHECK (established_by IN ('proof', 'directory') AND (established_by = 'proof' OR linked_by IS NOT NULL))
);
CREATE UNIQUE INDEX "identity_external_identities_subject_key" ON "identity_external_identities"("provider", "issuer", "subject");
CREATE INDEX "identity_external_identities_email_idx" ON "identity_external_identities"("email");
CREATE UNIQUE INDEX "identity_external_identities_person_provider_key" ON "identity_external_identities"("person_id", "provider", "issuer");

CREATE TABLE "identity_local_credentials" (
  "person_id" UUID NOT NULL,
  "login" VARCHAR(64) NOT NULL,
  "password_hash" VARCHAR(200) NOT NULL,
  "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(3),
  "totp_secret" VARCHAR(200),
  "totp_enabled_at" TIMESTAMPTZ(3),
  "totp_last_step" BIGINT,
  CONSTRAINT "identity_local_credentials_pkey" PRIMARY KEY ("person_id"),
  CONSTRAINT "identity_local_credentials_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_local_credentials_login_check" CHECK (login ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  CONSTRAINT "identity_local_credentials_attempts_check" CHECK (failed_attempts >= 0),
  CONSTRAINT "identity_local_credentials_totp_check" CHECK (totp_enabled_at IS NULL OR totp_secret IS NOT NULL)
);
CREATE UNIQUE INDEX "identity_local_credentials_login_key" ON "identity_local_credentials"("login");

CREATE TABLE "identity_recovery_codes" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "code_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at" TIMESTAMPTZ(3),
  CONSTRAINT "identity_recovery_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_recovery_codes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "identity_recovery_codes_hash_key" ON "identity_recovery_codes"("code_hash");
CREATE INDEX "identity_recovery_codes_person_idx" ON "identity_recovery_codes"("person_id");

CREATE TABLE "identity_sessions" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "method" VARCHAR(16) NOT NULL,
  "surface" VARCHAR(16) NOT NULL,
  "assurance" VARCHAR(8) NOT NULL,
  "refresh_hash" CHAR(64),
  "previous_refresh_hash" CHAR(64),
  "auth_time" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "revoked_reason" VARCHAR(40),
  CONSTRAINT "identity_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_sessions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_sessions_method_check" CHECK (method IN ('local', 'pdt', 'sankhya', 'bootstrap', 'enrollment')),
  CONSTRAINT "identity_sessions_surface_check" CHECK (surface IN ('direct', 'pdt', 'sankhya')),
  CONSTRAINT "identity_sessions_assurance_check" CHECK (assurance IN ('single', 'mfa')),
  CONSTRAINT "identity_sessions_expiry_check" CHECK (idle_expires_at <= expires_at AND auth_time <= expires_at),
  CONSTRAINT "identity_sessions_revocation_check" CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);
CREATE UNIQUE INDEX "identity_sessions_refresh_key" ON "identity_sessions"("refresh_hash");
CREATE UNIQUE INDEX "identity_sessions_previous_refresh_key" ON "identity_sessions"("previous_refresh_hash");
CREATE INDEX "identity_sessions_person_idx" ON "identity_sessions"("person_id", "created_at" DESC);
CREATE INDEX "identity_sessions_expiry_idx" ON "identity_sessions"("expires_at");

CREATE TABLE "identity_role_assignments" (
  "person_id" UUID NOT NULL,
  "role" VARCHAR(40) NOT NULL,
  "granted_by" UUID,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_role_assignments_pkey" PRIMARY KEY ("person_id", "role"),
  CONSTRAINT "identity_role_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_role_assignments_role_check" CHECK (role IN ('owner'))
);
CREATE INDEX "identity_role_assignments_role_idx" ON "identity_role_assignments"("role");

CREATE TABLE "identity_capability_grants" (
  "person_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "granted_by" UUID,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_capability_grants_pkey" PRIMARY KEY ("person_id", "permission"),
  CONSTRAINT "identity_capability_grants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_capability_grants_permission_check" CHECK (permission ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$')
);

CREATE TABLE "identity_tickets" (
  "id" UUID NOT NULL,
  "purpose" VARCHAR(24) NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "person_id" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  CONSTRAINT "identity_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_tickets_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_tickets_purpose_check" CHECK (purpose IN ('bootstrap', 'enrollment', 'reset', 'link_invitation', 'mfa', 'provision', 'merge', 'totp_setup', 'pdt_login', 'sankhya_login')),
  CONSTRAINT "identity_tickets_payload_check" CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT "identity_tickets_expiry_check" CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX "identity_tickets_token_key" ON "identity_tickets"("token_hash");
CREATE INDEX "identity_tickets_expiry_idx" ON "identity_tickets"("expires_at");

CREATE TABLE "identity_used_assertions" (
  "jti_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "identity_used_assertions_pkey" PRIMARY KEY ("jti_hash")
);

CREATE TABLE "identity_audit_events" (
  "id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" VARCHAR(48) NOT NULL,
  "actor_person_id" UUID,
  "target_person_id" UUID,
  "details" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "identity_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_audit_events_action_check" CHECK (action ~ '^[a-z][a-z0-9_.]*$'),
  CONSTRAINT "identity_audit_events_details_check" CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX "identity_audit_events_target_idx" ON "identity_audit_events"("target_person_id", "occurred_at" DESC);
CREATE INDEX "identity_audit_events_recent_idx" ON "identity_audit_events"("occurred_at" DESC, "id" DESC);
COMMIT;
