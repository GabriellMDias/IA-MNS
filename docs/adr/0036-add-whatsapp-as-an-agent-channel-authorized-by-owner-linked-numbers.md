# ADR-0036: Add WhatsApp as an Agent Channel Authorized by Owner-Linked Numbers

**Status:** proposed
**Date:** 2026-10-13

## Context

The owner asked for WhatsApp as a fourth way to use IA-MNS, beside the direct web application, Sankhya and PDT Connect ([ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md)). The product decisions are fixed: a dedicated corporate number operated only through Meta's official WhatsApp Business Platform Cloud API, without coexistence, migration, human attendance or an intermediary provider; access only for people whose number an authenticated owner linked to their IA-MNS account, with no self-service of any kind; the same agent, tools, permissions, history and context; and a reactive, text-first first version.

WhatsApp differs from the existing surfaces in three ways that need an architectural answer. There is no browser and no IA-MNS session: each message arrives as a signed server-to-server webhook from Meta, and the only statement about the sender is the number (and, since 2026, a business-scoped user identifier) that Meta reports. The webhook must be acknowledged quickly while an agent turn can take up to 90 seconds. And a reply is an external effect that cannot be recalled, without an idempotency key, so delivery, retries and revocation must be explicit ([delivery and side effects](../architecture/delivery-and-side-effects.md)).

## Decision

1. **The number is an identity attribute, not a sign-in method.** The identity module owns `identity_whatsapp_links`: at most one number per Person and one Person per number. Only owners set, change or remove it, with the administrative safeguards of [ADR-0025](0025-administer-the-authentication-policy-within-fixed-safeguards.md), and each change is audited in the same transaction. It never opens an IA-MNS session and grants no permission by itself. Matching is exact on E.164 digits plus one deterministic alias (the legacy eight-digit form of a Brazilian mobile, part of the uniqueness rule); a business-scoped user identifier is recorded only when Meta reports it together with the linked number, and a disagreement is refused.
2. **Identity decides authorization per message.** A composition port gives the channel identity's decision for a verified sender: exactly one active Person, the link version, and that Person's effective permissions computed from trusted state as for a token. The channel asks again before processing, after the agent answers and before each reply part, so revocation applies to work already in progress. Unknown or refused senders are ignored silently and never stored.
3. **A separate `whatsapp` module adapts Meta to the existing agent.** It owns the signed webhook, a PostgreSQL inbox and outbox, per-Person ordering, the Graph API client, commands and text formatting. It holds no business capability. The agent module publishes its single `CorporateAgent` at composition, and an agent-owned adapter exposes "continue a channel conversation" and "submit and await a turn" with the same request-id replay, concurrency limit, lease recovery and failure classification as the web. Conversations record their starting channel (`agent_conversations.channel`) as metadata only.
4. **Delivery is durable and conservative.** Authorized messages are recorded before the webhook is acknowledged, deduplicated by Meta message id and processed asynchronously under leases. A reply part is retried only when Meta proves it was not accepted; a timeout or lost response is recorded as an unknown outcome and never resent. Replies stay inside the 24-hour customer service window; nothing is sent proactively.
5. **The channel can be stopped without a deployment.** The `channels.whatsapp` operational parameter ([ADR-0028](0028-administer-operational-parameters-separately-from-secrets-and-bootstrap-configuration.md)) switches processing and sending on or off for the next message; credentials remain secrets in the environment.

## Rationale

Keeping the number inside identity reuses the one place that already decides who a person is, what they may do and how changes are audited; treating it as an external link (`identity_external_identities`) would have made it a sign-in method that the existing flows could unlink, merge and prove, none of which applies. Recomputing permissions per message avoids a parallel session model for a channel without a browser, and repeating the check before every external effect is what makes revocation effective for messages already being answered.

A separate module keeps Meta's specifics (signatures, payload shape, identifiers, Graph errors, service window) out of the agent and identity, matching the module contract, while the published agent instance guarantees one turn lifecycle for every channel instead of a second agent. PostgreSQL already provides the transactional claims, uniqueness and durability the workflow needs; a broker would add infrastructure to the single-host deployment ([ADR-0031](0031-deploy-on-one-ubuntu-host-with-docker-compose-and-a-release-tool.md)) without a requirement that PostgreSQL cannot meet.

The costs are accepted: a phone number is a weaker credential than the existing sign-in methods, the channel adds three tables and background workers to the API process, and conservative delivery may leave a reply undelivered when its outcome is unknown rather than risk sending it twice.

## Alternatives Considered

### Self-service linking (codes or links sent to WhatsApp)

Rejected by the owner: access must be granted only by an administrator. It would also add an enrollment surface to attack.

### Link the number as a third external identity provider

Rejected: external links are proven sign-in methods with their own flows (first access, linking, consolidation offers). A WhatsApp number is never proven to IA-MNS by the person, never signs in, and is managed only by owners.

### A Business Solution Provider or WhatsApp App coexistence

Rejected by the owner unless a technical need is proven; none was found. The Cloud API offers webhooks, signatures and sending directly.

### Synchronous processing inside the webhook

Rejected: agent turns can outlast Meta's delivery expectations, and a crash would lose the message. The inbox records it before acknowledgement.

### A separate agent or WhatsApp-specific business tools

Rejected: it would duplicate capabilities, permissions and context and let the channels drift.

## Consequences

### Positive

- One agent, one permission model and one history across all four ways in; WhatsApp conversations are visible and continuable on the web.
- Revocation (number removal or change, disabled Person, consolidation, switch off) stops replies that were still being prepared.
- No new external service, broker or provider dependency besides Meta.

### Negative

- Possession of a linked phone (or its WhatsApp session) is enough to act as the Person; there is no second factor. Read-only capabilities only; a write or sensitive capability needs a new decision before it can reach this channel.
- Business answers transit Meta and remain on devices outside IA-MNS control.
- An uncertain send is not repeated, so a reply can be lost in a Meta incident; the answer remains in the web history.

### Operational or Migration Impact

- Four additive migrations: the identity links, the conversation channel, the parameter key and the channel tables. Older application versions ignore them.
- Production activation needs Meta account actions, the verified dedicated number, secrets, an HTTPS webhook on the public origin and owner approval of the processing boundary ([PH-32 to PH-35](../project/human-actions.md#ph-32)); the [runbook](../runbooks/whatsapp-channel.md) covers activation and rollback.

## References

- [WhatsApp channel domain](../domains/whatsapp-channel.md)
- [Identity](../domains/identity.md#whatsapp-numbers)
- [Corporate agent](../domains/corporate-agent.md)
- [Delivery and side effects](../architecture/delivery-and-side-effects.md)
- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), [business-scoped user IDs](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/), [webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)
