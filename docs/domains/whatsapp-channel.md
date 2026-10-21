# IA-MNS WhatsApp Channel

[ADR-0036](../adr/0036-add-whatsapp-as-an-agent-channel-authorized-by-owner-linked-numbers.md) · [Identity](identity.md#whatsapp-numbers) · [Corporate agent](corporate-agent.md) · [Activation and rollback runbook](../runbooks/whatsapp-channel.md) · [Setup](../setup.md#whatsapp-simulator) · [Human actions](../project/human-actions.md#ph-32)

## Purpose and scope

WhatsApp is the fourth way to reach IA-MNS, beside the direct web application, Sankhya and PDT Connect. It is another entry point to the **same** corporate agent: the same Person, conversations, capabilities, Semantic Product Resolver, sales sources, history, context and permissions. The channel owns no business capability and no business rule; it adapts Meta's WhatsApp Business Platform Cloud API to the agent.

It uses the official Cloud API directly with Meta, on a dedicated corporate number operated only through the API (no WhatsApp Business App coexistence, no migration, no human attendance in the app, no intermediary provider). This version is reactive and text-only: it answers messages received from authorized people and never starts a conversation.

## Authorization

A WhatsApp number linked by an owner to a Person ([identity](identity.md#whatsapp-numbers)) is the channel's only authorization. There is no self-service: no sign-up through WhatsApp, link codes, activation codes or association links, and a Person cannot set or change their own number.

Every message goes through these steps, in order; if any fails, the agent is not invoked and no business data is read:

1. **Authenticity.** The webhook verifies `X-Hub-Signature-256` (HMAC-SHA256 of the exact request bytes with the Meta app secret) in constant time before parsing. Only changes of the configured phone number ID (and WhatsApp Business Account, when configured) are read; group messages are ignored.
2. **Sender identity.** The sender is what Meta reported in that signed message: the number (`from`) and, since 2026, the business-scoped user ID (`from_user_id`, BSUID).
3. **Administrative link.** The number must equal a linked number exactly, or its deterministic legacy Brazilian form (see [identifiers](#identifiers)).
4. **Exactly one Person.** Database uniqueness makes a second match impossible; any ambiguity is refused.
5. **Active Person.** Disabled and consolidated (`merged`) Persons are refused.
6. **Effective permissions.** Identity computes them from trusted state for this message, exactly as it would for a new access token (personal grants, group grants, owner role; no automatic membership is created by a message).
7. Only then does the message reach the agent, which applies its own capability permission checks, ERP source isolation and runtime credential limits as on the web.
8. **Before each reply part is sent**, steps 2–6 are repeated against the same Person and link version. Answers must still pass the agent's `canReadReply` check, including source permissions, recorded data scope and every retained evidence dependency.

Unknown, unlinked or refused senders are ignored silently: the webhook answers Meta with 200, nothing is stored and nothing is sent, so the channel never reveals whether a number or Person exists. Only a reason counter (`ia_mns.whatsapp.refused`, reason `unknown`, `ambiguous`, `conflict`, `inactive` or `channel_disabled`) and a content-free webhook summary are recorded.

Authorization is decided again at receipt, before processing, after the agent answers and before every reply part. Removing or changing a number, disabling the Person, consolidating it, or turning the channel off stops queued replies at their next authorization check, including answers being prepared. The answer remains in the Person's own conversation history; it is simply not delivered. Changes to permissions or data restrictions also apply after computation and before every answer part or retry, rather than waiting for another inbound message. An external send already started cannot be recalled.

Queued parts retain their original conversation and turn reference through the inbox. The agent reloads that Person-owned turn and applies the same evidence checks as the web; missing turns, deleted conversations and invalidated evidence fail closed. This retains the original server-authored permissions and scopes across restarts without copying business payloads into another authorization store. Notices contain no business answer and still require the current link and enabled channel.

Link versions are allocated under the Person lock from a persistent counter on the Person. Unlinking does not reset it; recreating the same number starts a later generation and cannot resume old inbox or outbox work. Migration `202610210002_identity_whatsapp_link_generations` initializes counters from existing links and the highest generations still retained in either queue. Deploy the migration before this runtime; older runtimes do not maintain the counter. Mixed WhatsApp worker versions are unsupported; disable the channel before rolling back to an older runtime and keep it disabled there.

## Identifiers

- **Numbers** are entered by owners in international form (`+55 11 98765-4321`, or with `00`) and stored as E.164 digits. National numbers are never completed with an assumed country code.
- **Brazilian mobiles and the ninth digit.** WhatsApp still reports many Brazilian mobile accounts under the pre-2016 eight-digit subscriber number (`551187654321` for `+55 11 98765-4321`). Under the current national plan an eight-digit subscriber number starting with 6–9 can only be that legacy form of a mobile (landlines start with 2–5), so the link stores it as an explicit alias that participates in the uniqueness constraint. No other transformation exists: a mobile written without the ninth digit is refused at entry, a subscriber range where the legacy form would look like a landline (`9 2xxx…` to `9 5xxx…`) receives no alias, and anything that matches neither the number nor its alias is unknown. Replies always go to the identifier Meta reported, never to a constructed number.
- **Business-scoped user IDs (BSUID).** Meta added `from_user_id`/`user_id` to webhooks in 2026 and lets people with usernames hide their number. When a signed message carries both the linked number and a BSUID, the link records that BSUID. Later messages that omit the number match the recorded BSUID; a message whose number matches a link but whose BSUID differs from the recorded one is refused as a conflict (for example a recycled number now used by another WhatsApp account). Changing the number forgets the recorded BSUID. A BSUID never matches a link by itself unless it was learned that way, and replies to a sender without a number use the `recipient` field with the BSUID.

## Processing

```text
Meta ──signed webhook──▶ /whatsapp/webhook ──authorize──▶ whatsapp_inbound_messages (pending)
                                                                  │ claim in send order per Person
                                                                  ▼
                       identity (authorize again) ──▶ commands or agent.ask(turn) ──▶ format
                                                                  │ authorize again
                                                                  ▼
            Graph API ◀──authorize before each part── whatsapp_outbound_messages (pending)
```

- **Durable and asynchronous.** Authorized messages of one notification are recorded in one statement before the webhook is acknowledged, so a database failure makes Meta deliver again. The webhook never waits for ERP or AI work. In-process workers (two message workers and one sender) claim work from PostgreSQL with transaction-locked claims and leases, which is safe across processes; the single production host runs one process.
- **Deduplication.** The Meta message id is unique: Meta's repeated deliveries record nothing. The inbound id is the agent turn request id, so a retried or recovered message replays the same turn instead of asking twice.
- **Ordering.** Each Person's messages are processed one at a time in the order they were sent (Meta timestamp, then arrival), after a one-second reorder window that absorbs notifications delivered slightly out of order; reply parts are sent in the same order.
- **Conversation.** A message continues the Person's current WhatsApp conversation while it still exists, is not archived and had activity in the last 12 hours; otherwise a new conversation (channel `whatsapp`) starts. `/nova` starts one explicitly. Conversations of different channels are never merged.
- **Agent.** The message becomes an ordinary agent turn with the sales source the Person chose for WhatsApp. The turn shares the web's concurrency limit, deadline, lease recovery, progress, traces and failure codes. If another turn of the same conversation is running (for example from the web), the message waits.
- **Bounded retries.** A failed processing attempt is retried with backoff up to three attempts, then the person receives a short failure notice.
- **Shutdown.** Workers stop claiming before the agent closes (`preClose`) and release unfinished work for the next start; an interrupted agent turn is reported as interrupted.
- **Idle waits.** A worker removes its wake-up callback on timeout or explicit wake-up. Only current waits are retained, including while the channel is disabled.

## Sending, delivery and the service window

Replies are sent with the Graph API `/{phone-number-id}/messages` text endpoint (version from `WHATSAPP_GRAPH_API_VERSION`, default `v25.0`), with link previews off. When processing starts, the received message is marked as read with the typing indicator (best effort).

A WhatsApp message cannot be recalled and Meta offers no idempotency key, so a part is retried only when Meta proves it did not accept it: HTTP 429, throughput and pair-rate errors (`130429`, `131056`, `80007`, `4`), temporary unavailability (`131016`, `1`, `2`) or a connection that never opened; up to five attempts with backoff or `Retry-After`. A timeout, lost response or unexpected server error becomes `unknown` and is never resent; a send claim that expires (process stopped mid-send) also becomes `unknown`. Permanent refusals (for example `131047`, outside the 24-hour window, or `190`, invalid token, which also logs `whatsapp_access_token_rejected`) become `failed`.

Signed status webhooks move a part forward only (`accepted` → `sent` → `delivered` → `read`; `failed` never replaces a delivery or read). Replies are sent only inside Meta's 24-hour customer service window, measured from the message they answer (with a ten-minute margin); later parts become `expired`. No template or proactive message is sent.

## Conversation experience

- Text only. Media, locations, reactions and other types receive "Por enquanto entendo apenas mensagens de texto." Messages longer than 2,000 characters (the agent's question limit) receive a short request to shorten them.
- Replies contain the agent's prose followed by its result, as the web would show it: one block per ERP source headed _Fonte: …_ with exact currency formatting and units, never summed across sources; up to 25 table lines and 20 products, then a pointer to the same conversation on the web; product options as a numbered list to answer by number or name; and the agent's suggestions. Texts are split at paragraph, line or word boundaries into at most six messages under WhatsApp's 4,096-character limit.
- Commands start with `/` so questions are never taken as commands: `/fonte sankhya|vrmaster|tudo` chooses the sales source (the channel's equivalent of the web `Fonte` selector, never inferred from a question; default `MNS (Sankhya)`), `/nova` starts a new conversation and `/ajuda` explains both.
- Follow-up questions ("E no mês passado?"), pending clarifications, ambiguity resolution and the Semantic Product Resolver work as on the web because the agent keeps the same structured context per conversation.

## History on the web

WhatsApp conversations belong to the Person and appear in the web history with a `WA` mark (`channel: "whatsapp"` in the API). They can be read, searched, renamed, pinned, archived and continued on the web like any other conversation; archiving or deleting one makes the next WhatsApp message start a new conversation. Messages typed on the web are not sent to WhatsApp.

## Limits, costs and switches

| Control                    | Value                                                                                                                                        | Behavior                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Channel switch             | **Administração → Parâmetros → Atendimento pelo WhatsApp** (`channels.whatsapp`, installation default `IA_MNS_WHATSAPP_CHANNEL`, `disabled`) | Off: webhooks are acknowledged without storing or answering anything; queued messages are ignored and queued replies revoked. Takes effect on the next message without a restart. |
| Per-Person burst           | 15 agent turns per 10 minutes                                                                                                                | Further messages are ignored; one notice per window.                                                                                                                              |
| Per-Person daily           | 200 agent turns per 24 hours                                                                                                                 | Same.                                                                                                                                                                             |
| Installation daily ceiling | `WHATSAPP_DAILY_LIMIT` (default 500) agent turns per São Paulo day                                                                           | Further messages that day are ignored; one notice per Person.                                                                                                                     |
| Webhook                    | 600 requests/min per source address, 2 MB body                                                                                               | Resource protection.                                                                                                                                                              |

Commands, notices and refused senders do not count as agent turns. Meta charges per its current pricing model; service (reply) conversations inside the customer service window are the only kind this version uses.

## Data and retention

`whatsapp_inbound_messages`, `whatsapp_outbound_messages` and `whatsapp_threads` are owned by the `whatsapp` module ([schema reference](../generated/database/schema.md)). Message and reply texts are kept only until processed or accepted by Meta, because the questions and answers live in the agent conversation; identifiers, states and outcome codes remain for 30 days for deduplication, delivery tracking and audit, then are pruned hourly. This period is provisional until the shared retention decision in [PH-09](../project/human-actions.md#ph-09). Link changes are in `identity_audit_events`; the agent turn records each question and answer under the Person.

Answers containing business data leave IA-MNS through Meta's infrastructure and are stored on the person's device. Owners must approve this processing boundary before activation ([PH-35](../project/human-actions.md#ph-35)); the [AI data processing](../security/ai-data-processing.md) policy still governs what the agent may send to the model.

## Observability

Logs (allowlisted fields only, never message text, numbers, tokens or payloads): `whatsapp_webhook_received` (recorded, refused, duplicate, status and ignored counts), `whatsapp_message_processed` (inbound id, outcome, attempts, duration), `whatsapp_reply_settled` (part, attempt, outcome, Meta code, latency), `whatsapp_reply_outcome_unknown`, `whatsapp_access_token_rejected`, `whatsapp_signature_refused`, `whatsapp_verification_*`, `whatsapp_processing_failed` and `whatsapp_worker_failed`. Agent failures use the shared `agent_execution_failed` diagnostic. Metrics: `ia_mns.whatsapp.inbound` (by outcome), `ia_mns.whatsapp.outbound` (by outcome), `ia_mns.whatsapp.refused` (by reason) and `ia_mns.whatsapp.processing.duration` (seconds from sending to the reply being queued). Consumption is visible through inbound outcomes and the daily ceiling.

## Security notes and residual risks

- **The number is a credential.** Anyone holding the phone, an unlocked WhatsApp session (including WhatsApp Web or a linked device) or a SIM-swapped line acts as that Person with that Person's capabilities. Owners should link only corporate-controlled or personally accountable numbers, remove the link as soon as a line is lost, transferred, returned or recycled, and prefer narrow grants for people who use WhatsApp. Operators may reassign numbers after disuse; Meta's BSUID conflict check detects a new WhatsApp account on a linked number only after the link had recorded the previous account's BSUID.
- **No step-up authentication.** Every current capability is read-only (sales and product consultation); administration is not reachable through the agent. WhatsApp offers no second factor IA-MNS could verify, so no new authentication flow was built. A future sensitive or write capability must not be exposed through this channel without a new decision (for example an explicit web confirmation).
- **Owners** who link their own number expose every catalog permission to that phone; link one only when needed.
- Messages and answers are visible to Meta as the platform operator and remain on the person's device beyond IA-MNS's control; deleting a conversation in IA-MNS does not delete WhatsApp messages.
- Meta does not sign the verification GET; it only compares the verify token, which is a secret in configuration.

## Configuration

`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` enable the module together and require the database and IA-MNS identity; `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_GRAPH_BASE_URL`, `WHATSAPP_GRAPH_API_VERSION` and `WHATSAPP_DAILY_LIMIT` refine it ([configuration reference](../generated/configuration/api.md)). Without them the module adds no route. The webhook is `GET`/`POST /whatsapp/webhook`, which the production origin serves as `https://<ia-mns>/api/whatsapp/webhook`.

## Verification

Synthetic tests on migrated PostgreSQL with the restricted runtime role exercise the real identity service, the real `CorporateAgent` and sales capability with scripted interpretation and synthetic ERP readers, and a synthetic Graph API (`apps/api/test/whatsapp.test.ts`): owner-only number administration (refused for others), validation, the ninth digit and uniqueness; audit; verification and signatures; silent refusal of unknown, conflicting, disabled and switched-off senders; legacy-identifier and BSUID matching; deduplication; ordering of out-of-order deliveries; context continuity ("E no mês passado?" keeps the product); source selection; permission enforcement; revocation while an answer is being prepared; delivery statuses; retries and unknown outcomes; and consolidation. Unit tests cover normalization, signatures, payload parsing, commands, formatting, the Graph client's outcome classification and configuration (`whatsapp-units.test.ts`); a browser journey covers the administration field. These are not evidence of a real Meta delivery: the definitive number, Meta account and production activation are [PH-32 to PH-35](../project/human-actions.md#ph-32).

## Limits and next steps

- Audio, transcription, documents and reports are not implemented. The design leaves room for them: an inbound kind besides `text`, a media download step before the agent, and outbound kinds besides text parts.
- No proactive or template messages, and no reply after the 24-hour window.
- Messages typed on the web in a WhatsApp conversation are not mirrored to WhatsApp.
- Multi-replica deployments work with the database claims but have process-local webhook rate limits ([request protection](../../apps/api/README.md#request-protection)).
