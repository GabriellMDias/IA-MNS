# ADR-0029: Serve the Web and API from One Origin behind Restricted Trusted Proxies

**Status:** accepted
**Date:** 2026-10-07
**Extends:** [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md) (one frontend, three surfaces, per-path framing) and [ADR-0004](0004-select-fastify-as-the-backend-http-framework.md) (Fastify). It decides the production runtime shape of the application, not the deployment platform, secret store, backup or release procedure, which remain deployment decisions.

## Context

IA-MNS will run in production behind a corporate TLS reverse proxy at one public HTTPS origin. The identity requires the web application and the API under that origin: cookies are `__Host-` cookies, cookie-authenticated endpoints compare `Origin` with `IA_MNS_PUBLIC_ORIGIN`, and the PDT redirect URI is the browser path `/api/identity/pdt/callback`. ADR-0023 requires `frame-ancestors 'none'` on every route except `/embed/pdt` and `/embed/sankhya`, which only their host may frame.

Before this decision only the Vite development server provided that shape: it served the web, stripped `/api` before proxying to an API mounted at the root, and set the framing policy from `ORION_WEB_EMBED_ANCESTORS`. The emitted API served no web build. Behind a proxy, Fastify saw every client as the proxy address, so the process-local rate limits of the identity endpoints (5 to 60 requests per minute) would have been shared by all users and exhausted by one attacker. The owner bootstrap and database grant tooling ran TypeScript through `tsx`, a development dependency, so a production artifact could not run them. Whether the proxy-to-application hop stays plain HTTP on a private network or needs TLS is not yet confirmed with the infrastructure administrator.

## Decision

- **One process, one origin.** When `ORION_WEB_ROOT` names a built `apps/web`, the API process serves it. The build is indexed once at startup and only exact file paths are served; page navigations that match no file receive `index.html`, so the router keeps direct URLs, reloads and the embedded basepaths. Missing assets, unknown API paths and non-GET requests receive the JSON error envelope. The API then answers under `/api`, exactly the browser path the development proxy strips, and the health probes answer both at the root (for orchestration) and under `/api` (the contract the SDK and explorer use). Without `ORION_WEB_ROOT` the API stays at the root, unchanged.
- **Framing and referrer from the API configuration.** Each response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a `frame-ancestors` policy: `/embed/pdt` and `/embed/sankhya` allow only `PDT_EMBED_ORIGIN` and `SANKHYA_EMBED_ORIGIN` respectively, everything else `'none'`. The served origin needs no separate framing setting that could drift from the identity configuration. The development and preview servers send the same `Referrer-Policy`.
- **Documentation portal opt-in in production.** `VITE_ORION_DOCS=disabled` builds the web without the `/docs` portal and its generated content, and the build records that in its manifest. The API refuses a build that contains the portal unless `ORION_WEB_DOCS=enabled`; the default is `disabled` in production and `enabled` elsewhere.
- **Restricted trusted proxies.** `ORION_TRUSTED_PROXIES` lists the exact proxy addresses (or narrow ranges: IPv4 /24 or narrower, IPv6 /64 or narrower) whose `X-Forwarded-For` and `X-Forwarded-Proto` Fastify honors. Unset trusts none. Wildcards, named ranges and broad networks are refused, and trusted proxies cannot be combined with the loopback-only local or temporary access modes. The client address is the right-most `X-Forwarded-For` entry that is not a trusted proxy, so values a client prepends are ignored. Identity derives issuer, redirects and cookie security only from `IA_MNS_PUBLIC_ORIGIN`; no code relies on the forwarded host or protocol. The list names the address the application actually sees as its peer: the proxy's own address when it connects from another machine, or, when it runs on the same host and reaches a published container port, the container network gateway, which every local process can also use and therefore needs host firewall rules that admit only the proxy.
- **Optional internal TLS.** `ORION_TLS_CERT_FILE` and `ORION_TLS_KEY_FILE` make the same process listen with HTTPS for a proxy-to-application hop that must be encrypted. Plain HTTP on that hop is not assumed approved; the deployment selects it only for a confirmed private hop.
- **Compiled operational commands.** The emitted API ships `dist/cli/identity-bootstrap.js` (first owner), `identity-keys.js` (new signing and encryption keys into a new owner-only file, never printed), `config-check.js` (the startup validation and module production requirements, without listening or connecting) and `database-deploy.js` (committed migrations, the declared runtime grants, and a check that the runtime role holds exactly those privileges, no administrative attribute and no ownership). Only `database-deploy` reads `ORION_MIGRATION_DATABASE_URL`; the server process and the other commands delete it. It never creates roles or sets passwords: the database administrator creates the runtime role once. Local `pnpm db:local` and the migrated-database test fixture run the same deployment step.

### Route compatibility

| Concern | Development (Vite) | API without `ORION_WEB_ROOT` (unchanged) | API serving the web build |
| --- | --- | --- | --- |
| Browser API base | `/api`, stripped by the Vite proxy | not applicable | `/api`, routed by Fastify |
| Module operations | API at `/identity/*`, `/agent/*`, `/sales/*` | the same root paths | only under `/api/*`; the same paths without `/api` are page routes |
| Health | `/health/*` on the API | `/health/*` | `/health/*` and `/api/health/*` |
| PDT and Sankhya callbacks | `<web origin>/api/identity/{pdt,sankhya}/callback` | — | the same browser URLs |
| Unknown path | Vite serves the shell; API 404 envelope | 404 envelope | page navigations receive the shell; `/api/*`, `/health/*`, missing `/assets/*`, non-page requests and non-GET methods receive the 404 envelope |
| Framing and headers | Vite middleware: framing from `ORION_WEB_EMBED_ANCESTORS`, now also `no-referrer` | `frame-ancestors 'none'`, `no-referrer`, `nosniff` | per surface from the embed origins, `no-referrer`, `nosniff` |

