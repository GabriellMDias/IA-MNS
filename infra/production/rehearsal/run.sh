#!/usr/bin/env bash
# Disposable end-to-end rehearsal of the IA-MNS production installation
# (ADR-0031). It runs the real ia-mns-deploy and the real production Compose
# file with synthetic configuration, against a disposable Compose project,
# database volume, image repository and Git remote:
#
#   install → init-secrets → check-config (and its refusals) → setup → deploy
#   → persist data → restarts → backup → external encrypted copy → restore
#   verification (refused without the release image) → upgrade with a
#   migration → refused rollback across a newer
#   schema → failed release rolled back automatically → failed release after a
#   migration (no automatic rollback) → explicit rollback → forward fix →
#   rollback with no API container (returns to the current release) →
#   restore of an older backup.
#
# Synthetic only: no company credential, database or provider is contacted.
# The Oracle, OpenAI and identity values are placeholders the application
# validates but never uses here; provider integrations are not exercised.
#
# Run as root on Linux with Docker (Compose 2.24+), git, curl, python3,
# openssl, age and flock:
#   sudo infra/production/rehearsal/run.sh --source "$PWD" --ref HEAD
# The synthetic release tags exist only in the disposable remote.
set -Eeuo pipefail
umask 077

SOURCE=""
REF="HEAD"
WORK=""
KEEP=0
KEEP_IMAGES=0
BIND="127.0.0.1"
SMOKE_HOST="127.0.0.1"
while (($#)); do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --work) WORK="$2"; shift 2 ;;
    --bind) BIND="$2"; shift 2 ;;
    --smoke-host) SMOKE_HOST="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --keep-images) KEEP_IMAGES=1; shift ;;
    *) echo "usage: run.sh --source <repository path or bundle> [--ref <commit>] [--work <dir>] [--bind <address>] [--smoke-host <host>] [--keep] [--keep-images]" >&2; exit 2 ;;
  esac
done
[[ -n "$SOURCE" ]] || { echo "--source is required" >&2; exit 2; }
[[ "$(id -u)" -eq 0 ]] || { echo "run as root: the rehearsal exercises the root-only checks of ia-mns-deploy" >&2; exit 2; }
for tool in docker git curl python3 openssl age age-keygen flock; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 2; }
done

RUN_ID="$(openssl rand -hex 3)"
WORK="${WORK:-/tmp/ia-mns-rehearsal-$RUN_ID}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"

export IA_MNS_CONFIG_DIR="$WORK/etc"
export IA_MNS_STATE_DIR="$WORK/state"
export IA_MNS_BACKUP_DIR="$WORK/backups"
export IA_MNS_HOME="$WORK/opt"
export IA_MNS_BIN_DIR="$WORK/bin"
export IA_MNS_SKIP_SYSTEMD=1
export IA_MNS_COMPOSE_PROJECT="ia-mns-rehearsal-$RUN_ID"
export IA_MNS_IMAGE_REPOSITORY="ia-mns-rehearsal"
export IA_MNS_POSTGRES_VOLUME="ia-mns-rehearsal-$RUN_ID"
TOOL="$IA_MNS_BIN_DIR/ia-mns-deploy"
ORIGIN="https://ia-mns.rehearsal.invalid"
LOG="$WORK/rehearsal.log"
STEP=0

