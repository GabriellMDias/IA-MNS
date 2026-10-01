# Approval Request: Reference Feature

[Documentation index](../README.md) · [Implementation conventions](approval-request-implementation.md) · [API reference](../generated/api/openapi.json)

This is the canonical business specification for Orion’s Approval Request reference feature, implemented by the API, durable PostgreSQL schema, and web interface. It preserves the approved actors, access model, and state rules. Concrete identity-provider provisioning remains conditional; architectural and security policies govern further evolution. It is foundation-only: projects derived from Orion do not contain it; see [Orion's reference implementation](../project-derivation.md#orions-reference-implementation).

## Purpose and actors

A **Requester** is an authenticated human who creates an approval request. The creator owns that request. An owner may view, edit, submit, or cancel their request within the state limits below. A **Reviewer** is an authenticated human with the review capability. A reviewer may view requests relevant to review and decide a submitted request they do not own. These are overlapping capabilities, not mutually exclusive roles: a user may own requests and possess review capability, but can never approve or reject their own request.

## Identity and authorization boundary

Every business operation requires an authenticated human principal; there are no anonymous or machine/service operations for this feature. Authentication uses a provider-agnostic OIDC/OAuth 2.0 bearer access-token boundary. The trusted authentication boundary validates the token, including expiration, and supplies a provider-independent principal and capabilities to application code. Application and domain code must not depend on provider-specific claims or identity types. The API does not maintain passwords, refresh tokens, login flows, or its own session store. A concrete identity provider and its session, refresh, and revocation behavior have not been selected; provider provisioning and configuration remain conditional under [H-07](../human-actions.md#h-07).

The following is the feature's authorization policy. Owner checks use the request's trusted creator identity, not a caller-supplied owner field. The review capability must come from trusted authorization context, not a client assertion. No tenant, organization, or workspace boundary exists in this reference feature, and there is no administrative or superuser business-authorization override. General enforcement rules remain in [authentication](../security/authentication.md) and [authorization](../security/authorization.md).

| Operation | Authorized principal and resource scope |
| --- | --- |
| Create | Any authenticated human; the creator becomes the owner. |
| Get/list | An owner may view their own requests. A principal with review capability may view requests relevant to review. Results must be limited to authorized requests; the initial reviewable scope is specified in the [implementation conventions](approval-request-implementation.md#read-and-list-contracts). |
| Edit draft, submit, cancel | The request owner only, subject to the state rules below. |
| Approve, reject | A principal with review capability who is **not** the request owner, subject to the state and rejection-reason rules below. |

Authorization and domain validity are both required. A principal cannot gain a forbidden action because the request happens to be in a valid state, nor gain an invalid transition because they own the request or have review capability. The implementation must avoid leaking unauthorized request details; the [implemented failure mappings](approval-request-implementation.md#api-failures-and-canonical-metadata) define the response semantics.

## Use cases and invariants

| Use case | Business result |
| --- | --- |
| Create | Create a request in `DRAFT`. |
| Edit draft | Change a request only while it is `DRAFT`. |
| Get and list | Read authorized requests without changing their state. |
| Submit | Move a `DRAFT` request to `SUBMITTED`. |
| Approve | Move a `SUBMITTED` request to `APPROVED`. |
| Reject | Move a `SUBMITTED` request to `REJECTED` with a required reason. |
| Cancel | A Requester moves a `DRAFT` or `SUBMITTED` request to `CANCELLED`. |

- A request has exactly one of the five states below. `APPROVED`, `REJECTED`, and `CANCELLED` are terminal: no later edit or state transition is valid.
- State changes and draft edits must be conditional on the current state. A stale or concurrent operation must report a conflict instead of silently overwriting newer state. The winning state and any required rejection reason remain consistent.
- Repeated or competing operations must not create inconsistent effects. The [implementation conventions](approval-request-implementation.md#mutations-concurrency-and-transactions) define safe create replay and version-conflict behavior for later mutations. One request must not acquire multiple terminal outcomes.
- Read operations do not mutate a request. Owner and reviewer visibility follows the authorization policy above; self-review is prohibited even when a user holds both capabilities.

## State transitions

| Operation | Valid source | Result |
| --- | --- | --- |
| Create | No existing request | `DRAFT` |
| Edit draft | `DRAFT` | `DRAFT`, with edited draft data |
| Submit | `DRAFT` | `SUBMITTED` |
| Approve | `SUBMITTED` | `APPROVED` |
| Reject, with reason | `SUBMITTED` | `REJECTED` |
| Cancel | `DRAFT` or `SUBMITTED` | `CANCELLED` |

All other state-changing combinations are invalid. In particular, an edit or submission after leaving `DRAFT`, an approval or rejection before submission, and any edit or transition from a terminal state must fail without changing the request. `get` and `list` have no state transition.

## Expected business failures

| Condition | Expected outcome |
| --- | --- |
| Requested item does not exist | Report that the request was not found; do not create or change one implicitly. |
| Action is invalid for the current state or the state is terminal | Reject the action and preserve the current state. |
| Reject has no usable reason | Reject the action and leave the request `SUBMITTED`. The [current contract](approval-request-implementation.md#current-contract) defines the reason format and bounds. |
| A stale edit or transition loses a race to another write | Report a conflict and preserve the winning write; do not silently overwrite it. |
| A duplicate or competing action arrives | Preserve one consistent result and report a safe replay or conflict as appropriate; do not apply a second inconsistent outcome. |

Authentication failure, insufficient review capability, non-ownership for owner operations, and attempted self-review are expected denials. They must leave the request unchanged. The [implementation conventions](approval-request-implementation.md#api-failures-and-canonical-metadata) explain the transport mappings; [executable contracts](../../apps/api/src/features/approval-requests/contracts.ts) and the [generated error registry](../generated/api/errors.md) provide current wire details.

## Data ownership, classification, and lifecycle

Approval Request owns its creator identity, request state, and, when rejected, the rejection reason as business data. The creator identity establishes ownership and must remain associated with the request. Feature-level identifier, clock, schema, and transaction conventions are in the [implementation design](approval-request-implementation.md); the editable fields and limits are in its [current contract section](approval-request-implementation.md#current-contract) and the executable TypeBox contracts. Access follows the policy above; there is no tenant scope.

The owner classifies the intended feature data as ordinary **internal application data**. No secrets, credentials, financial, medical, or other specially sensitive data are intentionally part of this feature. Treat request content and rejection reasons as untrusted input and apply the [data-classification policy](../security/data-classification.md); this classification does not authorize public disclosure or unrestricted telemetry capture.

The lifecycle is creation as `DRAFT`, possible edit and submission, then a terminal decision or cancellation. PostgreSQL provides durable persistence. The owner has defined no legal retention duration, automatic deletion requirement, or authoritative business-audit persistence requirement at this stage. This is not an indefinite-retention decision: applicable retention and disposal rules must be defined before production use under the [data-retention policy](../security/data-retention.md). Ordinary diagnostic logging does not become an authoritative business audit trail.

## Side-effect boundary

Creating or changing a request affects its durable internal PostgreSQL business data. The reference feature has no external side effects or integrations by default: it does not require notifications, webhooks, messaging, external audit delivery, or a payment-like effect. Any later integration or authoritative audit requirement needs a separately recorded decision and corresponding consistency design under [delivery and side effects](../architecture/delivery-and-side-effects.md).

## Acceptance scenarios

1. An authenticated human creates a request and becomes its owner; the request is `DRAFT`. Getting or listing authorized requests reads without changing state. An anonymous caller cannot create, read, list, or perform any other business operation.
2. Editing a current `DRAFT` changes its draft data and leaves it `DRAFT`. Editing after submit or after a terminal outcome fails without changing it.
3. Submitting a current `DRAFT` yields `SUBMITTED`. Repeating submission after that transition cannot create a second transition or overwrite a later outcome.
4. Approving a `SUBMITTED` request yields `APPROVED`; rejecting a `SUBMITTED` request with a reason yields `REJECTED` with that reason. Approving or rejecting a `DRAFT`, or acting after a terminal outcome, fails without mutation.
5. Rejecting a `SUBMITTED` request without a usable reason fails and leaves it `SUBMITTED`.
6. The owner can cancel a `DRAFT` or `SUBMITTED` request, yielding `CANCELLED`; cancellation after a terminal outcome fails without mutation.
7. If a draft edit races with submission, a stale edit cannot restore or overwrite the newly `SUBMITTED` request; the stale operation reports a conflict.
8. If approval, rejection, and/or cancellation race on a `SUBMITTED` request, exactly one valid terminal outcome persists. Losing operations report conflicts or safe replays and cannot replace that outcome or attach a conflicting rejection reason.
9. A write based on a stale version or previously observed state fails visibly when the request has since changed, including a stale edit against a newer draft revision. The newer data remains intact.
10. Repeating a successful operation cannot duplicate or contradict its business effect. No scenario expects an external integration or authoritative audit record.
11. An owner can get and list their own requests. A non-owner without review capability cannot view, edit, submit, or cancel that request. A non-owner with review capability may view it only when relevant to review, but cannot perform owner operations.
12. A reviewer with review capability may approve or reject another owner's `SUBMITTED` request. A principal without review capability cannot decide it, even if the principal owns it or the request is `SUBMITTED`.
13. A reviewer cannot approve or reject their own request, including when they also hold review capability. There is no administrative override. The request remains unchanged.
14. An authorized owner attempting to edit or submit a non-`DRAFT` request, or cancel a terminal request, is denied by the state rule. A reviewer with review capability attempting to decide another owner's `DRAFT` or terminal request is denied by the state rule. An unauthorized principal remains denied regardless of state. Neither kind of denial mutates the request.
15. Authorization tests use synthetic principals, creator identities, and capabilities; they do not require real external accounts or a selected identity provider.

Vitest tests exercise state, concurrency, authorization, failure recovery, and persistence against migrated PostgreSQL. Browser journeys cover the owner/reviewer workflow and a stale mutation through the actual API. These scenarios remain the business source for the tests; [implementation conventions](approval-request-implementation.md#failure-recovery-and-retry-ownership) record the verified retry and recovery boundaries.
