# ADR-0022: Own the IA-MNS Identity with Verified External Links

**Status:** accepted
**Date:** 2026-10-04

## Context

IA-MNS is used by people who may have accounts in Sankhya Om, in PDT Connect, both, or neither. The owner requires one IA-MNS identity per person, reached through any of those systems or an IA-MNS local account; automatic first-access provisioning through Sankhya or PDT Connect without prior registration; no public self-registration of local accounts; owner-only manual creation; no second Person for the same individual and no merge of people by name or e-mail; secure linking and unlinking; capabilities that depend on links and IA-MNS authorization rather than on the access surface; and a principal administrator independent of external roles. [ADR-0012](0012-verify-jwt-access-tokens-at-the-first-api-boundary.md) already fixes how the API verifies bearer access tokens, and the [authentication](../security/authentication.md) and [authorization](../security/authorization.md) policies require stable opaque subjects, separation of authentication and authorization, and explicit freshness.

Neither external system is an OpenID Connect provider. PDT Connect exposes its own identity contract v1 (authorization code with PKCE S256, confidential client, opaque five-minute token, identity lookup and revocation). Sankhya's documented gateway authentication is client credentials only and cannot identify a person; [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md) records how a Sankhya identity is proven. A general identity server would therefore need custom extensions for both systems.

## Decision

IA-MNS owns its identity in an `identity` API module:

- **Person** is the single principal. Its UUID is the access-token `orion_principal_id` and the owner of conversations and preferences. Persons are disabled, never hard-deleted, by the application.
- **External links** bind a Person to `(provider, fixed issuer, stable subject)`: PDT `identitySubject` or Sankhya `CODUSU` under a configured installation issuer. A subject maps to at most one Person; a Person has at most one account per provider installation. A link is established only by a server-verified proof in a context that names the Person (an existing session, an owner-issued link invitation, or the proof of the Person's only method) or by an owner attestation of a real Sankhya user read from the ERP directory; never from a typed identifier.
- **First access and duplicates.** An unknown external account creates its Person and link automatically unless there is a reason to suspect an existing profile: the browser is already signed in to a Person, or another active Person has a link of another provider that reported the same normalized e-mail. Then the person must either prove that profile (sign in with one of its methods, after which the account is attached) or declare it is not theirs and receive a separate Person. E-mail and names are hints only; they never link or merge. Two Persons of one individual are consolidated only by proof (the person proves both, and the absorbed one has no method other than the proven account, no grants and no owner role) or by an audited owner action with strong, recent authentication. Consolidation moves links, the local credential when the target has none, grants and other modules' data (conversations, through a composition port) in one transaction, and marks the source `merged`.
- **No public self-registration.** Local credentials are created only by the bootstrap, owner-issued enrollment or reset invitations, or as an additional method of an already authenticated Person. Owners create Persons with any combination of a local invitation, a directory-selected Sankhya user and proof-based link invitations.
- **Local accounts** use a normalized login and a scrypt password verifier (N=2^15, r=8, p=1) through the platform implementation, with progressive temporary lockout and uniform failures. **Strong authentication** is RFC 6238 TOTP whose secret is sealed with AES-256-GCM; ten single-use recovery codes are stored as hashes. Owners must keep TOTP. **Recovery** is owner-issued single-use invitations (72 hours) or the server-side bootstrap command with explicit break-glass.
- **Issuer and sessions.** IA-MNS issues ES256 `at+jwt` access tokens (10 minutes) carrying the Person, effective scopes, `sid`, assurance (`acr`) and `auth_time`; the API verifies them in process with the ADR-0012 contract. Direct-URL sessions keep a rotating refresh credential in an HttpOnly `__Host-` cookie (SameSite=Strict); reuse of a rotated credential revokes the session. Embedded sessions have no cookie and renew with a new host proof. Identity endpoints check the session row, so revocation, disabling and credential reset take effect immediately there; other modules accept the access token until it expires.
- **Authorization** stays separate from authentication. Effective permissions are computed only from server state: explicit owner grants of registered catalog permissions, a provider policy that may grant **read** capabilities to Persons with an active link of a given provider, and internal roles. Write or sensitive capabilities can never be granted automatically. The catalog is declared at composition; the language model never grants a capability.
- **Principal administrator** is the internal `owner` role: all catalog permissions plus `identity:admin`. Administration requires TOTP assurance and recent authentication for mutations; the last active owner cannot be removed or disabled. The first owner is created through a single-use invitation issued by a server-side command. Sensitive identity changes are recorded in an append-only audit table.

## Rationale

A first-party identity is the only model that satisfies "one Person, many methods" while both external systems use custom contracts. Keeping links keyed by stable provider subjects makes the login mechanism replaceable: a new Sankhya connector only has to prove the same `CODUSU`. Short access tokens fit ADR-0012 and give bounded permission freshness; immediate checks where they matter most (identity and administration) avoid a per-request database lookup elsewhere. scrypt, HMAC and AES-GCM from the platform avoid new runtime dependencies while respecting the rule against custom cryptography.

## Alternatives Considered

### Self-hosted general identity server (for example Keycloak)

Mature sessions, MFA and administration, but both PDT Connect and the Sankhya proof would need custom extensions in another technology, and the embedded host handshake is not a standard flow. It remains a possible future replacement behind the same Person, link and token contracts.

### Use one external system as the identity of record

Rejected: people without that system could not use IA-MNS, and the other system's users would need duplicate accounts.

### Link or merge automatically by matching e-mail

Rejected: neither system guarantees that an e-mail is verified, unique or still owned by the same person (Sankhya user e-mails are free-form), so a match could hand one person another's history and capabilities. The match only stops automatic creation and asks for proof.

### Always ask at first access whether the person already has a profile

Rejected after first implementation: it made every first access through Sankhya or PDT a registration step and invited people to create duplicates or to link the wrong profile. Asking only when there is a concrete reason keeps first access automatic.

### Let owners type an external identifier

Rejected: a mistyped or guessed `CODUSU` or PDT subject would bind a real account to the wrong Person. Owners select Sankhya users read from the ERP directory, and PDT associations require the person's own proof (PDT exposes no user directory to IA-MNS).

### Passkeys (WebAuthn) as the primary local factor

Desirable and compatible with this model, but it needs a browser and server library choice and recovery design. TOTP with recovery codes is accepted now; passkeys can be added as another method.

## Consequences

### Positive

- One Person, history and authorization across every method and surface; links and grants are auditable and reversible.
- External mechanisms can change without migrating Persons or conversations.

### Negative

- IA-MNS operates security-sensitive code and data (password verifiers, TOTP secrets, sessions, audit) and its keys.
- Permission changes reach non-identity modules within the 10-minute token lifetime, not instantly.
- Password reset depends on an owner; there is no e-mail recovery.
- A person with two profiles who cannot prove both (for example, the absorbed profile also has a password) needs an owner to consolidate them; someone who declares a suggested profile is not theirs gets a separate Person that an owner may later consolidate.
- The owner directory needs a read-only Sankhya user view granted by the ERP DBA.

### Operational or Migration Impact

An additive migration creates the identity tables with restricted runtime grants (audit is append-only). Production needs an HTTPS public origin, the signing key and the encryption key in the secret store; rotating the encryption key requires re-enrolling second factors. Existing local conversations owned by the explicit loopback developer identity remain available only in local mode.

## References

- [Identity domain](../domains/identity.md)
- [ADR-0012](0012-verify-jwt-access-tokens-at-the-first-api-boundary.md), [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md)
- [Authentication policy](../security/authentication.md), [authorization policy](../security/authorization.md)
- [Schema reference](../generated/database/schema.md)
