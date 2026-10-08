# Production Deployment

IA-MNS production runs on one Ubuntu host with Docker Compose, operated by `ia-mns-deploy` ([ADR-0031](../../docs/adr/0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md)). Procedures live in the [runbooks](../../docs/runbooks/README.md); this directory holds what they run. Host addresses, domain names and credentials never belong here: they live in `/etc/ia-mns` on the host.

| Path | Purpose |
| --- | --- |
| [`Dockerfile`](Dockerfile) | `runtime` and `migrate` images from one build of a release commit; Oracle Instant Client 19.32 verified by Oracle's published SHA-256 |
| [`compose.yaml`](compose.yaml), [`compose.tls.yaml`](compose.tls.yaml) | `api`, `postgres` (private network, external volume) and the one-shot `migrate`; the TLS overlay mounts `/etc/ia-mns/tls` |
| [`bin/ia-mns-deploy`](bin/ia-mns-deploy) | install, configuration checks, secret generation, database setup, deploy, rollback, backups, restore, status |
| [`postgres/pg_hba.conf`](postgres/pg_hba.conf) | client authentication written into the data directory by `setup` |
| [`examples/`](examples/runtime.env.example) | the five `/etc/ia-mns/*.env` files with placeholders only |
| [`systemd/`](systemd/ia-mns-backup.timer) | daily backup and weekly restore verification |
| [`rehearsal/run.sh`](rehearsal/run.sh) | disposable end-to-end rehearsal of the real tool and Compose file, run in CI |

Quick reference, as root on the host:

```bash
ia-mns-deploy help
ia-mns-deploy status
ia-mns-deploy deploy ia-mns-vX.Y.Z
ia-mns-deploy rollback
ia-mns-deploy backup && ia-mns-deploy verify-restore
ia-mns-deploy logs api --tail 200
```

The rehearsal needs a Linux Docker host and root:

```bash
sudo infra/production/rehearsal/run.sh --source "$PWD" --ref HEAD
```

On Windows or macOS, run it inside the runner image with the Docker socket mounted:

```bash
docker build -t ia-mns-rehearsal-runner -f infra/production/rehearsal/runner.Dockerfile infra/production/rehearsal
git bundle create rehearsal.bundle HEAD
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD/rehearsal.bundle:/rehearsal.bundle:ro" \
  --add-host host.docker.internal:host-gateway ia-mns-rehearsal-runner bash -c \
  'git clone -q /rehearsal.bundle /src && /src/infra/production/rehearsal/run.sh --source /src --ref HEAD --smoke-host host.docker.internal'
```
