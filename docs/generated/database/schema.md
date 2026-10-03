# Database Reference

<!-- Generated from migrated PostgreSQL and apps/api/prisma/metadata. Do not edit. -->

[Schema documentation policy](../../database/schema-documentation.md) · [Database principles](../../database/principles.md)

## agent_conversations

Actor-owned corporate agent conversation with capability-specific validated context and a bounded execution lease.

Owner: agent. Classification: CONFIDENTIAL.

Lifecycle: Local history persists until the owner explicitly deletes the conversation. Conversation deletion cascades to turns and contexts. No automatic expiry is implemented; shared deployment requires an owner-defined retention/backups/provider policy before rollout. No vector, export or replica copies are created by the application.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Public immutable UUID; never authorization. | — | — |
| `owner` | `character varying(300)` | no | — | CONFIDENTIAL | Authenticated principal id or explicit loopback developer identity. | — | — |
| `title` | `character varying(100)` | no | — | CONFIDENTIAL | Owner-editable bounded title, initially derived from the first question; never model instructions. | — | — |
| `version` | `integer` | no | `0` | CONFIDENTIAL | Monotonically allocated turn sequence; advanced under a row lock. | — | — |
| `contexts` | `jsonb` | no | `'{}'::jsonb` | CONFIDENTIAL | Versioned capability contexts keyed by capability id. Sales stores its last validated query and bounded sales questions/clarifications, never financial result prose. No secret credentials. | — | — |
| `active_turn_id` | `uuid` | yes | — | CONFIDENTIAL | Current execution lease holder; absence means no active execution. | Absent in the lifecycle states described in the field meaning. | — |
| `lease_until` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Database-clock lease expiry, 120 seconds after acceptance; absent when inactive. | Absent in the lifecycle states described in the field meaning. | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock creation instant. | — | — |
| `updated_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock last turn or organization change; list ordering, not an audit trail. | — | — |
| `title_manual` | `boolean` | no | `false` | CONFIDENTIAL | Owner explicitly named this conversation; automatic first-turn naming must not replace it. | — | — |
| `pinned` | `boolean` | no | `false` | CONFIDENTIAL | Owner favorite retained across archive/restore; archived favorites are excluded from the active pinned list. | — | — |
| `archived` | `boolean` | no | `false` | CONFIDENTIAL | Hidden from active history without deleting turns or context. Restore before accepting new turns. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `agent_conversations_contexts_check` | `CHECK ((jsonb_typeof(contexts) = 'object'::text))` | Capability context must be a JSON object. |
| `agent_conversations_lease_check` | `CHECK (((active_turn_id IS NULL) = (lease_until IS NULL)))` | Lease holder and expiry exist together. |
| `agent_conversations_owner_check` | `CHECK ((length((owner)::text) > 0))` | Ownership is required. |
| `agent_conversations_pkey` | `PRIMARY KEY (id)` | Immutable conversation identity. |
| `agent_conversations_version_check` | `CHECK ((version >= 0))` | Nonnegative turn allocation. |
| `agent_conversations_history_idx` | `CREATE INDEX agent_conversations_history_idx ON public.agent_conversations USING btree (owner, archived, pinned DESC, updated_at DESC, id DESC)` | Owner-scoped active/archive and favorite-first keyset listing. |
| `agent_conversations_owner_updated_idx` | `CREATE INDEX agent_conversations_owner_updated_idx ON public.agent_conversations USING btree (owner, updated_at, id)` | Bounded owner-scoped keyset history listing. |

## agent_turns

One user message and its execution lifecycle, real progress, and versioned assistant outcome. Failed/interrupted turns retain no fabricated answer.

Owner: agent. Classification: CONFIDENTIAL.

Lifecycle: Local history persists until the owner explicitly deletes the conversation. Conversation deletion cascades to turns and contexts. No automatic expiry is implemented; shared deployment requires an owner-defined retention/backups/provider policy before rollout. No vector, export or replica copies are created by the application.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Immutable turn UUID. | — | — |
| `conversation_id` | `uuid` | no | — | CONFIDENTIAL | Owning conversation; hard deletion cascades to all turns. | — | — |
| `sequence` | `integer` | no | — | CONFIDENTIAL | Positive conversation-local ordering allocated transactionally. | — | — |
| `request_id` | `uuid` | no | — | CONFIDENTIAL | Client UUID for idempotent acceptance replay; same id with different message is a conflict. | — | — |
| `state` | `character varying(20)` | no | — | CONFIDENTIAL | running, completed, failed or interrupted. Interrupted work is not automatically retried. | — | — |
| `question` | `character varying(2000)` | no | — | CONFIDENTIAL | Bounded confidential user message; never logged. | — | — |
| `reply` | `jsonb` | yes | — | CONFIDENTIAL | Version 1 envelope containing application-authored reply and bounded result snapshot. Not current ERP truth and never sent back to OpenAI as financial data. | Absent in the lifecycle states described in the field meaning. | — |
| `events` | `jsonb` | no | `'[]'::jsonb` | CONFIDENTIAL | Bounded ordered real progress events with stage, localized display message and instant; not durable workflow/audit infrastructure. | — | — |
| `capability_id` | `character varying(80)` | yes | — | CONFIDENTIAL | Executed capability for a completed business reply; absent for social/failure turns. | Absent in the lifecycle states described in the field meaning. | — |
| `failure_code` | `character varying(80)` | yes | — | CONFIDENTIAL | Allowlisted public failure code; absent unless failed/interrupted. No exception text. | Absent in the lifecycle states described in the field meaning. | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock acceptance instant. | — | — |
| `finished_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Database-clock terminal outcome instant; absent while running. | Absent in the lifecycle states described in the field meaning. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `agent_turns_conversation_id_fkey` | `FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE` | Conversation ownership/lifecycle referential integrity; cascade on hard deletion. |
| `agent_turns_events_check` | `CHECK ((jsonb_typeof(events) = 'array'::text))` | Progress is an array. |
| `agent_turns_outcome_check` | `CHECK (((((state)::text = 'running'::text) AND (reply IS NULL) AND (failure_code IS NULL) AND (finished_at IS NULL)) OR (((state)::text = 'completed'::text) AND (reply IS NOT NULL) AND (failure_code IS NULL) AND (finished_at IS NOT NULL)) OR (((state)::text = ANY ((ARRAY['failed'::character varying, 'interrupted'::character varying])::text[])) AND (reply IS NULL) AND (failure_code IS NOT NULL) AND (finished_at IS NOT NULL))))` | Terminal reply/failure and timestamp agree with lifecycle state. |
| `agent_turns_pkey` | `PRIMARY KEY (id)` | Immutable turn identity. |
| `agent_turns_question_check` | `CHECK ((length(btrim((question)::text)) > 0))` | Nonblank user message. |
| `agent_turns_sequence_check` | `CHECK ((sequence > 0))` | Positive order. |
| `agent_turns_state_check` | `CHECK (((state)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'interrupted'::character varying])::text[])))` | Explicit supported lifecycle states. |
| `agent_turns_conversation_request_key` | `CREATE UNIQUE INDEX agent_turns_conversation_request_key ON public.agent_turns USING btree (conversation_id, request_id)` | One acceptance per client request id in a conversation. |
| `agent_turns_conversation_sequence_key` | `CREATE UNIQUE INDEX agent_turns_conversation_sequence_key ON public.agent_turns USING btree (conversation_id, sequence)` | One turn per allocated sequence. |
