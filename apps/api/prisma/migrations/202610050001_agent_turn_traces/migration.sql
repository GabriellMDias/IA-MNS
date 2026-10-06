-- Additive, optional AI trace persistence owned by the agent module. Rows are
-- written only at the explicit content trace level; old application versions
-- ignore this table. Turn and conversation deletion cascade to their traces.
BEGIN;
CREATE TABLE "agent_turn_traces" (
  "turn_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trace" JSONB NOT NULL,
  CONSTRAINT "agent_turn_traces_pkey" PRIMARY KEY ("turn_id"),
  CONSTRAINT "agent_turn_traces_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "agent_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_turn_traces_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_turn_traces_trace_check" CHECK (jsonb_typeof(trace) = 'object')
);
CREATE INDEX "agent_turn_traces_conversation_idx" ON "agent_turn_traces"("conversation_id");
COMMIT;
