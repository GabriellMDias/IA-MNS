# Runbook: WhatsApp Channel Activation, Revocation and Rollback

**Owner:** IA-MNS project owner (Meta Business Portfolio administrator for the Meta steps)
**Status:** draft — the application side (configuration, webhook verification, signatures, authorization, processing, switch and revocation) is exercised by the synthetic tests in `apps/api/test/whatsapp.test.ts` and the local simulator; no step has run against Meta or the production host yet
**Environment / applicability:** a production host prepared by [host setup and first deployment](production-host-setup-and-first-deployment.md), with IA-MNS identity configured and an active owner
**Related alerts:** none yet; see [observability](../domains/whatsapp-channel.md#observability)
**Required access:** Meta Business Portfolio administrator; an attributable sudo account on the host; an IA-MNS owner session with the second factor

Follow [production access](../security/production-access.md), [secrets](../security/secrets-management.md) and [incident response](../security/incident-response.md). The [WhatsApp channel domain](../domains/whatsapp-channel.md) owns behavior; [ADR-0036](../adr/0036-add-whatsapp-as-an-agent-channel-authorized-by-owner-linked-numbers.md) owns the decision. Meta's dashboard changes over time: follow its current wording, and stop if a step no longer matches the [Cloud API documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/).

## Purpose

Turn the WhatsApp channel on with the dedicated number, revoke one person's access at once, and turn the channel off or remove it.

## Trigger / Symptoms

- Activation: [PH-32 to PH-35](../project/human-actions.md#ph-32) are complete.
- Revocation: a linked phone is lost, stolen, transferred, returned, recycled, or the person no longer needs access.
- Rollback: unexpected answers or recipients, Meta account problems, cost above expectation, or a security incident.

## Impact

Activation lets linked people query IA-MNS from WhatsApp with their own permissions; answers with business data transit Meta and stay on their devices. Turning the switch off stops every reply that has not reached Meta; nothing else in IA-MNS changes. Removing the configuration and restarting removes the webhook routes (Meta retries undelivered notifications for up to 36 hours, then drops them).

## Preconditions

1. PH-32 to PH-35 are recorded as complete in [human actions](../project/human-actions.md), including the owner's approval of the Meta processing boundary.
2. `sudo ia-mns-deploy status` is healthy on a release that contains the WhatsApp module (migrations `202610130001` to `202610130004` applied).
3. The public origin answers over HTTPS with a certificate Meta accepts; the webhook URL is `https://<IA_MNS_PUBLIC_ORIGIN host>/api/whatsapp/webhook`.
4. The values are at hand without printing them: phone number ID, WhatsApp Business Account ID, system-user access token, app secret, and a new verify token (`openssl rand -base64 48 | tr -d '/+=' | cut -c1-48`).

## Diagnosis

- `sudo ia-mns-deploy check-config` names missing or inconsistent WhatsApp keys without showing values (all four of `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`, plus identity and the database).
- Logs: `whatsapp_verification_refused` (verify token mismatch), `whatsapp_signature_refused` (wrong app secret or a forged request), `whatsapp_webhook_received` with `refused` counts (sender not linked, disabled, or switch off), `whatsapp_access_token_rejected` (token expired or revoked), `whatsapp_reply_settled` with `outcome` and Meta `code`.
- **Administração → Pessoas → (person) → WhatsApp** shows the linked number and whether a message from it was ever accepted.

## Mitigation / Procedure

### Activate

1. In `/etc/ia-mns/runtime.env` (`sudo nano`), uncomment and set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. Keep `IA_MNS_WHATSAPP_CHANNEL` unset or `disabled`; optionally lower `WHATSAPP_DAILY_LIMIT` for the first days.
2. `sudo ia-mns-deploy check-config && sudo ia-mns-deploy restart`. Expected: healthy status; `GET /api/whatsapp/webhook` without parameters answers 403 (the route exists).
3. In the Meta app, configure the WhatsApp webhook with the callback URL above and the same verify token, then subscribe to the `messages` field. Expected: Meta reports the verification as successful and the log shows `whatsapp_verification_accepted`.
4. In IA-MNS, **Administração → Pessoas**, link the number of one pilot person (preferably the owner's tester with narrow grants). Use international form; Brazilian mobiles need the ninth digit.
5. In **Administração → Parâmetros → Canais**, set **Atendimento pelo WhatsApp** to **Ligado**.
6. From the pilot phone, send `/ajuda`, then a question such as *quanto vendemos ontem?*.

### Revoke one person

1. **Administração → Pessoas → (person) → WhatsApp → Remover número do WhatsApp → Remover número.** Effective at once, including answers being prepared.
2. If the person must also lose web access, **Desativar** the person (this also refuses WhatsApp) and **Encerrar sessões**.

### Roll back the channel

1. Immediate: set **Atendimento pelo WhatsApp** to **Desligado** (no restart). Webhooks keep being acknowledged; nothing is stored or answered and queued replies are revoked.
2. Complete removal: comment out the five `WHATSAPP_*` values in `runtime.env`, `sudo ia-mns-deploy check-config && sudo ia-mns-deploy restart`, then in the Meta app unsubscribe the webhook (or remove its URL) so Meta stops retrying.
3. Credential exposure: also revoke the system-user token and reset the app secret in Meta, then follow [secret rotation](production-secret-rotation.md) before reactivating.

## Verification

- Activation: the pilot receives the `/ajuda` text and an answer that matches the same question on the web for the same person and source; the conversation appears on the web with the `WA` mark; **Pessoas** shows the first message as received; `whatsapp_reply_settled` shows `accepted` and later status webhooks.
- A number that is not linked receives nothing and the log shows it only as a refused count.
- Revocation: a message from the removed number produces no reply and no inbound row (`refused` increases).
- Rollback: with the switch off, a test message gets no reply; after removing the configuration, `GET /api/whatsapp/webhook` answers 404.

## Rollback / Recovery

Turning the switch back on or restoring the configuration reactivates the channel; links, history and audit are kept. Messages sent while the channel was off are not processed later. A reply recorded as `unknown` is never resent automatically; the answer remains in the person's web history.

## Escalation

Stop and escalate (incident response) if a reply reaches a number that is not linked, if a person receives another person's data, if signatures fail for genuine Meta deliveries after the app secret was verified, or if Meta flags the number or account. Keep the switch off while investigating.

## Follow-Up

Record activation evidence in PJ-48 and the related human actions. Add alerts for `whatsapp_access_token_rejected`, sustained `unknown` or `failed` reply outcomes and the daily ceiling once production telemetry exists.
