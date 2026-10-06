# ADR-0025: Administer the Authentication Policy within Fixed Safeguards

**Status:** accepted
**Date:** 2026-10-05
**Extends:** [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md) (sessions, recent authentication and the principal administrator). Its identity model, issuer, link rules and refresh rotation remain valid; this record makes their durations and second-factor rules administrable and refines reuse detection for concurrent renewals.

## Context

ADR-0022 fixed direct sessions at 12 hours (2 hours idle), recent authentication at 10 minutes (30 for administration), and a second factor only for administration. The owner needs to relax these values in development and tighten them again for production from the administration screen, without code or deployment changes and without understanding tokens. The same review found that two renewals presenting the same refresh credential at once (React development double effects, several tabs, or a reload during a renewal) were treated as credential reuse and revoked the session about ten minutes later, which forced a new sign-in with the second factor. Inactivity was also extended by background renewals of an open tab, so an unattended page never became inactive.

## Decision

The identity module owns an **authentication policy** stored as one database row (`identity_security_policies`) and administered by owners at `/admin` (`GET`/`PUT /identity/admin/security-policy`):

- session maximum duration, inactivity timeout, the recent-authentication window for one's own account and for administration, who must use a second factor with an IA-MNS password (`everyone`, `administrators`, or `none`), and how many days a browser that completed the second factor may skip it;
- without a row the built-in defaults apply; they equal the previous fixed values;
- every value has hard limits enforced by the service and again by database checks; values beyond a recommended maximum, or `none`, are reported as reducing security and must be acknowledged explicitly when saved; changes are audited with previous and new values;
- a saved policy re-derives the deadlines of open direct sessions from their sign-in and last activity, so it applies at once in both directions; second-factor rules apply at the next sign-in, except that administration checks the current rule on every request.

Fixed safeguards that the policy cannot change:

- production never lets administrators skip the second factor: saving `none` is refused there, and a stored `none` is enforced as `administrators`;
- owners cannot remove their own second factor; unless a non-production policy says `none`, they are never offered a remembered browser and administer only from a session confirmed with the second factor (with `none`, a development owner may be remembered like anyone else, keeping the factor enrolled for when the production policy returns);
- a person whose policy requires a second factor cannot sign in with the password alone or remove the factor; the password only opens the enrollment;
- access tokens stay 10 minutes and embedded sessions renew through host proofs; one-time tickets, provider flows, invitations, lockout, refresh rotation and audit keep their fixed lifetimes and rules.

Session renewal is made robust and activity-based: the browser serializes renewals across tabs and reports whether the person interacted since the last renewal; only activity postpones the inactivity deadline; the API answers a renewal that presents the credential replaced in the last 30 seconds with a token for the same session and no new credential, and treats later presentations as reuse.

## Rationale

A single row in the identity module keeps the policy next to the sessions it governs, is read once per short cache period, and is changed through the same audited, strongly authenticated administration as people and permissions. Environment variables would need redeployments and could not show the administrator the consequences. Re-deriving open sessions avoids a confusing period in which old sessions follow old rules. Hard limits and the production floor keep a permissive development choice from silently reaching production, while still allowing the owner to choose comfortable values. The grace window is short and limited to the immediately previous credential of a live session, so stolen-credential detection is preserved for any later reuse.

## Alternatives Considered

### Configuration through environment variables

Rejected: changes would require restarts and deployment access, the owner asked to manage them in administration, and a development value could be copied into production unnoticed.

### Per-person or per-role policies

Not adopted now: one policy plus fixed owner safeguards covers the request with much less to review. Role-specific policies can be added on the same storage if needed.

### Longer access tokens instead of renewals

Rejected: other modules accept access tokens until they expire, so long tokens would delay revocation and permission changes. Sessions stay long through renewals instead.

## Consequences

### Positive

- Development can use long sessions and an optional second factor; production policy is restored from administration, with administrators' second factor guaranteed.
- Unexpected sign-outs caused by concurrent renewals are removed, and inactivity reflects what the person does.
- Remembered browsers reduce repeated codes for ordinary accounts without weakening administrators.

### Negative

- More security-relevant state is administrable, so an owner can still choose a weaker (but bounded and acknowledged) policy.
- Other API instances follow a policy change within the 15-second cache; access tokens already issued remain valid for up to 10 minutes.
- Remembered browsers rely on a long-lived HttpOnly cookie on that device.

### Operational or Migration Impact

- Additive migration `202610050002_identity_security_policy` (policy row, remembered browsers, refresh rotation time, sign-in enrollment tickets); without a row the previous behavior continues.
- Before production, an owner reviews the policy at `/admin` (Autenticação e segurança).

## References

- [Identity domain](../domains/identity.md#authentication-policy)
- [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0012](0012-verify-jwt-access-tokens-at-the-first-api-boundary.md)
- [Authentication policy](../security/authentication.md)
