# Runbook: Production Host Setup and First Deployment

**Owner:** IA-MNS project owner (application); company infrastructure administrator (host, network, proxy)
**Status:** draft — every command is exercised by the disposable [installation rehearsal](../../infra/production/rehearsal/run.sh) in CI; not yet executed on the production host
**Environment / applicability:** the single Ubuntu production host of [ADR-0031](../adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md), before any IA-MNS release runs there
**Related alerts:** none yet ([PH-24](../project/human-actions.md#ph-24) selects the alert channel)
**Required access:** an attributable sudo account on the host; the values listed under Preconditions from their owners

Follow [authoring policy](authoring.md), [production access](../security/production-access.md), [incident response](../security/incident-response.md), and [redaction](../security/telemetry-redaction.md). This procedure grants no authority by itself.

## Purpose

Prepare an Ubuntu host, install the `ia-mns-deploy` tool, configure IA-MNS, prepare its PostgreSQL and run the first release.

## Trigger / Symptoms

A new production (or homologation) host must run IA-MNS. Do not use this on a host where `ia-mns-deploy status` already shows a current release: follow [release update and rollback](production-release-update-and-rollback.md) instead.

## Impact

Creates `/etc/ia-mns`, `/var/lib/ia-mns`, `/var/backups/ia-mns`, `/opt/ia-mns`, the Docker volume `ia-mns-postgres` and the containers of the Compose project `ia-mns`. Publishes the application only on the configured host address and port. No external system is changed.

## Preconditions

1. Ubuntu 22.04 or 24.04 on x86-64, at least 2 vCPU, 4 GB RAM and 30 GB free disk (images are built on the host), with NTP synchronized (`timedatectl` shows `System clock synchronized: yes`; second factors and tokens depend on it).
2. Outbound HTTPS from the host to GitHub, Docker Hub, the npm registry, the Debian mirrors and `download.oracle.com` for builds, and to the OpenAI API at run time; outbound access to the Sankhya Oracle listener, and to VRMaster and PDT Connect when those integrations are enabled ([PH-24](../project/human-actions.md#ph-24)).
3. A merged `main` and an annotated `ia-mns-vX.Y.Z` tag whose `Orion required gate` passed ([ADR-0030](../adr/0030-name-ia-mns-releases-with-product-tags-distinct-from-orion.md)).
4. From their owners, never through chat or the repository: the public HTTPS origin; the reverse proxy's source address(es) ([PH-22](../project/human-actions.md#ph-22)); the production OpenAI key ([PH-23](../project/human-actions.md#ph-23)); the SELECT-only Oracle reader ([PH-08](../project/human-actions.md#ph-08)); the external backup destination and age recipient ([PH-24](../project/human-actions.md#ph-24)).

## Diagnosis

Check the host before changing it:

```bash
lsb_release -ds; uname -m; nproc; free -h; df -h /var /opt
timedatectl | grep -i synchronized
sudo ss -ltnp | grep -E ':(4490|5432)\b' || echo "4490 and 5432 are free"
docker --version 2>/dev/null; docker compose version 2>/dev/null
```

If the chosen port is in use, pick another and set it in `compose.env`; the container port stays 3000.

## Mitigation / Procedure

1. **Docker Engine and Compose** from Docker's repository (Ubuntu's `docker.io` lacks the Compose plugin version this needs):

   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl git python3 openssl age util-linux rsync
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo systemctl enable --now docker
   docker compose version   # 2.24 or newer
   ```

   Do not add operators to the `docker` group: it is equivalent to root. Run IA-MNS commands with `sudo`.

2. **Install the tool** from a checkout of the release:

   ```bash
   git clone --branch ia-mns-vX.Y.Z --depth 1 https://github.com/GabriellMDias/IA-MNS.git /tmp/ia-mns-install
   sudo /tmp/ia-mns-install/infra/production/bin/ia-mns-deploy install
   ```

   It creates the directories, `/usr/local/sbin/ia-mns-deploy`, the systemd units (not yet enabled), the release repository in `/opt/ia-mns/repo.git`, and `/etc/ia-mns/*.env` from the [examples](../../infra/production/examples/runtime.env.example) without overwriting existing files.

3. **Configure.** Edit with `sudo nano /etc/ia-mns/<file>.env` and replace every `CHANGE_ME`:
   - `compose.env`: `IA_MNS_BIND_ADDRESS` (the host address the proxy reaches, never `0.0.0.0`) and, if needed, `IA_MNS_HTTP_PORT`.
   - `runtime.env`: `IA_MNS_PUBLIC_ORIGIN`, `ORION_TRUSTED_PROXIES`, `OPENAI_API_KEY`, `SANKHYA_DB_*`; leave PDT, Sankhya sign-in and VRMaster commented until their human actions are resolved.
   - `backup.env`: `IA_MNS_BACKUP_AGE_RECIPIENT` and `IA_MNS_BACKUP_EXTERNAL_TARGET`.
   - Internal TLS on the proxy hop, if [PH-22](../project/human-actions.md#ph-22) requires it: place `tls.crt` and `tls.key` in `/etc/ia-mns/tls/` (`sudo chown root:1000 /etc/ia-mns/tls/tls.key && sudo chmod 640 /etc/ia-mns/tls/tls.key`) and uncomment the two `ORION_TLS_*` lines.

4. **Generate the secrets** that no person needs to know, then validate:

   ```bash
   sudo ia-mns-deploy init-secrets
   sudo ia-mns-deploy check-config
   ```

   `init-secrets` fills every `__GENERATE_*__` (database passwords and the identity keys) without displaying them. Copy `IA_MNS_IDENTITY_ENCRYPTION_KEY` into the company password vault now: second factors cannot be read without it. `check-config` names problems (never values) and warns about open production requirements.

5. **Prepare the database:** `sudo ia-mns-deploy setup`. It creates the volume, starts PostgreSQL, admits only the two application roles over the private network, and creates `ia_mns_migrator` (owner) and `orion_runtime` (restricted).

6. **Deploy:** `sudo ia-mns-deploy deploy ia-mns-vX.Y.Z`. The first build takes several minutes. The command ends with `deployed ia-mns-vX.Y.Z`, or stops before touching anything it cannot prove safe.

7. **First owner:** `sudo ia-mns-deploy bootstrap-owner` prints a single-use URL valid for 30 minutes. Open it through the public HTTPS origin on a trusted device, create the owner and enroll the authenticator app. Create a second owner for recovery ([PH-15](../project/human-actions.md#ph-15)), then review **Administração → Autenticação e segurança** and **Administração → Parâmetros**.

8. **Timers:** `sudo ia-mns-deploy enable-timers` (daily backup, weekly restore verification).

## Verification

- `sudo ia-mns-deploy status` exits 0 after the first daily backup and restore verification (run `sudo ia-mns-deploy backup` and `sudo ia-mns-deploy verify-restore` once to verify immediately); every remaining `PRODUCTION REQUIREMENT` line names an open human action.
- `curl -s -o /dev/null -w '%{http_code}\n' http://<bind address>:<port>/health/ready` answers `200` from the host; through the proxy, `https://<public origin>/api/health/ready` answers `200`.
- The owner signs in with the second factor at the public origin.

## Rollback / Recovery

Before the first successful deployment nothing serves traffic: fix the reported problem and repeat the failed step; every step is safe to repeat. `setup` re-applies roles and passwords from the files. To start over on a host that never held real data, stop with `sudo docker compose -p ia-mns down` and remove the volume explicitly with `sudo docker volume rm ia-mns-postgres` — destructive, only before real use.

## Escalation

Stop if `check-config` reports problems you cannot resolve from the files, if a build cannot reach a required endpoint (network rules), or if `setup` fails twice. Keep `ia-mns-deploy logs` output, which contains no secret values, and contact the project owner.

## Follow-Up

Record the first durable release ([PH-10](../project/human-actions.md#ph-10)) and update the human actions with dated evidence.
