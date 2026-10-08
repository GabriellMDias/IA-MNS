# IA-MNS production images (ADR-0031). Build from the repository root:
#   docker build -f infra/production/Dockerfile --target runtime --build-arg RELEASE_ID=<tag> .
#   docker build -f infra/production/Dockerfile --target migrate --build-arg RELEASE_ID=<tag> .
# Both targets come from the same build stage, so a release's migrations and
# server always match. No secret is read or written while building.

ARG NODE_IMAGE=node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f

# Oracle Instant Client Basic 19.32 for Linux x86-64, Oracle 12.1-compatible
# Thick mode (the Thin driver cannot reach the Sankhya database). Downloaded
# from Oracle's public endpoint and verified against the size and SHA-256 that
# Oracle publishes on its Instant Client download page; never committed. The
# Oracle Free Use Terms included as BASIC_LICENSE cover internal use.
ARG ORACLE_IC_URL=https://download.oracle.com/otn_software/linux/instantclient/1932000/instantclient-basic-linux.x64-19.32.0.0.0dbru.zip
ARG ORACLE_IC_SHA256=1749ca1eb5f75b038f2b7ce0abc42eb4575928159259fc4fc851c54a8ca7b002

FROM ${NODE_IMAGE} AS oracle
ARG ORACLE_IC_URL
ARG ORACLE_IC_SHA256
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
RUN curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      --output /tmp/instantclient.zip "$ORACLE_IC_URL" \
  && echo "$ORACLE_IC_SHA256  /tmp/instantclient.zip" | sha256sum --check --strict \
  && mkdir -p /opt/oracle \
  && unzip -q /tmp/instantclient.zip -d /opt/oracle \
  && mv /opt/oracle/instantclient_* /opt/oracle/instantclient \
  # Java and SDK files are unused by node-oracledb.
  && rm -f /opt/oracle/instantclient/*.jar /tmp/instantclient.zip

FROM ${NODE_IMAGE} AS deps
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PNPM_HOME=/pnpm
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .node-version ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/sdk/package.json packages/sdk/
RUN --mount=type=cache,id=ia-mns-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# The production web build leaves out the /docs portal (ADR-0029).
RUN pnpm db:generate \
  && pnpm -C apps/api build \
  && VITE_ORION_DOCS=disabled pnpm -C apps/web build \
  && pnpm -C apps/web bundle:check
RUN --mount=type=cache,id=ia-mns-pnpm-store,target=/pnpm/store \
    pnpm --filter @ia-mns/api deploy --legacy --prod /out/runtime \
  && pnpm --filter @ia-mns/api deploy --legacy /out/migrate \
  && rm -rf /out/runtime/src /out/runtime/test /out/runtime/scripts /out/runtime/evals \
            /out/migrate/src /out/migrate/test /out/migrate/scripts /out/migrate/evals \
  # Release checkouts are created with a restrictive umask; the images run as
  # node, which must read everything and write nothing.
  && chmod -R a+rX,go-w /out /src/apps/api/dist /src/apps/web/dist

FROM ${NODE_IMAGE} AS runtime
ARG RELEASE_ID=unversioned
ARG REVISION=unknown
RUN apt-get update \
  && apt-get install -y --no-install-recommends libaio1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=oracle /opt/oracle/instantclient /opt/oracle/instantclient
RUN echo /opt/oracle/instantclient > /etc/ld.so.conf.d/oracle-instantclient.conf && ldconfig
WORKDIR /app
COPY --from=build /out/runtime/ /app/
COPY --from=build /src/apps/api/dist /app/dist
COPY --from=build /src/apps/web/dist /app/web
# Files stay owned by root: the server process cannot change its own code.
ENV NODE_ENV=production \
    ORION_API_HOST=0.0.0.0 \
    ORION_API_PORT=3000 \
    ORION_WEB_ROOT=/app/web \
    SANKHYA_ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient \
    ORION_RELEASE_ID=${RELEASE_ID}
LABEL org.opencontainers.image.title="IA-MNS" \
      org.opencontainers.image.source="https://github.com/GabriellMDias/IA-MNS" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${RELEASE_ID}" \
      org.opencontainers.image.revision="${REVISION}" \
      br.com.ia-mns.component="runtime"
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "dist/cli/health-probe.js"]
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS migrate
ARG RELEASE_ID=unversioned
ARG REVISION=unknown
WORKDIR /app
COPY --from=build /out/migrate/ /app/
COPY --from=build /src/apps/api/dist /app/dist
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    ORION_RELEASE_ID=${RELEASE_ID}
LABEL org.opencontainers.image.title="IA-MNS migrations" \
      org.opencontainers.image.source="https://github.com/GabriellMDias/IA-MNS" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${RELEASE_ID}" \
      org.opencontainers.image.revision="${REVISION}" \
      br.com.ia-mns.component="migrate"
USER node
CMD ["node", "dist/cli/database-deploy.js"]