The OpenAPI paths, operation IDs and SDK are unchanged: the SDK already resolves them against `/api`. Cookies keep `Path=/` and the `__Host-` prefix on HTTPS origins, so they reach `/api/identity/*` on the served origin as they did through the development proxy.

## Rationale

Serving from the API keeps one network hop between the corporate proxy and the code that interprets the client address, so a single exact trust entry suffices. Deriving the framing policy from `PDT_EMBED_ORIGIN` and `SANKHYA_EMBED_ORIGIN` removes a second list of host origins. Indexing exact files at startup avoids path resolution on request input and fails fast on a missing or foreign build, without a new dependency. Mounting the API under `/api` only when serving the web reproduces the browser contract of development and keeps API-only runs, tests and references unchanged.

`Referrer-Policy: no-referrer` is the most restrictive policy and was verified compatible with the identity flows. The [Fetch standard](https://fetch.spec.whatwg.org/#append-a-request-origin-header) serializes `Origin` as `null` under `no-referrer` only for requests whose response tainting is not CORS, such as native form submissions and navigations; `fetch()` requests keep the real `Origin`. A Chromium 154 probe on 2026-10-07 confirmed it: same-origin `fetch()` POSTs carried the real `Origin` and no `Referer` both at top level and inside a cross-origin iframe, while a native same-origin form POST carried `Origin: null`. Every IA-MNS write is a `fetch()` through the SDK, and neither the PDT authorization flow nor the Sankhya add-on reads `Referer`; the identity journeys assert the real `Origin` on the cookie refresh and on the embedded PDT proof exchange under this policy. A future native form POST to a cookie endpoint would be refused by its origin check rather than silently accepted.

Trusting only enumerated proxies keeps per-client limits meaningful without letting any peer choose its address. Requiring narrow ranges is deliberately conservative; a broader proxy pool would need a new decision. Internal TLS in the same process avoids a sidecar when the hop must be encrypted, at the cost of certificate files the deployment must manage. Running the database step, grants and their verification from one command removes divergence between local setup, tests and production, and turns grant drift into a deployment failure instead of a silent privilege escalation.

## Alternatives Considered

### A separate static web server or reverse proxy container in front of the API

nginx or Caddy could serve the build and proxy `/api`. It adds a second forwarded-header hop to trust, a second copy of the embed origins and another container to operate, without a capability the API lacks for this traffic.

### `@fastify/static`

The official plugin serves directories generically, with its own path resolution. An exact startup index of a known build is simpler and closes path handling entirely; the plugin remains an option if the build outgrows memory.

### Always mounting the API under `/api`

This would change every API-only test, reference and development proxy at once, with no benefit while Vite strips the prefix.

### Trusting every proxy (`trustProxy: true`) or a hop count

Either would let a client that reaches the application directly, or through an unexpected path, forge its address and bypass per-client limits.

### TLS only through a sidecar

A TLS-terminating sidecar remains possible, but it moves the trusted-proxy boundary to the sidecar and adds an operational component for a choice the infrastructure has not yet made.

## Consequences

### Positive

- One artifact serves direct, PDT and Sankhya surfaces with framing derived from the identity configuration.
- Rate limits and future audit can use the real client address behind the corporate proxy.
- A production artifact can bootstrap the owner, generate keys, validate configuration and deploy the database without development tooling.
- The `/docs` portal stays out of production unless deliberately enabled.
- No IA-MNS URL, including conversation identifiers and invitation pages, reaches another site through `Referer`.

### Negative

- The process holds the web build in memory (under 1 MB without the portal, about 8 MB with it) and serves static files itself.
- Each new proxy address requires a configuration change; a broad pool requires revisiting this decision.
- Internal TLS adds certificate files and their renewal to the deployment.
- `database-deploy` requires the Prisma CLI, so the migration artifact carries it while the server artifact does not need to.
- New same-origin writes must use `fetch()`: a native form POST would carry `Origin: null` and fail the cookie endpoints' origin check.

### Operational or Migration Impact

- Deployments set `ORION_WEB_ROOT`, `ORION_TRUSTED_PROXIES` for the confirmed proxy, `PDT_IDENTITY_REDIRECT_URI` under `/api`, and optionally the TLS files. Production builds use `VITE_ORION_DOCS=disabled`.
- The database administrator creates the `orion_runtime` login role once; every deployment then runs `database-deploy` with the migration credential before starting the server with the runtime credential.

## References

- [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md), [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0006](0006-select-prisma-orm-for-database-access-and-migrations.md)
- [API runtime guide](../../apps/api/README.md), [web guide](../../apps/web/README.md), [identity deployment requirements](../domains/identity.md#deployment-requirements)
- [Configuration policy](../architecture/configuration.md), [secrets policy](../security/secrets-management.md), [migration policy](../database/migrations.md)
