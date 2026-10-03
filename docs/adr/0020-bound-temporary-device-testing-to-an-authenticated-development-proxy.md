# ADR-0020: Bound Temporary Device Testing to an Authenticated Development Proxy

**Status:** accepted
**Date:** 2026-10-01
**Extends:** [ADR-0019](0019-compose-a-corporate-agent-with-durable-conversations.md), only temporary owner-controlled device testing. Persistent history, normal loopback development and production verifier requirements remain unchanged.

## Context

The owner requests testing IA-MNS from a phone on the same network. The current web/API bind to loopback, and the credential-free developer access is deliberately unavailable to other devices. Simply exposing that proxy would disclose local confidential history. Production identity remains outside scope.

## Decision

Accepted under the owner's request for phone testing, after reviewing the existing isolation rules and validating the non-production, expiry, credential and origin boundaries. Production identity remains deliberately deferred.

Provide an explicit temporary network-test launcher with a separate loopback API and a web listener bound to one assigned RFC1918 IPv4 address. All protected operations in that API require a random 256-bit bearer, an absolute expiry within two hours, the application-client header and the configured browser origin when present. Cross-site and non-loopback upstream requests are rejected. Normal credential-free local access and the temporary mode are mutually exclusive; production and normal issuer configuration reject this mode.

The bearer maps to the existing local developer's conversations. Agent permissions are explicitly provided by composition; currently only sales:read. Future capability registration does not automatically expand this token's permission. The existing access field holds the token in memory, never URL/browser storage. Save its initial value only in an ignored local environment file for the owner to transfer to their device. Stop/expiry terminates the separate services and removes that file; it does not rotate OpenAI/Oracle credentials or alter normal .env.local.

## Rationale

This reuses the current bearer UI and owner-scoped API without selecting a production identity provider, adding cookies, weakening the desktop bypass or exposing database listeners. A two-hour absolute lifetime and process-local service separation bound this development convenience. HTTP on a private test network does not provide transport encryption; use only an owner-controlled trusted LAN. This is not shared employee access or a deployment method.

## Alternatives Considered

### Expose the existing credential-free proxy

Rejected because unrelated network devices could retrieve the local owner's history. Relaxing only Origin/listener checks is not authorization.

### Select a production identity provider or public tunnel

Deferred because the request is temporary testing on an existing LAN. Production identity, TLS hosting and shared lifecycle controls remain separate decisions.

## Consequences

### Positive

- Phone testing uses actual providers and existing durable context under explicit temporary authorization.
- API and PostgreSQL remain unavailable directly over the LAN.
- Defaults and production authentication guarantees remain unchanged.

### Negative

- The owner must transfer a temporary credential and restart the test after expiry.
- HTTP transport is limited to trusted development networks; it is not suitable for shared deployment.
- Firewall/router policies can still require owner action; the launcher does not disable or broadly change them.

### Operational or Migration Impact

No schema, business SQL, existing history owner or external credential changes. The separate web/API use ports 5174/3002. A private HTTP origin can lack crypto.randomUUID; request UUID v4 uses Web Crypto random bytes when necessary, preserving secure acceptance identifiers and replay behavior.

## References

- [Network testing procedure](../setup.md#phone-testing-on-the-local-network)
- [Authentication policy](../security/authentication.md)
- [Project plan](../project/implementation-plan.md)
