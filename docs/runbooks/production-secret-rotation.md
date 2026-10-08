# Runbook: Production Secret Rotation

**Owner:** IA-MNS project owner; each external credential's issuing administrator
**Status:** draft — the database password path (`setup` re-synchronizing passwords, then `restart`) uses commands exercised by the disposable [installation rehearsal](../../infra/production/rehearsal/run.sh); rotation itself has not been exercised on the production host
**Environment / applicability:** a host prepared by [host setup and first deployment](production-host-setup-and-first-deployment.md)
**Related alerts:** none
**Required access:** an attributable sudo account on the host; the issuer of the external credential being rotated

Follow [secrets policy](../security/secrets-management.md#secret-rotation), [production access](../security/production-access.md), and [incident response](../security/incident-response.md) for suspected exposure.

## Purpose

Replace an IA-MNS credential or key without printing it.

## Trigger / Symptoms

Scheduled rotation, personnel change, or suspected exposure (then also follow incident response).

## Impact

The API restarts (seconds of refused requests). Rotating the identity signing key signs every user out; rotating the identity encryption key makes enrolled second factors unreadable, so every user must enroll again.

## Preconditions

1. `sudo ia-mns-deploy status` is healthy and a fresh backup exists (`sudo ia-mns-deploy backup --label before-rotation`).
2. The new external credential exists at its issuer (OpenAI, Oracle, VRMaster, PDT), and the old one stays valid until verification.

## Diagnosis

`sudo ia-mns-deploy check-config` names the configuration keys involved without showing values.

## Mitigation / Procedure

1. **External credentials** (`OPENAI_API_KEY`, `SANKHYA_DB_PASSWORD`, `VRMASTER_DB_PASSWORD`, `PDT_IDENTITY_CLIENT_SECRET`): edit the line in `/etc/ia-mns/runtime.env` with `sudo nano`, then `sudo ia-mns-deploy check-config && sudo ia-mns-deploy restart`.
2. **Database role passwords:** replace the password in `ORION_MIGRATION_DATABASE_URL` (`migration.env`) or `ORION_DATABASE_URL` (`runtime.env`) with a new `openssl rand -hex 32` value, then `sudo ia-mns-deploy setup` (re-synchronizes role passwords from the files) and `sudo ia-mns-deploy restart`.
3. **PostgreSQL superuser:** only used to initialize the data directory and never over the network; `POSTGRES_PASSWORD` changes take effect on a new data directory only. Rotate it if exposed by updating the file and running `ALTER ROLE postgres PASSWORD` through `docker exec -u postgres ... psql` with the value typed interactively.
4. **Identity keys:** replace the value with the placeholder `__GENERATE_IDENTITY_SIGNING_KEY__` or `__GENERATE_IDENTITY_ENCRYPTION_KEY__`, run `sudo ia-mns-deploy init-secrets`, store the new encryption key in the password vault, then `sudo ia-mns-deploy restart`. Inform users of the consequences listed under Impact.

## Verification

`status` exits 0; owners sign in; a question that uses the rotated integration succeeds. Then revoke the old credential at its issuer.

## Rollback / Recovery

Until the old credential is revoked, putting the old value back and restarting restores the previous state.

## Escalation

Stop if the application does not become healthy after a restart; restore the previous value, then escalate to the credential's issuer.

## Follow-Up

Record the rotation date in the secret inventory, never the value.
