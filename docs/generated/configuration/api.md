# API Configuration Reference

<!-- Generated from apps/api/src/config.ts. Run pnpm -C apps/api references:write; do not edit. -->

[Configuration policy](../../architecture/configuration.md) · [API runtime](../../../apps/api/README.md)

No values are eligible for client exposure. `ORION_ENV` is always required. The three token settings are configured together. API modules that require the database or bearer authentication stay unmounted until those settings exist, and production startup fails instead.

Role says why a setting is an environment variable: `bootstrap` (infrastructure, deployment or trust configuration; changed by deployment and restart), `secret` (credential or key; never exposed through an API or interface), `parameter` (installation default of an [operational parameter](../../architecture/configuration.md#operational-parameters) that owners override at run time) or `development` (local development and testing only).

| Environment variable | Role | Type | Required | Default | Visibility | Classification | Secret | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ORION_ENV` | bootstrap | development \| test \| production | yes | — | server | INTERNAL | no | Runtime environment. |
| `ORION_RELEASE_ID` | bootstrap | artifact identifier, 1..128 ASCII letters/digits/._- | no | `local` | server | INTERNAL | no | Actual artifact revision for correlated logs and traces; local for unversioned development. |
| `ORION_API_HOST` | bootstrap | nonempty string | no | `127.0.0.1` | server | INTERNAL | no | Listen address; loopback by default. |
| `ORION_API_PORT` | bootstrap | integer 0..65535 | no | `3000` | server | INTERNAL | no | Listen port; zero selects an ephemeral port. |
| `ORION_LOG_LEVEL` | bootstrap | Pino level | no | `info` | server | INTERNAL | no | Structured log threshold. |
| `ORION_SHUTDOWN_TIMEOUT_MS` | bootstrap | integer 100..30000 | no | `5000` | server | INTERNAL | no | Total graceful shutdown deadline. |
| `ORION_TRUSTED_PROXIES` | bootstrap | comma list of IP addresses or narrow CIDRs (IPv4 /24+, IPv6 /64+) | no | — | server | INTERNAL | no | Reverse proxies whose X-Forwarded-For and X-Forwarded-Proto are honored; unset trusts none, so the client address is the direct peer. |
| `ORION_TLS_CERT_FILE` | bootstrap | file path (PEM) | no | — | server | INTERNAL | no | Certificate chain for an HTTPS listener on the proxy-to-application hop; configure with ORION_TLS_KEY_FILE. |
| `ORION_TLS_KEY_FILE` | bootstrap | file path (PEM) | no | — | server | INTERNAL | no | Private key of ORION_TLS_CERT_FILE; the path is configuration, the file is a secret readable only by the process. |
| `ORION_WEB_ROOT` | bootstrap | directory path of a built apps/web | no | — | server | INTERNAL | no | Serves the web build from this process at the same origin; the API then answers under /api, as the development proxy does. |
| `ORION_WEB_DOCS` | bootstrap | enabled \| disabled | no | — | server | INTERNAL | no | Whether the served web build may contain the /docs portal; disabled by default in production, enabled otherwise. Requires ORION_WEB_ROOT. |
| `ORION_OTLP_ENDPOINT` | bootstrap | http(s) URL | no | — | server | INTERNAL | no | Optional OTLP HTTP collector base URL. |
| `ORION_TRACE_SAMPLE_RATIO` | bootstrap | number 0..1 | no | `1` | server | INTERNAL | no | Trace sampling probability. |
| `ORION_DATABASE_URL` | secret | PostgreSQL URL | no | — | server | RESTRICTED | yes | Runtime PostgreSQL credential; enables the database for modules that require it and adds it to readiness. |
| `ORION_TOKEN_ISSUER` | bootstrap | issuer URL | no | — | server | INTERNAL | no | Expected access-token issuer; configure with audience and JWKS URL to enable bearer authentication. |
| `ORION_TOKEN_AUDIENCE` | bootstrap | nonempty string | no | — | server | INTERNAL | no | Expected API access-token audience. |
| `ORION_TOKEN_JWKS_URL` | bootstrap | http(s) URL | no | — | server | INTERNAL | no | Trusted issuer public-key endpoint. |
| `OPENAI_API_KEY` | secret | nonempty string | no | — | server | RESTRICTED | yes | Dedicated IA-MNS project key; required for agent routing and capability interpretation. |
| `OPENAI_MODEL` | parameter | model identifier | no | `gpt-6.1-sol` | server | INTERNAL | no | Installation default of the AI model (Responses API with strict function calling); an owner value in administration (Parâmetros) takes precedence. |
| `IA_MNS_AI_TRACE` | parameter | off \| metadata \| content | no | `metadata` | server | INTERNAL | no | Installation default of AI turn tracing; an owner value in administration (Parâmetros) takes precedence. metadata logs allowlisted decisions, timings and token counts without user content; content also stores confidential interpretation traces with each turn and is refused in production until PH-09. |
| `SANKHYA_DB_USER` | secret | nonempty string | no | — | server | RESTRICTED | yes | Oracle account with CREATE SESSION and only SELECT grants on the sales reference tables. |
| `SANKHYA_DB_PASSWORD` | secret | nonempty string | no | — | server | RESTRICTED | yes | Restricted Oracle account password; configure with user and connect string. |
| `SANKHYA_DB_CONNECT_STRING` | secret | Oracle connect descriptor | no | — | server | RESTRICTED | yes | Oracle Easy Connect or full descriptor, without embedded credentials. |
| `SANKHYA_ORACLE_CLIENT_LIB_DIR` | bootstrap | local directory | no | — | server | INTERNAL | no | Optional Oracle Client 19+ library directory; enables Thick mode when needed. |
| `VRMASTER_DB_HOST` | bootstrap | host name or IP address | no | — | server | RESTRICTED | no | VRMaster PostgreSQL server of the Pilar da Terra sales source; configure with name, user and password. |
| `VRMASTER_DB_PORT` | bootstrap | integer 1..65535 | no | `5432` | server | INTERNAL | no | VRMaster PostgreSQL port. |
| `VRMASTER_DB_NAME` | bootstrap | PostgreSQL database name | no | — | server | INTERNAL | no | VRMaster database that holds the sales reference tables. |
| `VRMASTER_DB_USER` | secret | PostgreSQL role name | no | — | server | RESTRICTED | yes | Dedicated read-only VRMaster role (PH-19) with SELECT only on the sales reference tables; never the PDT Connect account. |
| `VRMASTER_DB_PASSWORD` | secret | nonempty string | no | — | server | RESTRICTED | yes | Password of the dedicated read-only VRMaster role. |
| `VRMASTER_DB_SSL_MODE` | bootstrap | verify-full \| disable | no | `verify-full` | server | INTERNAL | no | TLS with certificate and host verification, or explicitly disabled for a server without TLS, which sends the credentials and sales data unencrypted on that network. |
| `IA_MNS_LOCAL_ACCESS` | development | true \| false | no | `false` | server | INTERNAL | no | Explicit local development access; forbidden in production or on a non-loopback listener. |
| `IA_MNS_DEV_ACCESS_TOKEN` | development | 64 lowercase hexadecimal characters | no | — | server | RESTRICTED | yes | Temporary bearer for an owner-controlled LAN test; non-production loopback API only, paired with origin and expiration. Never browser configuration. |
| `IA_MNS_DEV_ACCESS_ORIGIN` | development | private IPv4 HTTP origin | no | — | server | INTERNAL | no | Exact browser origin for the temporary LAN test; no credentials, path or wildcard. |
| `IA_MNS_DEV_ACCESS_EXPIRES_AT` | development | Unix timestamp in seconds | no | — | server | INTERNAL | no | Absolute temporary bearer expiry; at most two hours after startup. Checked on every request, not renewed. |
| `IA_MNS_PUBLIC_ORIGIN` | bootstrap | exact origin | no | — | server | INTERNAL | no | Browser origin of the IA-MNS web application; token issuer and redirect target for sign-in flows. HTTPS in production; enables identity together with the signing and encryption keys. |
| `IA_MNS_IDENTITY_SIGNING_KEY` | secret | base64url PKCS#8 DER P-256 private key | no | — | server | RESTRICTED | yes | Signs IA-MNS access tokens (ES256). Generate with pnpm identity:keys; never browser configuration. |
| `IA_MNS_IDENTITY_ENCRYPTION_KEY` | secret | base64url 32-byte key | no | — | server | RESTRICTED | yes | AES-256-GCM key for TOTP secrets at rest. Rotation requires re-enrollment of second factors. |
| `IA_MNS_IDENTITY_AUDIENCE` | bootstrap | nonempty identifier | no | `ia-mns-api` | server | INTERNAL | no | Audience of IA-MNS access tokens. |
| `IA_MNS_PROVIDER_GRANTS` | parameter | none \| comma list of provider:permission | no | — | server | INTERNAL | no | Installation default of automatic read grants by provider link; an owner value in administration (Parâmetros) takes precedence. Unset uses the composed capability defaults, none disables them. |
| `PDT_IDENTITY_BASE_URL` | bootstrap | HTTPS origin | no | — | server | INTERNAL | no | PDT Connect origin serving the identity contract; configure with issuer, client and redirect URI. |
| `PDT_IDENTITY_ISSUER` | bootstrap | HTTPS URL | no | — | server | INTERNAL | no | Exact PDT_IDENTITY_ISSUER of the PDT installation; link issuer for PDT identities. |
| `PDT_IDENTITY_CLIENT_ID` | bootstrap | 1..64 letters, digits, _ or - | no | — | server | INTERNAL | no | IA-MNS client id registered in PDT_IDENTITY_CLIENTS. |
| `PDT_IDENTITY_CLIENT_SECRET` | secret | 32+ characters | no | — | server | RESTRICTED | yes | IA-MNS client secret for the PDT contract; PDT stores only its SHA-256. |
| `PDT_IDENTITY_REDIRECT_URI` | bootstrap | HTTPS URL | no | — | server | INTERNAL | no | Exact callback registered in PDT; the browser-visible URL of GET /identity/pdt/callback, which the web origin serves under /api. |
| `PDT_EMBED_ORIGIN` | bootstrap | exact origin | no | — | server | INTERNAL | no | Only PDT origin allowed to host the embedded IA-MNS and exchange bridge messages. |
| `SANKHYA_IDENTITY_ISSUER` | bootstrap | stable identifier | no | — | server | INTERNAL | no | Fixed identifier of the Sankhya installation: issuer of CODUSU links (owner directory association) and expected in Om host assertions. |
| `SANKHYA_IDENTITY_KEYS` | bootstrap | JWKS JSON of public keys | no | — | server | INTERNAL | no | Pinned public keys of the Om identity add-on (RS256/ES256). Private key material is rejected. |
| `SANKHYA_IDENTITY_AUTHORIZE_URL` | bootstrap | HTTPS URL | no | — | server | INTERNAL | no | Om add-on page that mints an assertion for the direct-URL sign-in. |
| `SANKHYA_EMBED_ORIGIN` | bootstrap | exact origin | no | — | server | INTERNAL | no | Only Om origin allowed to host the embedded IA-MNS and exchange bridge messages. |
| `SANKHYA_DIRECTORY_VIEW` | bootstrap | Oracle view name (optionally SCHEMA.VIEW) | no | — | server | INTERNAL | no | Read-only Sankhya user view (CODUSU, NOMEUSU, NOMEUSUCPLT, EMAIL, DTLIMACESSO) that lets owners associate real Sankhya users; unset disables the directory (PH-08). |
| `SANKHYA_SESSION_TRUST` | bootstrap | pending \| approved | no | `pending` | server | INTERNAL | no | Human gate for Om-session sign-in in production (PH-11); production refuses the Sankhya connector until approved. |
