-- Additive: durable work of the WhatsApp channel. Inbound messages from
-- authorized senders are recorded once by Meta message id before the webhook
-- is acknowledged, then processed in order per Person; replies are an outbox
-- sent after a fresh authorization check. Unauthorized senders are never
-- recorded. The tables start empty; an older application ignores them.
BEGIN;
CREATE TABLE "whatsapp_inbound_messages" (
  "id" UUID NOT NULL,
  "message_id" VARCHAR(256) NOT NULL,
  "person_id" UUID NOT NULL,
  "link_version" INTEGER NOT NULL,
  "sender_phone" VARCHAR(15),
  "sender_user_id" VARCHAR(140),
  "kind" VARCHAR(16) NOT NULL,
  "body" VARCHAR(4096),
  "sent_at" TIMESTAMPTZ(3) NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "outcome" VARCHAR(40),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "not_before" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "conversation_id" UUID,
  "turn_id" UUID,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "whatsapp_inbound_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_inbound_messages_sender_check" CHECK (sender_phone IS NOT NULL OR sender_user_id IS NOT NULL),
  CONSTRAINT "whatsapp_inbound_messages_kind_check" CHECK (kind IN ('text', 'unsupported')),
  CONSTRAINT "whatsapp_inbound_messages_state_check" CHECK (state IN ('pending', 'processing', 'completed', 'ignored', 'failed')),
  CONSTRAINT "whatsapp_inbound_messages_attempts_check" CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX "whatsapp_inbound_messages_message_key" ON "whatsapp_inbound_messages"("message_id");
CREATE INDEX "whatsapp_inbound_messages_work_idx" ON "whatsapp_inbound_messages"("state", "not_before");
CREATE INDEX "whatsapp_inbound_messages_person_idx" ON "whatsapp_inbound_messages"("person_id", "sent_at", "received_at");
CREATE INDEX "whatsapp_inbound_messages_received_idx" ON "whatsapp_inbound_messages"("received_at");

CREATE TABLE "whatsapp_outbound_messages" (
  "id" UUID NOT NULL,
  "inbound_id" UUID NOT NULL,
  "part" INTEGER NOT NULL,
  "person_id" UUID NOT NULL,
  "link_version" INTEGER NOT NULL,
  "recipient_phone" VARCHAR(15),
  "recipient_user_id" VARCHAR(140),
  "kind" VARCHAR(16) NOT NULL,
  "body" VARCHAR(4096),
  "state" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "not_before" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "provider_message_id" VARCHAR(256),
  "failure_code" VARCHAR(40),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_outbound_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_outbound_messages_inbound_id_fkey" FOREIGN KEY ("inbound_id") REFERENCES "whatsapp_inbound_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_outbound_messages_recipient_check" CHECK (recipient_phone IS NOT NULL OR recipient_user_id IS NOT NULL),
  CONSTRAINT "whatsapp_outbound_messages_kind_check" CHECK (kind IN ('answer', 'notice')),
  CONSTRAINT "whatsapp_outbound_messages_state_check" CHECK (state IN ('pending', 'sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown', 'revoked', 'expired')),
  CONSTRAINT "whatsapp_outbound_messages_part_check" CHECK (part >= 1 AND part <= 20),
  CONSTRAINT "whatsapp_outbound_messages_attempts_check" CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX "whatsapp_outbound_messages_provider_key" ON "whatsapp_outbound_messages"("provider_message_id");
CREATE UNIQUE INDEX "whatsapp_outbound_messages_part_key" ON "whatsapp_outbound_messages"("inbound_id", "part");
CREATE INDEX "whatsapp_outbound_messages_work_idx" ON "whatsapp_outbound_messages"("state", "not_before");

CREATE TABLE "whatsapp_threads" (
  "person_id" UUID NOT NULL,
  "conversation_id" UUID,
  "source" VARCHAR(20) NOT NULL DEFAULT 'sankhya',
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_threads_pkey" PRIMARY KEY ("person_id"),
  CONSTRAINT "whatsapp_threads_source_check" CHECK (source IN ('sankhya', 'vrmaster', 'all'))
);
COMMIT;
