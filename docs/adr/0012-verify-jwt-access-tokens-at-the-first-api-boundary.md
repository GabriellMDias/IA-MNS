# ADR-0012: Verify JWT Access Tokens at the First API Boundary

**Status:** accepted

**Date:** 2026-09-24

## Context

The Approval Request feature requires every operation to authenticate a human before applying ownership and review-capability rules. H-05 selected a provider-independent OIDC/OAuth 2.0 bearer access-token boundary and deferred a concrete identity provider, password/session systems, and provider-specific refresh and revocation behavior. Phase 5 must verify tokens in a running API and in synthetic tests without provisioning an external service.

The existing [authentication policy](../security/authentication.md) left the token format and cryptographic mechanism to an explicit decision. This choice affects security and issuer interoperability beyond a local helper implementation.

## Decision

For the first Orion API, accept signed JWT bearer **access tokens** with `typ` of `at+jwt`, verified locally using the configured trusted issuer's JWKS. Require an exact issuer and API audience, a non-expired token, an issued-at time, a subject, a stable Orion application-principal UUID claim, and an issuer-validated human actor claim. Accept RS256 or ES256 signatures. Map an issuer-validated `approval:review` scope to the application capability; no unverified client-supplied identity or capability reaches the domain/application layer.

Keep issuer, audience, JWKS endpoint, and runtime database URL in validated server-only configuration. The stable Orion principal ID is a provider-independent application contract: a later provider integration must preserve that ID across provider changes. No concrete provider, login/session store, introspection service, token issuance, or provider-specific revocation strategy is selected here. A later requirement for opaque tokens or a different trust mechanism needs a separate decision and compatibility review.

## Rationale

Local signature verification makes the boundary executable and testable with synthetic keys without depending on an external account or network call per business request. Explicit issuer/audience checks and an application-owned principal identifier keep authorization independent of provider-native claim types. A narrow algorithm allowlist and trusted JWKS reduce ambiguity in accepted credentials.

This accepts a JWT-shaped issuer contract for the first API. It does not establish JWT as a universal Orion credential format or decide browser login behavior.

## Alternatives Considered

### Opaque-token introspection

Introspection could support provider-side active-token checks but would require selecting and provisioning an external issuer/introspection service for Phase 5, contrary to the current provider deferral and offline synthetic-test requirement. It remains available if future revocation or provider constraints justify it.

### API-owned session or password store

This would add credential and lifecycle responsibilities that H-05 explicitly excludes from the API.

## Consequences

### Positive

- Authentication can be exercised with signed synthetic tokens and a local JWKS endpoint; authorization tests need no real accounts.
- Application and domain operations receive only a stable principal ID and capability set.

### Negative

- A future issuer must supply the required JWT profile, stable Orion principal mapping, human actor assertion, and review scope. Provider compatibility must be checked before production integration.
- Local signature verification does not by itself provide immediate provider-side token revocation. Provider-specific revocation and session behavior remain deferred; short token lifetimes and operational controls must be assessed with a chosen provider.

### Operational or Migration Impact

Deployments using the Approval Request feature must supply separate runtime database credentials and trusted token issuer/audience/JWKS settings. Keys may rotate through JWKS. Provider provisioning, issuer claims, and secure configuration are tracked under [H-07](https://github.com/GabriellMDias/Orion/blob/v1.1.1/docs/human-actions.md#h-07) only when a real provider is selected.

## References

- [Approval Request identity decision](https://github.com/GabriellMDias/Orion/blob/v1.1.1/docs/domains/approval-request.md#identity-and-authorization-boundary)
- [Authentication policy](../security/authentication.md)
- [Authorization policy](../security/authorization.md)
- [Approval Request implementation conventions](https://github.com/GabriellMDias/Orion/blob/v1.1.1/docs/domains/approval-request-implementation.md)
