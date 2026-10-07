-- Additive: the sales source the person selected in the interface for each
-- turn. Turns written before the selector used only Sankhya, so the constant
-- default backfills them without a table rewrite (PostgreSQL 11+) and keeps an
-- older application that does not write the column correct during a rollout.
-- The check validates existing rows once; agent_turns is small in every
-- current environment.
BEGIN;
ALTER TABLE "agent_turns"
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'sankhya',
  ADD CONSTRAINT "agent_turns_source_check" CHECK (source IN ('sankhya', 'vrmaster', 'all'));
COMMIT;
