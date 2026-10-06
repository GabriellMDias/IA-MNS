-- Additive identity changes: an owner-administered authentication policy,
-- browsers remembered after a second factor, refresh-race tolerance and the
-- sign-in second-factor enrollment ticket. Without a policy row the
-- application applies its built-in secure defaults.
BEGIN;
CREATE TABLE "identity_security_policies" (
  "id" SMALLINT NOT NULL DEFAULT 1,
  "session_max_minutes" INTEGER NOT NULL,
  "idle_timeout_minutes" INTEGER NOT NULL,
  "recent_auth_minutes" INTEGER NOT NULL,
  "admin_recent_auth_minutes" INTEGER NOT NULL,
  "mfa_requirement" VARCHAR(16) NOT NULL,
  "remember_device_days" SMALLINT NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_security_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_security_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "identity_persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "identity_security_policies_singleton_check" CHECK (id = 1),
  CONSTRAINT "identity_security_policies_session_check" CHECK (session_max_minutes BETWEEN 60 AND 43200),
  CONSTRAINT "identity_security_policies_idle_check" CHECK (idle_timeout_minutes BETWEEN 15 AND 10080 AND idle_timeout_minutes <= session_max_minutes),
  CONSTRAINT "identity_security_policies_recent_check" CHECK (recent_auth_minutes BETWEEN 5 AND 1440 AND recent_auth_minutes <= session_max_minutes),
  CONSTRAINT "identity_security_policies_admin_recent_check" CHECK (admin_recent_auth_minutes BETWEEN 5 AND 240),
  CONSTRAINT "identity_security_policies_mfa_check" CHECK (mfa_requirement IN ('everyone', 'administrators', 'none')),
  CONSTRAINT "identity_security_policies_remember_check" CHECK (remember_device_days BETWEEN 0 AND 90)
);

CREATE TABLE "identity_trusted_devices" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "identity_trusted_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "identity_trusted_devices_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "identity_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "identity_trusted_devices_token_key" ON "identity_trusted_devices"("token_hash");
CREATE INDEX "identity_trusted_devices_person_idx" ON "identity_trusted_devices"("person_id");

ALTER TABLE "identity_sessions" ADD COLUMN "refresh_rotated_at" TIMESTAMPTZ(3);

ALTER TABLE "identity_tickets" DROP CONSTRAINT "identity_tickets_purpose_check";
ALTER TABLE "identity_tickets" ADD CONSTRAINT "identity_tickets_purpose_check" CHECK (purpose IN ('bootstrap', 'enrollment', 'reset', 'link_invitation', 'mfa', 'mfa_enrollment', 'provision', 'merge', 'totp_setup', 'pdt_login', 'sankhya_login'));
COMMIT;
