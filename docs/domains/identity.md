# IA-MNS Identity

[ADR-0022](../adr/0022-own-the-ia-mns-identity-with-verified-external-links.md) · [ADR-0023](../adr/0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md) · [Corporate agent](corporate-agent.md) · [Setup](../setup.md#identity) · [Human actions](../project/human-actions.md)

## Model

The `identity` API module (`apps/api/src/features/identity/`) owns who a person is in IA-MNS and what they may do. The web module (`apps/web/src/features/identity/`) owns sign-in, first access, account and administration screens and the embedded host bridge.

| Concept | Meaning |
| --- | --- |
| Person | The single principal. Its UUID is the access-token `orion_principal_id` and the owner of conversations. Disabled or `merged` into another Person, never hard-deleted. |
| Local account | Optional login and scrypt password, temporary lockout, optional TOTP second factor with ten single-use recovery codes. |
| External link | A verified `(provider, issuer, subject)`: PDT `identitySubject` under `PDT_IDENTITY_ISSUER`, or Sankhya `CODUSU` under `SANKHYA_IDENTITY_ISSUER`. One account maps to one Person; one account per provider installation per Person. `established_by` is `proof` (the person proved the account) or `directory` (an owner selected the real Sankhya user). The provider-reported e-mail is kept only as a duplicate hint. |
| Session | Method (`local`, `pdt`, `sankhya`, `bootstrap`, `enrollment`), surface (`direct`, `pdt`, `sankhya`), assurance (`single`, `mfa`), authentication time, idle and absolute expiry. |
| Role | `owner`: principal administrator, independent of Sankhya and PDT roles. |
| Grant | An explicit owner grant of a registered catalog permission. |

Physical structure, constraints and classification are in the [schema reference](../generated/database/schema.md) (`identity_*` tables). Names and e-mails are never identity keys. A Person may hold any combination of a local account, a Sankhya link and a PDT link; all of them reach the same history, preferences and permissions.

## Sign-in methods and surfaces

| Surface | How a Person signs in | Session |
| --- | --- | --- |
| Direct (`/`) | IA-MNS login and password (+TOTP), "Entrar com PDT Connect" (contract redirect), "Entrar com Sankhya" (Om add-on redirect) | Access token in memory; rotating refresh credential in an HttpOnly cookie (`__Host-ia-mns-session`, SameSite=Strict, 12 h absolute, 2 h idle) |
| PDT (`/embed/pdt`) | Automatic: the PDT host page supplies a PDT authorization code for the pending flow | Memory only; 10-minute session renewed by a new handshake; no cookies |
| Sankhya (`/embed/sankhya`) | Automatic: the Om add-on supplies a signed assertion for the pending flow | Same as PDT |

On the direct surface every product screen requires a signed-in person; anyone else is sent to `/entrar`. The surface is audit metadata; capabilities never depend on it. The same Person, conversations, links and permissions are used everywhere.

### Direct provider flows

1. `POST /identity/providers/{provider}/start` with `mode: "direct"` creates a 5-minute single-use flow (state, nonce, PKCE verifier) and sets a browser-binding cookie: `ia-mns-pdt` with SameSite=Lax (PDT returns by top-level GET) or `ia-mns-sankhya` with SameSite=None (the Om returns by cross-site form post). Over HTTPS both carry `__Host-` and `Secure`.
2. PDT: the browser goes to the contract `/integrations/authorize`; PDT redirects to `PDT_IDENTITY_REDIRECT_URI` (`GET /identity/pdt/callback`). Sankhya: the browser goes to `SANKHYA_IDENTITY_AUTHORIZE_URL?state&nonce`; the add-on form-posts `assertion` and `state` to `POST /identity/sankhya/callback`.
3. The API checks the state ticket and the binding cookie, redeems the PDT code server-side (client secret, PKCE, identity lookup, immediate revoke) or verifies the assertion, then redirects to `/`, `/conta?novo=1` (profile created at first access), `/entrar/primeiro-acesso` (first access waiting for confirmation, or a login started from it with `resumeFirstAccess`), `/conta?vinculado=<provider>` (link or link invitation), `/conta?unificar=<provider>` (consolidation offer), `/conta?confirmado=1` (reauthentication) or `/entrar?erro=CODE`. Callback queries are never logged and responses use `Referrer-Policy: no-referrer`.

### Embedded handshake (bridge protocol v1)

1. The frame calls `POST /identity/providers/{provider}/start` with `mode: "embedded"`. It receives a secret `pendingId` (kept in memory instead of a cookie), the configured host origin and, for PDT, `state` and `codeChallenge` (S256), or, for Sankhya, a `nonce`.
2. The frame posts to `window.parent` with target origin = host origin:
   - PDT: `{ v: 1, type: "ia-mns:auth-request", requestId, provider: "pdt", state, code_challenge }`
   - Sankhya: `{ v: 1, type: "ia-mns:auth-request", requestId, provider: "sankhya", nonce }`
3. The host answers only its own IA-MNS iframe, with target origin = IA-MNS origin:
   - PDT: `{ v: 1, type: "ia-mns:auth-response", requestId, code, state, iss }`
   - Sankhya: `{ v: 1, type: "ia-mns:auth-response", requestId, assertion }`
   - Failure: `{ v: 1, type: "ia-mns:auth-error", requestId, error }` (for example `pdt_login_required`, `no_authenticated_user`).
4. The frame sends the proof to `POST /identity/providers/{provider}/complete`; the API verifies it and returns an access token (with `provisioned: true` on an automatic first access), a confirmation request, or a public error.

The frame accepts messages only from the configured host origin and its parent window. These checks are defense in depth: an intercepted code is useless without the client secret and PKCE verifier held by the API, and an assertion is bound to the server nonce and accepted once.

### PDT host component (outside this repository)

PDT Connect needs a page or menu entry that renders `<iframe src="https://<ia-mns>/embed/pdt">` and implements step 3 for PDT. It uses the **existing** contract v1 endpoint `POST /api/auth/integrations/authorize` with the signed-in PDT JWT and its own fixed configuration: `client_id` and the registered `redirect_uri` (never values sent by the frame). It then forwards the `code`, `state` and `iss` from the returned `redirectUrl` without navigating. No PDT backend change is needed. The identity contract client registration (`PDT_IDENTITY_CLIENTS`, with only the SHA-256 of the IA-MNS secret) and the host page are PDT changes owned by PDT ([PH-12](../project/human-actions.md#ph-12)).

### Sankhya Om add-on assertion contract (outside this repository)

The add-on runs inside the Om and must:

- read the authenticated user from the **server-side** session (never from the browser) and refuse CODUSU 0 and requests that did not arrive through the Om HTTPS name;
- mint a compact JWS with header `{ alg: "RS256" | "ES256", typ: "JWT", kid }` and claims `iss` = `SANKHYA_IDENTITY_ISSUER`, `aud` = `IA_MNS_IDENTITY_AUDIENCE`, `sub` = CODUSU (decimal string), `nonce` = the flow nonce, `jti` = unique id, `iat`, and `exp` ≤ `iat` + 120 seconds; the `name` and `email` (the user's TSIUSU e-mail, used only as a duplicate hint) claims are optional;
- expose the mint operation only to same-origin POST requests from its own embedding page (custom header, `Sec-Fetch-Site: same-origin`), and the direct-URL page only as a top-level document that form-posts to the fixed IA-MNS callback;
- keep the private key outside sources editable by ordinary component authors, publishing only public keys (`SANKHYA_IDENTITY_KEYS`, a JWKS that IA-MNS pins).

The 2026-10-04 proof of concept confirmed the signing code on Java 8 and the browser mechanics; reading the real Om session awaits [PH-11](../project/human-actions.md#ph-11). Production refuses this connector until `SANKHYA_SESSION_TRUST=approved`.

## First access, duplicates and linking

There is no public account creation. People who use Sankhya or PDT Connect need no prior registration; local credentials come only from the bootstrap, owner invitations, or an authenticated Person adding a password as another method.

- **Automatic first access.** A verified PDT or Sankhya account that is not linked creates its Person and link atomically (`person.provisioned` audit, `provisioned: true`), named from the provider-reported name. Concurrent first accesses of one account converge on one Person through the link's unique key.
- **When it stops instead.** Creation pauses with `provision_required` and a 10-minute single-use ticket (response body when embedded, HttpOnly cookie when direct) when:
  - `reason: "candidate"`: the account reports an e-mail equal to the one recorded on another provider's link of an active Person that does not already have an account of this provider. `methods` lists that Person's sign-in methods available here. The person either proves the profile (signs in with one of them, then `POST /identity/provision/link` attaches the account) or states it is not theirs (`POST /identity/provision/create` creates a separate Person). The e-mail alone never links anything.
  - `reason: "signed_in"` (direct only): the browser already holds a session of a Person when the login started. The person attaches the account to that Person or creates a separate one.
  `POST /identity/provision/inspect` describes a pending ticket without consuming it.
- **Linking later** (`intent: "link"`) requires a current session authenticated in the last 10 minutes and a new proof. If the account already belongs to a Person whose only method is that account (no password, grants or owner role), the result is `merge_available`; confirming with `POST /identity/merge` (same session) consolidates that Person into the current one. Any other existing owner of the account is refused with `IDENTITY_LINK_CONFLICT`; a different account of the same installation with `IDENTITY_PROVIDER_ALREADY_LINKED`.
- **Link invitations.** An owner issues a 72-hour single-use invitation for a Person and provider (`/identidade/vincular#<secret>`). The person signs in to that provider (`intent: "invite"`); the proven account is attached to the invited Person. If the account had already created its own Person with nothing else in it, that Person is consolidated into the invited one.
- **Consolidation** (by proof or by an owner) runs in one transaction: links move, the local credential and recovery codes move when the target has none (otherwise they are removed), grants are united, the agent module moves conversations through the `transferOwnership` port supplied at composition (refused with `IDENTITY_MERGE_BUSY` while a turn runs), the source's sessions end and it becomes `merged`. Owner roles are never absorbed. Access tokens already issued to the source remain valid for other modules until they expire (10 minutes).
- Unlinking requires recent authentication and never removes the last sign-in method. Owners may unlink for others under the same rule. Every link change is audited.
- Recent authentication is restored with the local password (+TOTP) (`POST /identity/me/reauthenticate`), a provider proof with `intent: "reauth"` (only for an account already linked to the Person), or a new embedded handshake.

## Authorization

Effective permissions are computed by the identity module from trusted state only and issued as access-token scopes:

1. explicit owner grants of permissions in the composed catalog (`apps/api/src/modules.ts`);
2. provider policy: a **read** permission may be granted automatically to Persons with an active link of a listed provider. The current catalog grants `sales:read` (Sankhya sales consultation) to Persons with an active Sankhya link. `IA_MNS_PROVIDER_GRANTS` can narrow this (`none` disables it). Write and sensitive permissions are rejected for automatic grants at startup;
3. internal roles: `owner` receives every catalog permission plus `identity:admin`.

Nothing from the browser, the host or the language model adds a permission. Modules continue to check scopes, as the agent does for `sales:read`. Scope changes reach other modules within the 10-minute access-token lifetime; identity endpoints check sessions on every request. Linking Sankhya therefore grants sales reading by policy, and creating a profile from PDT grants no business capability until PDT capabilities exist or an owner grants one. [PH-13](../project/human-actions.md#ph-13) records the owner's confirmation of this policy.

## Principal administrator, bootstrap and recovery

- `pnpm identity:bootstrap` (server shell, runtime configuration) prints a single-use 30-minute URL `/identidade/inicial#<secret>` when no active owner exists; `--break-glass` issues one even if owners exist. Both are audited. The page creates the owner with a local account and then requires TOTP before administration.
- Administration (`/admin`, `/identity/admin/*`) requires the owner role, a TOTP-assured session, and authentication within 30 minutes for changes. The last active owner cannot be removed or disabled, and owners cannot disable their own TOTP.
- Owners create Persons with any combination of: a 72-hour single-use local enrollment invitation (`/identidade/convite#enrollment=<secret>`); a Sankhya user selected from the ERP directory; and link invitations for PDT Connect or Sankhya. Associations always point to a real account: Sankhya users are re-read from the directory on the server (missing or expired-access accounts and accounts already linked elsewhere are refused before anything is created), and PDT accounts require the person's proof because PDT exposes no user directory to IA-MNS. The same actions exist for existing Persons, together with a new enrollment invitation and the reset invitation, which removes the local credential and revokes sessions. Invitation secrets travel in URL fragments, which are not sent to servers, and are removed from history on load.
- Owners consolidate two Persons of the same individual (`POST /identity/admin/persons/{personId}/merge`) when they cannot be proven together; owners are never the absorbed Person and overlapping providers are refused.
- The Sankhya directory (`GET /identity/admin/sankhya-users`) reads the DBA-provided view named in `SANKHYA_DIRECTORY_VIEW` (columns `CODUSU`, `NOMEUSU`, `NOMEUSUCPLT`, `EMAIL`, `DTLIMACESSO`) in a read-only transaction with its own two-connection pool and a 10-second call timeout, returning at most 20 users. It is off while the view is not configured ([PH-08](../project/human-actions.md#ph-08)). It needs only `SANKHYA_IDENTITY_ISSUER`, not the Om session connector, so it is not gated by PH-11.

## Security properties

- Secrets (tickets, refresh credentials, recovery codes, assertion ids) are 256-bit random values or high-entropy codes stored only as SHA-256. Passwords are scrypt verifiers; TOTP secrets are AES-256-GCM sealed. None are logged or returned after creation.
- Failures for unknown logins and wrong passwords are identical, and a dummy hash equalizes timing. Lockout is temporary (from the 5th failure: 1, 2, 4… up to 60 minutes). Login, verification and flow endpoints are rate limited.
- Cookie-authenticated endpoints (refresh, provisioning and consolidation by cookie, signed-in detection at login start) accept only same-origin web requests (`x-ia-mns-client: web`, `Sec-Fetch-Site`, `Origin`). A consolidation ticket is bound to the session that proved both profiles.
- Audit (`identity_audit_events`) is append-only for the runtime role and stores only allowlisted codes.
- All identity responses are `Cache-Control: no-store`.

## Deployment requirements

- HTTPS `IA_MNS_PUBLIC_ORIGIN`; the signing and encryption keys in the secret store (generate them like `apps/api/scripts/local-identity.ts`; never reuse local keys).
- Serve the web and the API under the same origin, with the API at the browser path used in `PDT_IDENTITY_REDIRECT_URI` (for example `https://<ia-mns>/api/identity/pdt/callback`).
- Web hosting must send `Content-Security-Policy: frame-ancestors 'none'` on every route except `/embed/pdt` and `/embed/sankhya`, which allow only their host origins. The development and preview servers apply this with `ORION_WEB_EMBED_ANCESTORS`.
- Configuration names are listed in the [generated configuration reference](../generated/configuration/api.md).

## Limits and next steps

- Real PDT homologation and the Om add-on are pending human actions (PH-12, PH-11). Synthetic contract tests, browser journeys and the proof of concept are not production evidence.
- Passkeys, e-mail recovery, SCIM or automated deprovisioning from Sankhya/PDT, and Sankhya-group-to-permission mappings are not implemented. Deactivating a user in Sankhya or PDT stops new proofs; existing IA-MNS sessions end at their expiry or on owner action.
- PDT authorization data (permissions and stores) is not yet mapped to IA-MNS capabilities; future PDT capabilities must re-authorize with PDT at execution time, as the contract requires.
- Retention of identity data, audit and sessions follows the shared-deployment policy still pending in [PH-09](../project/human-actions.md#ph-09).