say() { printf '\n=== [%02d] %s\n' "$STEP" "$*" | tee -a "$LOG" >&2; }
step() { STEP=$((STEP + 1)); say "$*"; }
pass() { printf 'PASS: %s\n' "$*" | tee -a "$LOG" >&2; }
fail() { printf 'FAIL: %s\n' "$*" | tee -a "$LOG" >&2; exit 1; }
tool() { "$TOOL" "$@" 2>>"$LOG"; }
expect_failure() {
  # expect_failure <description> <command...>
  local description="$1"
  shift
  if "$@" 2>>"$LOG"; then fail "$description should have failed"; fi
  pass "$description refused"
}
compose_project() {
  docker compose -p "$IA_MNS_COMPOSE_PROJECT" "$@"
}
psql_admin() {
  docker exec -i -u postgres "$(compose_project ps -q postgres)" \
    psql -X -q -t -A -v ON_ERROR_STOP=1 -d "${2:-ia_mns}" -c "$1"
}
state() { cat "$IA_MNS_STATE_DIR/$1" 2>/dev/null || true; }
running_release() {
  docker inspect "$(compose_project ps -q api | head -n1)" \
    --format '{{index .Config.Labels "org.opencontainers.image.version"}}' 2>/dev/null || true
}
last_result() { tail -n1 "$IA_MNS_STATE_DIR/deployments.log" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"])'; }

cleanup() {
  local code=$?
  set +e
  if ((code != 0)) && [[ -f "$LOG" ]]; then
    echo "--- last lines of $LOG (tool output; no secret values) ---" >&2
    tail -n 80 "$LOG" >&2
  fi
  if ((KEEP)); then
    echo "kept: $WORK (project $IA_MNS_COMPOSE_PROJECT, volume $IA_MNS_POSTGRES_VOLUME)" >&2
  else
    compose_project down --remove-orphans >/dev/null 2>&1
    docker ps -aq --filter "label=com.docker.compose.project=$IA_MNS_COMPOSE_PROJECT" | xargs -r docker rm -f >/dev/null 2>&1
    docker ps -aq --filter "label=br.com.ia-mns.purpose=restore-check" | xargs -r docker rm -f >/dev/null 2>&1
    # Only this rehearsal's own volume; production volumes are never named here.
    docker volume rm "$IA_MNS_POSTGRES_VOLUME" >/dev/null 2>&1
    docker network ls -q --filter "label=com.docker.compose.project=$IA_MNS_COMPOSE_PROJECT" | xargs -r docker network rm >/dev/null 2>&1
    if ((!KEEP_IMAGES)); then
      docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^ia-mns-rehearsal(-migrate)?:' | xargs -r docker image rm >/dev/null 2>&1
    fi
    rm -rf "$WORK"
  fi
  if ((code == 0)); then echo "REHEARSAL PASSED" >&2; else echo "REHEARSAL FAILED at step $STEP (log: $LOG)" >&2; fi
}
trap cleanup EXIT

step "Disposable remote with synthetic release tags"
# The source checkout may belong to another user (CI runs this as root).
git -c safe.directory="*" clone --quiet --no-tags "$SOURCE" "$WORK/src"
git -C "$WORK/src" checkout --quiet -B main "$(git -C "$WORK/src" rev-parse "$REF")" 2>/dev/null ||
  git -C "$WORK/src" checkout --quiet -B main "$REF"
git -C "$WORK/src" config user.name "IA-MNS rehearsal"
git -C "$WORK/src" config user.email "rehearsal@ia-mns.invalid"
git init --quiet --bare "$WORK/remote.git"
tag() { git -C "$WORK/src" tag -a "$1" -m "Synthetic rehearsal release $1"; }
tag ia-mns-v0.0.1
add_migration() {
  mkdir -p "$WORK/src/apps/api/prisma/migrations/$1"
  printf '%s\n' "$2" >"$WORK/src/apps/api/prisma/migrations/$1/migration.sql"
  git -C "$WORK/src" add -A && git -C "$WORK/src" commit --quiet -m "Rehearsal: $1"
}
break_start() {
  python3 - "$WORK/src/infra/production/compose.yaml" "$1" <<'PY'
import sys
path, enable = sys.argv[1], sys.argv[2] == "on"
text = open(path, encoding="utf-8").read()
marker = '    command: ["node", "-e", "process.exit(3)"]\n'
anchor = "  api:\n"
text = text.replace(marker, "")
if enable:
    text = text.replace(anchor, anchor + marker, 1)
open(path, "w", encoding="utf-8").write(text)
PY
  git -C "$WORK/src" add -A && git -C "$WORK/src" commit --quiet -m "Rehearsal: release start $1"
}
add_migration 209901010001_rehearsal_probe 'CREATE TABLE "rehearsal_probe" ("id" INTEGER NOT NULL PRIMARY KEY);'
tag ia-mns-v0.0.2
break_start on
tag ia-mns-v0.0.3
add_migration 209901010002_rehearsal_probe_note 'ALTER TABLE "rehearsal_probe" ADD COLUMN "note" TEXT;'
tag ia-mns-v0.0.4
break_start off
tag ia-mns-v0.0.5
git -C "$WORK/src" push --quiet "$WORK/remote.git" main --tags
git -C "$WORK/src" checkout --quiet ia-mns-v0.0.1
pass "remote with ia-mns-v0.0.1 .. ia-mns-v0.0.5"

step "Install the tooling from the release checkout"
"$WORK/src/infra/production/bin/ia-mns-deploy" install 2>>"$LOG"
[[ -x "$TOOL" && -f "$IA_MNS_CONFIG_DIR/runtime.env" ]] || fail "install did not create the tool and configuration"
[[ "$(stat -c %a "$IA_MNS_CONFIG_DIR")" == "700" && "$(stat -c %a "$IA_MNS_CONFIG_DIR/runtime.env")" == "600" ]] ||
  fail "configuration permissions"
expect_failure "check-config with placeholders" "$TOOL" check-config
pass "installed; placeholders are refused"

step "Synthetic configuration and generated secrets"
set_value() {
  python3 - "$IA_MNS_CONFIG_DIR/$1" "$2" "$3" <<'PY'
import sys
path, key, value = sys.argv[1:4]
lines = open(path, encoding="utf-8").read().splitlines()
lines = [f"{key}={value}" if line.split("=", 1)[0] == key else line for line in lines]
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
PY
}
set_value compose.env IA_MNS_BIND_ADDRESS "$BIND"
set_value compose.env IA_MNS_HTTP_PORT "$PORT"
set_value compose.env IA_MNS_GIT_REMOTE "$WORK/remote.git"
set_value compose.env IA_MNS_CI_REPOSITORY ""
set_value compose.env IA_MNS_SMOKE_URL "http://$SMOKE_HOST:$PORT"
set_value runtime.env IA_MNS_PUBLIC_ORIGIN "$ORIGIN"
set_value runtime.env ORION_TRUSTED_PROXIES "192.0.2.10"
set_value runtime.env OPENAI_API_KEY "sk-rehearsal-synthetic-not-a-key"
set_value runtime.env SANKHYA_DB_USER "rehearsal_reader"
set_value runtime.env SANKHYA_DB_PASSWORD "rehearsal-synthetic"
set_value runtime.env SANKHYA_DB_CONNECT_STRING "oracle.rehearsal.invalid:1521/none"
age-keygen -o "$WORK/backup-age.key" 2>/dev/null
set_value backup.env IA_MNS_BACKUP_AGE_RECIPIENT "$(age-keygen -y "$WORK/backup-age.key")"
set_value backup.env IA_MNS_BACKUP_EXTERNAL_TARGET "$WORK/external"
tool init-secrets
grep -qE '^[^#]*__GENERATE_' "$IA_MNS_CONFIG_DIR"/*.env && fail "placeholders remain after init-secrets"
grep -q 'IA_MNS_IDENTITY_SIGNING_KEY=' "$LOG" && fail "a secret name with its value reached the log"
tool check-config
pass "configuration complete"

step "check-config refusals"
cp -a "$IA_MNS_CONFIG_DIR" "$WORK/etc.saved"
printf 'ORION_MIGRATION_DATABASE_URL=postgresql://x:y@postgres:5432/ia_mns\n' >>"$IA_MNS_CONFIG_DIR/runtime.env"
expect_failure "migration credential in runtime.env" "$TOOL" check-config
rm -rf "$IA_MNS_CONFIG_DIR" && cp -a "$WORK/etc.saved" "$IA_MNS_CONFIG_DIR"
chmod 644 "$IA_MNS_CONFIG_DIR/runtime.env"
expect_failure "world-readable runtime.env" "$TOOL" check-config
rm -rf "$IA_MNS_CONFIG_DIR" && cp -a "$WORK/etc.saved" "$IA_MNS_CONFIG_DIR"
set_value compose.env IA_MNS_BIND_ADDRESS "0.0.0.0"
expect_failure "publishing on every interface" "$TOOL" check-config
rm -rf "$IA_MNS_CONFIG_DIR" && cp -a "$WORK/etc.saved" "$IA_MNS_CONFIG_DIR" && rm -rf "$WORK/etc.saved"
tool check-config

step "Database setup: volume, hardened authentication, roles"
tool setup
docker volume inspect "$IA_MNS_POSTGRES_VOLUME" >/dev/null || fail "volume missing"
[[ -z "$(docker port "$(compose_project ps -q postgres)")" ]] || fail "PostgreSQL publishes a port"
[[ "$(docker network inspect "${IA_MNS_COMPOSE_PROJECT}_backend" --format '{{.Internal}}')" == "true" ]] || fail "backend network is not internal"
[[ "$(psql_admin "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'ia_mns'" postgres)" == "ia_mns_migrator" ]] || fail "database owner"
[[ "$(psql_admin "SELECT rolsuper OR rolcreaterole OR rolcreatedb FROM pg_roles WHERE rolname = 'orion_runtime'" postgres)" == "f" ]] || fail "runtime role attributes"
SUPERUSER_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$IA_MNS_CONFIG_DIR/postgres.env" | cut -d= -f2-)"
if PGPASSWORD="$SUPERUSER_PASSWORD" docker run --rm --network "${IA_MNS_COMPOSE_PROJECT}_backend" -e PGPASSWORD \
  "$(docker inspect "$(compose_project ps -q postgres)" --format '{{.Config.Image}}')" \
  psql -h postgres -U postgres -d ia_mns -c 'SELECT 1' >/dev/null 2>&1; then
  fail "the superuser can sign in over the network"
fi
SUPERUSER_PASSWORD=""
pass "superuser refused over the network; database owned by the migration role"

step "First deployment ia-mns-v0.0.1"
tool deploy ia-mns-v0.0.1
[[ "$(state current)" == "ia-mns-v0.0.1" && "$(running_release)" == "ia-mns-v0.0.1" ]] || fail "current release"
[[ "$(last_result)" == "success" ]] || fail "deployment record"
ls "$IA_MNS_BACKUP_DIR"/pre-deploy/*-pre-deploy-ia-mns-v0.0.1.dump >/dev/null || fail "pre-deployment backup"
[[ "$(docker exec "$(compose_project ps -q api)" id -u)" != "0" ]] || fail "the API runs as root"
docker exec "$(compose_project ps -q api)" sh -c 'env' | grep -qE '^(ORION_MIGRATION_DATABASE_URL|POSTGRES_PASSWORD)=' &&
  fail "the API container holds a migration or administrator credential"
headers="$(curl -s -D - -o /dev/null -H 'Accept: text/html' "http://$SMOKE_HOST:$PORT/embed/pdt")"
grep -qi "^content-security-policy: frame-ancestors 'none'" <<<"$headers" || fail "embed without configured host must not be framable"
[[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: text/html' "http://$SMOKE_HOST:$PORT/docs")" == "200" ]] || fail "SPA fallback"
curl -s -H 'Accept: text/html' "http://$SMOKE_HOST:$PORT/" | grep -q 'Living documentation' && fail "the production build contains the /docs portal"
pass "v0.0.1 running healthy, non-root, without migration or administrator credentials"

step "Runtime role privileges"
RUNTIME_URL="$(grep '^ORION_DATABASE_URL=' "$IA_MNS_CONFIG_DIR/runtime.env" | cut -d= -f2-)"
runtime_psql() {
  RUNTIME_URL="$RUNTIME_URL" docker run --rm --network "${IA_MNS_COMPOSE_PROJECT}_backend" -e RUNTIME_URL \
    "$(docker inspect "$(compose_project ps -q postgres)" --format '{{.Config.Image}}')" \
    sh -c 'psql "$RUNTIME_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$0"' "$1"
}
[[ "$(runtime_psql 'SELECT count(*) FROM identity_persons')" == "0" ]] || fail "runtime read"
runtime_psql 'CREATE TABLE intruder (id int)' >/dev/null 2>&1 && fail "the runtime role can create tables"
runtime_psql 'DELETE FROM identity_audit_events' >/dev/null 2>&1 && fail "the runtime role can delete audit events"
RUNTIME_URL=""
pass "runtime reads and writes its tables only; no DDL; audit is append-only"

step "Persist synthetic data through the application"
invitation="$(tool bootstrap-owner | grep -o 'https://[^ ]*#[A-Za-z0-9_-]*')" || fail "bootstrap invitation"
token="${invitation##*#}"
code="$(curl -s -o "$WORK/bootstrap.json" -w '%{http_code}' -X POST "http://$SMOKE_HOST:$PORT/api/identity/bootstrap" \
  -H 'content-type: application/json' -H 'x-ia-mns-client: web' -H "origin: $ORIGIN" \
  --data "{\"token\":\"$token\",\"displayName\":\"Rehearsal Owner\",\"login\":\"rehearsal-owner\",\"password\":\"a synthetic rehearsal passphrase\"}")"
[[ "$code" == "200" ]] || fail "bootstrap answered $code"
[[ "$(psql_admin 'SELECT count(*) FROM identity_persons')" == "1" ]] || fail "person not persisted"
pass "first owner created through the API"

step "Restarts keep data"
tool restart
docker restart "$(compose_project ps -q postgres)" >/dev/null
for _ in $(seq 1 60); do
  [[ "$(docker inspect "$(compose_project ps -q postgres)" --format '{{.State.Health.Status}}')" == "healthy" ]] && break
  sleep 2
done
for _ in $(seq 1 60); do
  [[ "$(docker inspect "$(compose_project ps -q api)" --format '{{.State.Health.Status}}')" == "healthy" ]] && break
  sleep 2
done
[[ "$(psql_admin 'SELECT count(*) FROM identity_persons')" == "1" ]] || fail "data lost after restarts"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$SMOKE_HOST:$PORT/api/health/ready")" == "200" ]] || fail "not ready after restarts"
pass "API and PostgreSQL restarted; data persisted"

step "Backup, encrypted external copy and restore verification"
tool backup --label rehearsal
dump="$(find "$IA_MNS_BACKUP_DIR/daily" -name '*-rehearsal.dump' | head -n1)"
[[ -s "$dump" && -f "$dump.sha256" ]] || fail "backup files"
external="$WORK/external/$(basename "$dump").age"
[[ -f "$external" ]] || fail "external copy missing"
age --decrypt -i "$WORK/backup-age.key" -o "$WORK/decrypted.dump" "$external"
cmp -s "$dump" "$WORK/decrypted.dump" || fail "external copy does not decrypt to the backup"
rm -f "$WORK/decrypted.dump"
tool verify-restore "$dump"
python3 - "$IA_MNS_STATE_DIR/last-restore-verification.json" <<'PY' || fail "restore verification record"
import json, sys
record = json.load(open(sys.argv[1]))
assert record["result"] == "success" and record["counts"]["persons"] == 1, record
assert record["migrations"]["compatible"] and not record["migrations"]["pending"], record
PY
[[ -z "$(docker ps -aq --filter label=br.com.ia-mns.purpose=restore-check)" ]] || fail "restore check left a container"
tool status >/dev/null 2>&1 || fail "status reports a problem"
# Without the current release's migration image the check cannot be skipped.
docker image rm "$IA_MNS_IMAGE_REPOSITORY-migrate:ia-mns-v0.0.1" >/dev/null
expect_failure "verify-restore without the release's migration image" "$TOOL" verify-restore "$dump"
tool build ia-mns-v0.0.1
tool verify-restore "$dump"
pass "backup restored into a disposable database; external copy decrypts; status clean"

step "Upgrade ia-mns-v0.0.2 with an additive migration"
tool deploy ia-mns-v0.0.2
[[ "$(state current)" == "ia-mns-v0.0.2" && "$(state previous)" == "ia-mns-v0.0.1" ]] || fail "release state"
[[ "$(psql_admin "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '209901010001_rehearsal_probe' AND finished_at IS NOT NULL")" == "1" ]] || fail "migration not applied"
[[ "$(psql_admin 'SELECT count(*) FROM identity_persons')" == "1" ]] || fail "data lost on upgrade"
tail -n1 "$IA_MNS_STATE_DIR/deployments.log" | grep -q '209901010001_rehearsal_probe' || fail "applied migrations not recorded"
pass "upgraded with the migration applied and recorded"

step "Rollback to a release that does not know the schema is refused"
expect_failure "rollback to ia-mns-v0.0.1" "$TOOL" rollback
[[ "$(running_release)" == "ia-mns-v0.0.2" ]] || fail "refused rollback changed the running release"

step "Failed release without migrations returns automatically"
expect_failure "deploy ia-mns-v0.0.3 (cannot start)" "$TOOL" deploy ia-mns-v0.0.3
[[ "$(running_release)" == "ia-mns-v0.0.2" && "$(state current)" == "ia-mns-v0.0.2" ]] || fail "not back on ia-mns-v0.0.2"
[[ "$(last_result)" == "rolled-back" ]] || fail "automatic rollback not recorded"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$SMOKE_HOST:$PORT/api/health/ready")" == "200" ]] || fail "not ready after automatic rollback"
pass "ia-mns-v0.0.3 failed and ia-mns-v0.0.2 serves again"

step "Failed release after a migration is not rolled back automatically"
expect_failure "deploy ia-mns-v0.0.4 (migration, then cannot start)" "$TOOL" deploy ia-mns-v0.0.4
[[ "$(last_result)" == "failed" && "$(state current)" == "ia-mns-v0.0.2" ]] || fail "failure not recorded"
[[ "$(psql_admin "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '209901010002_rehearsal_probe_note' AND finished_at IS NOT NULL")" == "1" ]] || fail "the migration should have run"
expect_failure "rollback to ia-mns-v0.0.2 without accepting the newer schema" "$TOOL" rollback
tool rollback --accept-schema-ahead
[[ "$(running_release)" == "ia-mns-v0.0.2" ]] || fail "explicit rollback"
pass "explicit, accepted rollback restored service on ia-mns-v0.0.2"

step "Forward fix ia-mns-v0.0.5"
tool deploy ia-mns-v0.0.5
[[ "$(state current)" == "ia-mns-v0.0.5" && "$(running_release)" == "ia-mns-v0.0.5" ]] || fail "forward fix"
tail -n1 "$IA_MNS_STATE_DIR/deployments.log" | python3 -c 'import json,sys; assert json.load(sys.stdin)["applied"] == []' || fail "no migration should remain"
pass "forward fix deployed; schema already current"

step "Rollback with no API container returns to the current release"
compose_project rm --force --stop api >/dev/null 2>&1
[[ -z "$(running_release)" ]] || fail "the API container should be gone"
tool rollback
[[ "$(running_release)" == "ia-mns-v0.0.5" && "$(state current)" == "ia-mns-v0.0.5" ]] || fail "not back on the current release"
[[ "$(state previous)" == "ia-mns-v0.0.2" ]] || fail "previous release overwritten"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$SMOKE_HOST:$PORT/api/health/ready")" == "200" ]] || fail "not ready after rollback"
pass "a missing API container is replaced by the current release, not the previous one"

step "Restore an older backup into the live database"
tool backup --label before-change
restore_from="$(find "$IA_MNS_BACKUP_DIR/daily" -name '*-before-change.dump' | head -n1)"
tickets_before="$(psql_admin 'SELECT count(*) FROM identity_tickets')"
tool bootstrap-owner --break-glass >/dev/null
[[ "$(psql_admin 'SELECT count(*) FROM identity_tickets')" -gt "$tickets_before" ]] || fail "change not made"
expect_failure "restore without --confirm" "$TOOL" restore "$restore_from"
tool restore "$restore_from" --confirm
[[ "$(psql_admin 'SELECT count(*) FROM identity_tickets')" == "$tickets_before" ]] || fail "restore did not return the data"
[[ "$(psql_admin 'SELECT count(*) FROM identity_persons')" == "1" ]] || fail "restored persons"
[[ "$(psql_admin "SELECT count(*) FROM pg_database WHERE datname LIKE 'ia_mns_before_restore_%'" postgres)" == "1" ]] || fail "replaced database not kept"
[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$SMOKE_HOST:$PORT/api/health/ready")" == "200" ]] || fail "not ready after restore"
ls "$IA_MNS_BACKUP_DIR"/pre-restore/*.dump >/dev/null || fail "safety backup before restore"
pass "restored; the replaced database is kept; service healthy"

step "Final status"
tool verify-restore
tool status >/dev/null 2>&1 || fail "final status reports a problem"
pass "all rehearsal checks passed"
