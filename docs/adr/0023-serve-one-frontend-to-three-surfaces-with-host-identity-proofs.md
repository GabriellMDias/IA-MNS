# ADR-0023: Serve One Frontend to Three Surfaces with Host Identity Proofs

**Status:** accepted
**Date:** 2026-10-04
**Superseded by:** [ADR-0026](0026-host-ia-mns-in-sankhya-om-through-an-in-repository-add-on.md), only for maintaining the Om host component outside this repository; the PDT host page stays in PDT, and the rest of this decision remains accepted

## Context

IA-MNS must be reachable at its own URL, inside PDT Connect and inside Sankhya Om without maintaining three frontends. Inside a host, the person is already authenticated there and must not sign in again, yet IA-MNS must never trust an identifier supplied by the browser. Modern browsers block or partition third-party cookies and storage in iframes, and framing must not weaken clickjacking protection. A disposable proof of concept on 2026-10-04 confirmed in Chrome 154, with third-party cookies blocked, that an in-memory session with a host handshake works, that `localStorage` throws inside a third-party frame, that `frame-ancestors` blocks other origins, and that a cross-site form post back from the Om requires a `SameSite=None` binding cookie.

An internal review of the current Om deployment found that its session transport and cookie protections do not yet meet the conditions required to trust it as an authentication source (details are kept outside this public repository). The PDT contract v1 already lets an authenticated PDT page obtain an authorization code for a registered client through its `authorize` endpoint, which returns the redirect URL as JSON.

## Decision

- **One build, three surfaces.** The same SPA serves `/` (direct), `/embed/pdt` and `/embed/sankhya`. The embedded prefix becomes the router basepath, so all routes and reloads stay inside it. The surface is recorded on the session for audit only and never affects identity or authorization.
- **Framing policy.** Every response carries `frame-ancestors 'none'` except `/embed/*`, which allows only the configured host origins (`PDT_EMBED_ORIGIN`, `SANKHYA_EMBED_ORIGIN`). Hosts render IA-MNS in an iframe; IA-MNS code never runs in a host origin.
- **Host bridge protocol v1.** The frame starts a pending server flow and asks its parent, with `postMessage` to the exact host origin, for a proof bound to that flow. Messages are accepted only from that origin and the parent window. Only opaque proofs travel: a PDT authorization code (the host calls PDT's existing `authorize` endpoint with its own client and callback configuration) or a Sankhya assertion. IA-MNS redeems or verifies the proof server-side. The embedded session lives in memory; renewal and reload repeat the handshake; no cookies or browser storage are needed.
- **Direct URL.** "Entrar com PDT Connect" uses the PDT contract redirect with state, PKCE and a `SameSite=Lax` browser-binding cookie. "Entrar com Sankhya" redirects to an Om add-on page that, if the Om session is valid, form-posts a short assertion back; its binding cookie is `SameSite=None; Secure`. An IA-MNS local account is always available.
- **Sankhya proof.** An IA-MNS add-on inside the Om reads the authenticated user from the server-side session and signs a JWS (RS256/ES256, `iss` = fixed installation id, `sub` = CODUSU, `aud` = IA-MNS, flow `nonce`, `jti`, lifetime ≤ 120 s). IA-MNS pins the public keys, enforces single use, and links by `(issuer, CODUSU)`. The connector boundary is mechanism-independent; the legacy credential login remains only a documented fallback and is not implemented.
- **Trust gate.** Production refuses the Sankhya session connector until `SANKHYA_SESSION_TRUST=approved` is set after the Om security conditions are met (HTTPS only with HSTS, `Secure`/`SameSite=Lax` session cookie, HTTPS redirects, no direct public HTTP exposure, private or encrypted proxy-to-Om hop). The add-on must mint only for requests that arrived through the HTTPS name.

## Rationale

Iframes give origin isolation and let every IA-MNS change reach all surfaces at once. Server-verified proofs make identity independent of what the browser claims; origin checks on `postMessage` are defense in depth, not the security basis. Avoiding cookies in embedded mode removes the dependence on third-party cookie policy. Using the PDT contract unchanged keeps PDT authoritative and requires only a host page in PDT. An Om session is an acceptable authentication source only when its transport and cookie are protected, hence the explicit gate.

## Alternatives Considered

### Separate frontends or components injected into each host

Rejected: duplicated maintenance, and injected code would run with the host's privileges, dependencies and CSP.

### Third-party or partitioned cookies for embedded sessions

Rejected as a requirement: browser behavior varies and is changing; in-memory sessions with a host handshake work under all tested policies.

### Legacy Sankhya credential login as the primary Sankhya method

Not chosen: the password would pass through IA-MNS and the service is no longer in Sankhya's documentation. It remains a fallback that, if ever used, must call the Om only through HTTPS or a private network.

## Consequences

### Positive

- One application, history and authorization regardless of where IA-MNS is opened.
- No credentials or session cookies in embedded hosts; clickjacking stays blocked for everything except the declared hosts.

### Negative

- Each host needs a small, reviewed host component (PDT page; Om add-on with its signing key), deployed and maintained outside this repository.
- Production web hosting must reproduce the per-path `frame-ancestors` policy.
- Embedded sessions are short and re-handshake every 10 minutes and on reload.
- Sankhya sign-in stays unavailable in production until the Om infrastructure is fixed.

### Operational or Migration Impact

The Om hardening, the PDT homologation client and host page, and the Om add-on and its key custody are human actions. The Om add-on key must be stored outside component sources editable by ordinary BI authors; anyone able to publish code inside the Om could impersonate Sankhya users, which matches their existing power inside Sankhya.

## References

- [Identity domain](../domains/identity.md)
- [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0012](0012-verify-jwt-access-tokens-at-the-first-api-boundary.md)
- [Sankhya external access guidance (reverse proxy with TLS)](https://ajuda.sankhya.com.br/hc/pt-br/articles/360044982114)
- [Project human actions](../project/human-actions.md)
