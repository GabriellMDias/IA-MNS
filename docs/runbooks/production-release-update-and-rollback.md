# Runbook: Production Release Update and Rollback

**Owner:** IA-MNS project owner
**Status:** draft — update, automatic return, refused rollback, explicit rollback and forward fix are exercised by the disposable [installation rehearsal](../../infra/production/rehearsal/run.sh) in CI; not yet executed on the production host
**Environment / applicability:** a host prepared by [host setup and first deployment](production-host-setup-and-first-deployment.md)
**Related alerts:** the `IA_MNS_ALERT_COMMAND` notification of a failed `deploy` or `rollback`
**Required access:** an attributable sudo account on the host

Follow [authoring policy](authoring.md), [production access](../security/production-access.md), [incident response](../security/incident-response.md), and [redaction](../security/telemetry-redaction.md).

## Purpose

Install a newer IA-MNS release, and return to an earlier one when that is proven safe.

## Trigger / Symptoms

A reviewed change was merged to `main` and tagged; or a deployed release misbehaves and an earlier release must serve again.

## Impact

The API container is replaced: requests are refused for the seconds between stop and readiness. Migrations change the database schema and are never reversed in place.

## Preconditions

1. The release is an annotated `ia-mns-vX.Y.Z` tag on `main` whose `Orion required gate` passed ([ADR-0030](../adr/0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md)). Create it after merging:

   ```bash
   git switch main && git pull --ff-only
   git tag -a ia-mns-vX.Y.Z -m "IA-MNS vX.Y.Z" && git push origin ia-mns-vX.Y.Z
   ```

   Never move or reuse a published tag; the host refuses a tag that moved.
2. Read the release's pull requests for migrations and their compatibility notes.
3. `sudo ia-mns-deploy status` shows the API healthy, or the failure you are recovering from.

## Diagnosis

```bash
sudo ia-mns-deploy status
sudo ia-mns-deploy logs --tail 200
sudo tail -n 5 /var/lib/ia-mns/deployments.log
```

`deployments.log` holds one JSON line per operation: action, result, release, commit, previous release, applied migrations, pre-deployment backup and CI result.

## Mitigation / Procedure

### Update

```bash
sudo ia-mns-deploy deploy ia-mns-vX.Y.Z
```

The tool verifies the tag and CI, builds the images, validates the configuration with the new image, takes a pre-deployment backup, refuses a database whose migration history the release does not match, applies pending migrations, starts the release and runs a smoke test. Outcomes:

| Message | State | Next step |
| --- | --- | --- |
| `deployed <tag>` | new release current | Verify (below) |
| refused before migrations (CI, tag, configuration, backup, incompatible history) | nothing changed | Fix the cause; repeat |
| `database deployment failed` | old release still running; a migration may be partially applied | Stop. Escalate with the logs; do not retry blindly |
| `<tag> failed its health checks; <previous> is running again` | no migration ran; returned automatically | Investigate the release; fix forward |
| `failed after applying migrations` | migrations applied; the failed release is not serving | Decide below |

Repeating `deploy` with the same tag is safe: it reuses verified images and skips applied migrations.

### Return to an earlier release

```bash
sudo ia-mns-deploy rollback                 # the last healthy release
sudo ia-mns-deploy rollback ia-mns-vA.B.C   # a named release
```

Without a tag, the target is the current release when the API runs another image or none (a failed or stopped deployment), and the previous release only when the current release is the one running.

The tool refuses when the target does not know a migration the database applied. Then choose:

1. **Fix forward (preferred):** tag and deploy a corrected release.
2. **Accept the newer schema:** only after reviewing that every unknown migration is additive (new tables, nullable columns, new indexes) and the target ignores it: `sudo ia-mns-deploy rollback --accept-schema-ahead`. The decision is recorded.
3. **Restore the pre-deployment backup** with [backup and restore](production-backup-and-restore.md); data written since that backup is lost.

## Verification

- `sudo ia-mns-deploy status` exits 0 and shows the expected `current release` and `running image`.
- The public origin loads, an owner signs in, and a normal question succeeds.
- `deployments.log` records the operation with `"result": "success"`.

## Rollback / Recovery

Automatic return happens only when no migration ran during the failed deployment, because the previous release then meets exactly its own schema. After a migration, return is a human decision as above. Migrations are never edited or reversed in place ([migrations policy](../database/migrations.md)).

## Escalation

Stop and escalate if a migration fails, if both the new and the previous release fail to start, or if the pre-deployment backup is missing. Preserve `deployments.log` and the logs.

## Follow-Up

After the first production release, and every release that applies migrations, record the release in `release-history.json` as [ADR-0030](../adr/0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md) describes ([PH-10](../project/human-actions.md#ph-10)).
