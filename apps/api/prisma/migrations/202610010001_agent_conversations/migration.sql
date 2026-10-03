-- Additive application persistence. No ERP changes. Old application versions ignore these tables.
BEGIN;
CREATE TABLE "agent_conversations" (
  "id" UUID NOT NULL,
  "owner" VARCHAR(300) NOT NULL,
  "title" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "contexts" JSONB NOT NULL DEFAULT '{}',
  "active_turn_id" UUID,
  "lease_until" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_conversations_version_check" CHECK (version >= 0),
  CONSTRAINT "agent_conversations_lease_check" CHECK ((active_turn_id IS NULL) = (lease_until IS NULL)),
  CONSTRAINT "agent_conversations_contexts_check" CHECK (jsonb_typeof(contexts) = 'object'),
  CONSTRAINT "agent_conversations_owner_check" CHECK (length(owner) > 0)
);
CREATE TABLE "agent_turns" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "request_id" UUID NOT NULL,
  "state" VARCHAR(20) NOT NULL,
  "question" VARCHAR(2000) NOT NULL,
  "reply" JSONB,
  "events" JSONB NOT NULL DEFAULT '[]',
  "capability_id" VARCHAR(80),
  "failure_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "agent_turns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_turns_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_turns_sequence_check" CHECK (sequence > 0),
  CONSTRAINT "agent_turns_question_check" CHECK (length(btrim(question)) > 0),
  CONSTRAINT "agent_turns_events_check" CHECK (jsonb_typeof(events) = 'array'),
  CONSTRAINT "agent_turns_state_check" CHECK (state IN ('running', 'completed', 'failed', 'interrupted')),
  CONSTRAINT "agent_turns_outcome_check" CHECK (
    (state = 'running' AND reply IS NULL AND failure_code IS NULL AND finished_at IS NULL) OR
    (state = 'completed' AND reply IS NOT NULL AND failure_code IS NULL AND finished_at IS NOT NULL) OR
    (state IN ('failed', 'interrupted') AND reply IS NULL AND failure_code IS NOT NULL AND finished_at IS NOT NULL)
  )
);
CREATE INDEX "agent_conversations_owner_updated_idx" ON "agent_conversations"("owner", "updated_at", "id");
CREATE UNIQUE INDEX "agent_turns_conversation_sequence_key" ON "agent_turns"("conversation_id", "sequence");
CREATE UNIQUE INDEX "agent_turns_conversation_request_key" ON "agent_turns"("conversation_id", "request_id");
COMMIT;
