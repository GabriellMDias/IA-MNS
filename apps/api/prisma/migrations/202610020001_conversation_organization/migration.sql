-- Forward-only additive upgrade: retain all existing history and contexts.
ALTER TABLE agent_conversations
  ADD COLUMN title_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX agent_conversations_history_idx
  ON agent_conversations(owner, archived, pinned DESC, updated_at DESC, id DESC);
