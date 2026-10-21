-- Additive: the channel through which a conversation was started (web or
-- WhatsApp). Every existing conversation came from the web surfaces, so the
-- constant default backfills them without a table rewrite (PostgreSQL 11+)
-- and keeps an older application that does not write the column correct
-- during a rollout. The check validates existing rows once.
BEGIN;
ALTER TABLE "agent_conversations"
  ADD COLUMN "channel" VARCHAR(16) NOT NULL DEFAULT 'web',
  ADD CONSTRAINT "agent_conversations_channel_check" CHECK (channel IN ('web', 'whatsapp'));
COMMIT;
