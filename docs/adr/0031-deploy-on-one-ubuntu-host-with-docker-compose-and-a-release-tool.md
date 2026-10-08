# ADR-0031: Deploy on One Ubuntu Host with Docker Compose and a Release Tool

**Status:** accepted
**Date:** 2026-10-07
**Extends:** [ADR-0029](0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md) (production runtime shape) and [ADR-0030](0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md) (release tags). Selects the deployment platform, secret delivery, database roles, backups and operational tooling the [technology map](../architecture/technology-decisions.md) left to deployment.

## Context

The owner approved on 2026-10-07 running IA-MNS in production on one Ubuntu host of the company network behind the corporate TLS reverse proxy, with its own PostgreSQL in Docker, similar in spirit to how PDT Connect runs but without copying its implementation: PDT runs as root, publishes PostgreSQL, keeps credentials beside the code and runs migrations and seed in the container command at every start. IA-MNS already separates the runtime and migration credentials, refuses unsafe production configuration, and freezes released migrations. The production host, proxy and external systems are operated by people; the repository must provide a reproducible artifact and a procedure an operator can follow without inventing steps. The Sankhya database needs Oracle Instant Client Thick mode (Oracle 12.1); the hop between the proxy and the application and several operational policies are still undecided ([PH-09](../project/human-actions.md#ph-09), [PH-22](../project/human-actions.md#ph-22) to [PH-25](../project/human-actions.md#ph-25)).

## Decision

- **Platform.** One Ubuntu host runs Docker Engine and the Compose plugin (2.24 or newer). [`infra/production/compose.yaml`](../../infra/production/compose.yaml) defines three services: `api` (the runtime image, publishing container port 3000 only on the configured host address and port, 4490 by default), `postgres` (PostgreSQL 16, pinned by digest, on an internal network with no published port and no outbound route, data in an external named volume that no Compose command removes) and `migrate` (a one-shot service in an `ops` profile that `up` never starts). Containers run read-only with all capabilities dropped and `no-new-privileges`; logs rotate (local driver, 5 × 20 MB).
- **Images.** [`infra/production/Dockerfile`](../../infra/production/Dockerfile) builds two targets from one build stage of a release commit: `runtime` (Node.js 24.13.0 on Debian bookworm slim, pinned by digest; production dependencies only; the web build without the `/docs` portal; Oracle Instant Client Basic 19.32 for Linux, downloaded from Oracle's public endpoint and checked against the size and SHA-256 Oracle publishes; user `node`; a loopback healthcheck that follows the internal TLS setting) and `migrate` (the Prisma CLI and `database-deploy`). Images are built on the host from the release tag, labeled with the tag and commit, and never pushed; the Oracle binaries are never committed. The Oracle Free Use Terms shipped with the client cover running it for internal business operations.
- **Database roles.** The PostgreSQL superuser only connects through the container's local socket (`peer`), for setup and backups. `ia_mns_migrator` owns the database and applies migrations; `orion_runtime` holds exactly the declared table privileges. A hardened `pg_hba.conf` admits only these two roles over the private network. Roles and passwords are created once, and re-synchronized from the configuration files on demand, by `ia-mns-deploy setup`.
- **Secrets.** Configuration lives in `/etc/ia-mns` (root, mode 700): `compose.env` (deployment settings, no secrets), `postgres.env` (superuser, initialization only), `migration.env` (migration credential, `migrate` only), `runtime.env` (the application's environment) and `backup.env`. Each file is root-only (600) and each service receives only its own; the tool refuses a runtime file that holds the migration or administrator credential, development settings or image-owned settings. `ia-mns-deploy init-secrets` generates database passwords and identity keys in place without displaying them. This is a single-host store: files on the host disk, protected by host access control, with the identity encryption key also kept in the company password vault; a secret manager would need a new decision.
- **Release tool.** [`ia-mns-deploy`](../../infra/production/bin/ia-mns-deploy) is installed to `/usr/local/sbin` and holds a host-wide lock for every state-changing command. `deploy ia-mns-vX.Y.Z` accepts only an annotated tag on `main` whose required CI check passed (read from GitHub's public API), checks it out as an immutable worktree, continues with that release's own copy of the tool, builds both images, validates the configuration with the new image (`config-check`, no network), takes a mandatory pre-deployment backup, compares the database's migration history with the release (`database-deploy status`) and refuses unknown, failed or modified migrations, runs `migrate`, replaces the API container, waits for health, runs a smoke test through the published address, then records the result. It never runs migrations from the API's command.
- **Rollback.** After a failed start, the tool returns to the previous release automatically only when no migration ran during that deployment, because the previous release then meets exactly the schema it ran against. Otherwise it stops and leaves the decision to an operator: `rollback` refuses a release that does not know an applied migration unless `--accept-schema-ahead` records a reviewed decision that the newer migrations are additive; `restore` replaces the database with a backup and keeps the replaced database. Migrations are never edited or reversed in place.
- **Backups.** `pg_dump` custom-format archives with a SHA-256, written under `/var/backups/ia-mns` (root, 700): daily by a systemd timer, before every deployment and before every restore, kept 14 and 10 deep by default pending [PH-09](../project/human-actions.md#ph-09). Copies leave the host only encrypted with `age` for a recipient whose private key is kept offline, to a mounted directory or an rsync-over-SSH target. A weekly timer restores the latest backup into a disposable database on an isolated network and checks it against the running release. `status` exits non-zero when the API is unhealthy, the last daily backup is older than 26 hours or the last restore check is older than 8 days; an optional alert command receives failures.
- **Verification.** [`infra/production/rehearsal/run.sh`](../../infra/production/rehearsal/run.sh) exercises the real tool and Compose file end to end with synthetic configuration on disposable resources, and runs in CI with the image checks.

## Rationale

One host with Compose is what the owner approved and what the company already operates for PDT Connect; it needs no orchestrator, registry or cloud account. Building on the host from a verified tag removes a registry and its credentials, at the cost of build time on the host. A release-tool script keeps the documented procedure and the executed procedure identical: every step the runbooks name is a command that the rehearsal and CI run. Running each release's own tooling avoids a host tool drifting from the Compose file and Dockerfile it deploys.

Separate roles with a peer-only superuser keep the application unable to change the schema or its own privileges even if it is compromised, and keep the migration credential out of the running process. Automatic rollback is limited to the case where compatibility is proven; a schema the old release does not know is a human decision because an old release may misbehave against it without failing its health check. Backups are not considered real until a restore succeeds, so the restore check performs an actual `pg_restore` and a compatibility check rather than listing the archive.

## Alternatives Considered

### Migrations in the container command, as PDT Connect does

Every start would need the migration credential in the API container, failures would become restart loops, and there would be no point to take a backup before a migration.

### A `depends_on: service_completed_successfully` migration service

It would run migrations on every `docker compose up`, including routine restarts, with no place for the pre-deployment backup and compatibility check.

### Building in CI and pulling from a registry

It moves builds off the host but needs a private registry, its credentials on the host, and image retention; worth revisiting if build time on the host becomes a problem.

### A secret manager

Not available in this environment; root-only files on one host with the encryption key escrowed in the password vault are the proportionate first step, recorded here as a limitation.

### Alpine images

node-oracledb's Thick mode and Oracle Instant Client require glibc.

## Consequences

### Positive

- One command deploys a verified release with backup, migration, health and smoke checks, and refuses unsafe states before touching the running service.
- The application cannot alter its schema or read the migration and administrator credentials.
- Backups are restore-tested regularly, and copies leave the host encrypted.
- The rehearsal proves install, upgrade, failure handling, rollback and restore on every change in CI.

### Negative

- Each deployment replaces a single API container: requests are refused for the seconds between stop and readiness.
- Images (about 1.3 GB with the Oracle client) are built on the host, which needs network access to GitHub, npm, Docker Hub, Debian and Oracle during builds.
- Secrets are files on the host disk; host compromise exposes them.
- Retention, external destination, alert channel, proxy hop protection and Oracle transport protection remain owner decisions; until made, `status` and `check-config` report the gaps rather than hiding them.

### Operational or Migration Impact

- Operators follow the [production runbooks](../runbooks/README.md); the infrastructure administrator configures DNS, TLS, the reverse proxy and the host firewall, including Docker's `DOCKER-USER` chain, because published container ports bypass `ufw`.
- The first production deployment records the first durable release under ADR-0030.

## References

- [ADR-0029](0029-serve-the-web-and-api-from-one-origin-behind-restricted-trusted-proxies.md), [ADR-0030](0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md), [ADR-0006](0006-select-prisma-orm-for-database-access-and-migrations.md)
- [Secrets policy](../security/secrets-management.md), [retention](../security/data-retention.md), [production access](../security/production-access.md), [migrations](../database/migrations.md), [release workflow](../database/release-evolution.md)
- [Oracle Instant Client for Linux x86-64 downloads](https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html)
