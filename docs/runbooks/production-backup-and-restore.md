# Runbook: Production Backup and Restore

**Owner:** IA-MNS project owner; the holder of the backup decryption key ([PH-24](../project/human-actions.md#ph-24))
**Status:** draft — backup, encrypted external copy, disposable restore verification and live restore are exercised by the disposable [installation rehearsal](../../infra/production/rehearsal/run.sh) in CI; not yet executed on the production host
**Environment / applicability:** a host prepared by [host setup and first deployment](production-host-setup-and-first-deployment.md)
**Related alerts:** `ia-mns-deploy status` problems; the `IA_MNS_ALERT_COMMAND` notification of a failed backup or restore verification
**Required access:** an attributable sudo account on the host; for off-host recovery, the age private key held offline

Follow [authoring policy](authoring.md), [production access](../security/production-access.md), [retention](../security/data-retention.md), [incident response](../security/incident-response.md), and [redaction](../security/telemetry-redaction.md).

## Purpose

Take, verify and restore logical backups of the IA-MNS PostgreSQL database.

## Trigger / Symptoms

Routine verification; a request to recover data; lost or corrupted database files; a failed migration that requires returning to the pre-deployment state.

## Impact

Backups hold confidential data (identity, conversations, audit). A live restore replaces the database: everything written after the backup is lost, and deleted data that the backup still contains comes back ([retention](../security/data-retention.md#backups-restore-and-deletion-replay)). The API is stopped during a restore.

## Preconditions

1. `sudo ia-mns-deploy status` to see the current release and the last backup and verification.
2. For a live restore: the project owner authorized it, users were told, and the backup to use was chosen.

## Diagnosis

```bash
sudo ls -lt /var/backups/ia-mns/daily /var/backups/ia-mns/pre-deploy /var/backups/ia-mns/pre-restore
sudo cat /var/lib/ia-mns/last-backup-daily.json /var/lib/ia-mns/last-restore-verification.json
systemctl list-timers 'ia-mns-*' --no-pager
```

Backups are `pg_dump` custom-format archives (`.dump`) with a `.sha256` and a `.toc` listing. Daily backups run at 02:30 and keep 14; pre-deployment backups keep 10; pre-restore backups are kept until removed. These are defaults pending [PH-09](../project/human-actions.md#ph-09).

## Mitigation / Procedure

### Back up now

```bash
sudo ia-mns-deploy backup --label before-maintenance
```

With `IA_MNS_BACKUP_EXTERNAL_TARGET` and `IA_MNS_BACKUP_AGE_RECIPIENT` set, the archive is encrypted with age and copied off the host. Without them the command warns that the installation does not meet the production backup requirement.

### Verify a backup

```bash
sudo ia-mns-deploy verify-restore                       # the latest backup
sudo ia-mns-deploy verify-restore /var/backups/ia-mns/daily/<file>.dump
```

It restores the archive with `pg_restore` into a disposable PostgreSQL on an isolated Docker network, counts the main tables, and checks the restored migration history against the running release. Nothing in production is touched.

### Restore the live database

```bash
sudo ia-mns-deploy restore /var/backups/ia-mns/<kind>/<file>.dump --confirm
```

It checks the archive's SHA-256, takes a safety backup (`pre-restore`), stops the API, restores into a new database, swaps names, keeps the replaced database as `ia_mns_before_restore_<timestamp>`, re-applies migrations and grants for the current release, starts it and runs the smoke test. If the database cannot be backed up first (damaged files), add `--skip-safety-backup` deliberately.

### Recover from the external copy

On a machine holding the age private key:

```bash
age --decrypt -i <private key file> -o <file>.dump <file>.dump.age
sha256sum <file>.dump    # compare with the .sha256 kept beside the encrypted copy, when available
```

Copy the `.dump` to `/var/backups/ia-mns/pre-restore/` on the host with its `.sha256` (`sha256sum <file>.dump > <file>.dump.sha256`), then restore it as above. To rebuild a lost host, follow [host setup](production-host-setup-and-first-deployment.md) up to `setup`, deploy the same release, then restore.

## Verification

- `verify-restore` ends with `restore verified` and writes `last-restore-verification.json` with `"result": "success"`. It checks the restored migration history with the current release's migration image and fails, instead of skipping that check, when the image is missing; rebuild it with `sudo ia-mns-deploy build <current tag>`.
- After a live restore: `status` exits 0, owners sign in, recent expected data is present, and `deployments.log` records `restored`.

## Rollback / Recovery

A live restore keeps the replaced database. If the restored state is wrong, restore the `pre-restore` safety backup the same way. Once the restored state is verified, drop the retained database deliberately (irreversible):

```bash
sudo docker exec -u postgres $(sudo docker compose -p ia-mns ps -q postgres) psql -c 'DROP DATABASE ia_mns_before_restore_<timestamp>'
```

After any restore, reapply deletions and revocations made after the backup's time when the retention policy requires it.

## Escalation

Stop if a checksum does not match, if `pg_restore` reports errors, or if the restored history is incompatible with the running release. Do not delete backups to free space during an incident; escalate disk capacity instead.

## Follow-Up

Record verification evidence for [PH-24](../project/human-actions.md#ph-24) and adjust retention when [PH-09](../project/human-actions.md#ph-09) is decided.
