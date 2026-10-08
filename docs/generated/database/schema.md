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
| `contexts` | `jsonb` | no | `'{}'::jsonb` | CONFIDENTIAL | Versioned capability contexts keyed by capability id. Sales version 2 stores structured conversation state: the last executed analysis plan and query filters, an unanswered request with its known slots and awaited information, and a bounded transcript of sales questions with application-authored clarifications or filter-only answer descriptions, never financial figures or result prose. The _agent entry records the last capability and the capability awaiting an answer. No secret credentials. | — | — |
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
| `request_id` | `uuid` | no | — | CONFIDENTIAL | Client UUID for idempotent acceptance replay; same id with a different message or source is a conflict. | — | — |
| `state` | `character varying(20)` | no | — | CONFIDENTIAL | running, completed, failed or interrupted. Interrupted work is not automatically retried. | — | — |
| `question` | `character varying(2000)` | no | — | CONFIDENTIAL | Bounded confidential user message; never logged. | — | — |
| `reply` | `jsonb` | yes | — | CONFIDENTIAL | Version 2 envelope containing the application-authored reply and a bounded result snapshot with one section per queried sales source; version 1 envelopes (one Sankhya result) are upgraded when read. Not current ERP truth and never sent back to OpenAI as financial data. | Absent in the lifecycle states described in the field meaning. | — |
| `events` | `jsonb` | no | `'[]'::jsonb` | CONFIDENTIAL | Bounded ordered real progress events with stage, localized display message and instant; not durable workflow/audit infrastructure. | — | — |
| `capability_id` | `character varying(80)` | yes | — | CONFIDENTIAL | Executed capability for a completed business reply; absent for social/failure turns. | Absent in the lifecycle states described in the field meaning. | — |
| `failure_code` | `character varying(80)` | yes | — | CONFIDENTIAL | Allowlisted public failure code; absent unless failed/interrupted. No exception text. | Absent in the lifecycle states described in the field meaning. | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock acceptance instant. | — | — |
| `finished_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Database-clock terminal outcome instant; absent while running. | Absent in the lifecycle states described in the field meaning. | — |
| `source` | `character varying(20)` | no | `'sankhya'::character varying` | CONFIDENTIAL | Sales source selected in the interface for this turn: sankhya, vrmaster or all. The message never changes it; a replay with another source is a conflict. Turns written before the selector are sankhya, the only source then. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `agent_turns_conversation_id_fkey` | `FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE` | Conversation ownership/lifecycle referential integrity; cascade on hard deletion. |
| `agent_turns_events_check` | `CHECK ((jsonb_typeof(events) = 'array'::text))` | Progress is an array. |
| `agent_turns_outcome_check` | `CHECK (((((state)::text = 'running'::text) AND (reply IS NULL) AND (failure_code IS NULL) AND (finished_at IS NULL)) OR (((state)::text = 'completed'::text) AND (reply IS NOT NULL) AND (failure_code IS NULL) AND (finished_at IS NOT NULL)) OR (((state)::text = ANY ((ARRAY['failed'::character varying, 'interrupted'::character varying])::text[])) AND (reply IS NULL) AND (failure_code IS NOT NULL) AND (finished_at IS NOT NULL))))` | Terminal reply/failure and timestamp agree with lifecycle state. |
| `agent_turns_pkey` | `PRIMARY KEY (id)` | Immutable turn identity. |
| `agent_turns_question_check` | `CHECK ((length(btrim((question)::text)) > 0))` | Nonblank user message. |
| `agent_turns_sequence_check` | `CHECK ((sequence > 0))` | Positive order. |
| `agent_turns_source_check` | `CHECK (((source)::text = ANY ((ARRAY['sankhya'::character varying, 'vrmaster'::character varying, 'all'::character varying])::text[])))` | Supported sales source selections only. |
| `agent_turns_state_check` | `CHECK (((state)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'interrupted'::character varying])::text[])))` | Explicit supported lifecycle states. |
| `agent_turns_conversation_request_key` | `CREATE UNIQUE INDEX agent_turns_conversation_request_key ON public.agent_turns USING btree (conversation_id, request_id)` | One acceptance per client request id in a conversation. |
| `agent_turns_conversation_sequence_key` | `CREATE UNIQUE INDEX agent_turns_conversation_sequence_key ON public.agent_turns USING btree (conversation_id, sequence)` | One turn per allocated sequence. |

## agent_turn_traces

Optional content-level AI trace of one turn, written only when IA_MNS_AI_TRACE=content: model/prompt identifiers, timings and token counts, routing and interpretation decisions, structured conversation state before and after, and the executed query filters. Never result rows, response prose, credentials or provider payloads. Used to reproduce failures and derive evaluation candidates.

Owner: agent. Classification: CONFIDENTIAL.

Lifecycle: Written in the same transaction as the turn outcome and deleted by cascade with its turn or conversation. The runtime role can only append and read. Content capture is refused in production until the shared-deployment retention and access policy (PH-09) approves it. No automatic expiry is implemented.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `turn_id` | `uuid` | no | — | CONFIDENTIAL | Traced turn; one trace per turn, deleted with it. | — | — |
| `conversation_id` | `uuid` | no | — | CONFIDENTIAL | Owning conversation of the traced turn, for conversation-scoped export and cascade deletion. | — | — |
| `captured_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock instant the trace was stored with the turn outcome. | — | — |
| `trace` | `jsonb` | no | — | CONFIDENTIAL | Version 1 trace object: allowlisted metadata plus confidential interpretation content, bounded to 256 KB with content omitted rather than truncated beyond it. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `agent_turn_traces_conversation_id_fkey` | `FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE` | Conversation deletion removes its traces. |
| `agent_turn_traces_pkey` | `PRIMARY KEY (turn_id)` | One trace per turn. |
| `agent_turn_traces_trace_check` | `CHECK ((jsonb_typeof(trace) = 'object'::text))` | Trace must be a JSON object. |
| `agent_turn_traces_turn_id_fkey` | `FOREIGN KEY (turn_id) REFERENCES agent_turns(id) ON UPDATE CASCADE ON DELETE CASCADE` | Trace lifecycle follows its turn; cascade on deletion. |
| `agent_turn_traces_conversation_idx` | `CREATE INDEX agent_turn_traces_conversation_idx ON public.agent_turn_traces USING btree (conversation_id)` | Conversation-scoped trace export. |

## identity_persons

An IA-MNS Person: the single internal identity that owns conversations, preferences, links, credentials, roles and grants, independent of the surface or method used to sign in.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Persons are never hard-deleted by the application; an owner disables them instead. Shared deployment requires an owner-approved retention policy (PH-09) before rollout.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Stable application principal UUID; issued as the access-token principal and conversation owner. Never derived from a provider identifier. | — | — |
| `display_name` | `character varying(120)` | no | — | CONFIDENTIAL | Person-editable display name; initially copied from the first verified provider profile or chosen at enrollment. Not an identity key. | — | — |
| `status` | `character varying(16)` | no | `'active'::character varying` | CONFIDENTIAL | active, disabled or merged. Disabled and merged Persons cannot authenticate and their sessions are revoked. | — | — |
| `merged_into` | `uuid` | yes | — | CONFIDENTIAL | Person that absorbed this one through a proof-based or owner-approved consolidation; links, local credential, grants and conversations moved there. | Not merged. | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock creation instant. | — | — |
| `updated_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock last profile or status change; informational, not an audit trail. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_persons_display_name_check` | `CHECK ((length(btrim((display_name)::text)) > 0))` | A display name is required. |
| `identity_persons_merge_check` | `CHECK (((((status)::text = 'merged'::text) = (merged_into IS NOT NULL)) AND ((merged_into IS NULL) OR (merged_into <> id))))` | Merged status and target exist together and a Person never merges into itself. |
| `identity_persons_merged_into_fkey` | `FOREIGN KEY (merged_into) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE RESTRICT` | A merged Person points to an existing Person; never deleted while referenced. |
| `identity_persons_pkey` | `PRIMARY KEY (id)` | Immutable Person identity. |
| `identity_persons_status_check` | `CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying, 'merged'::character varying])::text[])))` | Explicit lifecycle states. |
| `identity_persons_display_name_idx` | `CREATE INDEX identity_persons_display_name_idx ON public.identity_persons USING btree (display_name, id)` | Bounded administrative listing ordered by name. |

## identity_external_identities

A link between a Person and one stable external account (PDT Connect identitySubject or Sankhya CODUSU) under a fixed issuer, created from a server-verified proof by the account holder or by an owner selecting the account in the Sankhya directory.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Removed explicitly by the Person (recent authentication, never the last sign-in method) or an owner, with an audit event. Cascades only if a Person were deleted, which the application never does.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Immutable link UUID used to address removal. | — | — |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Owning Person. | — | — |
| `provider` | `character varying(16)` | no | — | CONFIDENTIAL | pdt or sankhya; selects the connector that proved the identity. | — | — |
| `issuer` | `character varying(300)` | no | — | CONFIDENTIAL | Fixed provider installation identifier from server configuration (PDT_IDENTITY_ISSUER or SANKHYA_IDENTITY_ISSUER); never taken from browser input. | — | — |
| `subject` | `character varying(200)` | no | — | CONFIDENTIAL | Stable provider subject: PDT identitySubject UUID or Sankhya CODUSU. Never a name or e-mail. | — | — |
| `label` | `character varying(200)` | yes | — | CONFIDENTIAL | Display snapshot of the provider account name at last verification; informational only. | The provider supplied no display name. | — |
| `email` | `character varying(254)` | yes | — | CONFIDENTIAL | Normalized e-mail reported by the provider for this account. Used only as a hint to ask for proof before provisioning a second Person; never as proof or merge criterion. | The provider reported no e-mail. | — |
| `established_by` | `character varying(16)` | no | `'proof'::character varying` | CONFIDENTIAL | proof: the account holder proved the account to IA-MNS; directory: an owner selected and attested the account from the Sankhya directory, validated server-side. | — | — |
| `linked_by` | `uuid` | yes | — | CONFIDENTIAL | Owner who attested a directory link. | Established by the account holder's proof. | — |
| `linked_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock instant the link was proven and created. | — | — |
| `last_verified_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Application-clock instant of the latest successful proof through this link. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_external_identities_email_check` | `CHECK (((email IS NULL) OR ((email)::text = lower(btrim((email)::text)))))` | E-mail hints are stored normalized. |
| `identity_external_identities_established_check` | `CHECK ((((established_by)::text = ANY ((ARRAY['proof'::character varying, 'directory'::character varying])::text[])) AND (((established_by)::text = 'proof'::text) OR (linked_by IS NOT NULL))))` | Known establishment kinds; directory links name the attesting owner. |
| `identity_external_identities_issuer_check` | `CHECK ((length((issuer)::text) > 0))` | Issuer required. |
| `identity_external_identities_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Links belong to one Person. |
| `identity_external_identities_pkey` | `PRIMARY KEY (id)` | Immutable link identity. |
| `identity_external_identities_provider_check` | `CHECK (((provider)::text = ANY ((ARRAY['pdt'::character varying, 'sankhya'::character varying])::text[])))` | Only implemented connectors. |
| `identity_external_identities_subject_check` | `CHECK ((length((subject)::text) > 0))` | Subject required. |
| `identity_external_identities_email_idx` | `CREATE INDEX identity_external_identities_email_idx ON public.identity_external_identities USING btree (email)` | Candidate lookup before automatic provisioning. |
| `identity_external_identities_person_provider_key` | `CREATE UNIQUE INDEX identity_external_identities_person_provider_key ON public.identity_external_identities USING btree (person_id, provider, issuer)` | A Person has at most one account per provider installation. |
| `identity_external_identities_subject_key` | `CREATE UNIQUE INDEX identity_external_identities_subject_key ON public.identity_external_identities USING btree (provider, issuer, subject)` | One external account maps to at most one Person; no silent duplication or merge. |

## identity_local_credentials

Optional IA-MNS local sign-in: unique login, memory-hard password verifier, lockout state and encrypted TOTP secret for strong authentication.

Owner: identity. Classification: RESTRICTED.

Lifecycle: Replaced on password change or owner-issued reset; TOTP reset by the Person or an owner reset. Deleted only with the Person.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Owning Person; at most one local credential. | — | — |
| `login` | `character varying(64)` | no | — | CONFIDENTIAL | Normalized lowercase sign-in name; unique and not an e-mail requirement. | — | — |
| `password_hash` | `character varying(200)` | no | — | RESTRICTED | scrypt verifier with parameters and salt; never returned or logged. | — | — |
| `password_changed_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Application-clock instant of the last password change. | — | — |
| `failed_attempts` | `integer` | no | `0` | CONFIDENTIAL | Consecutive failed password or second-factor attempts since the last success; drives temporary lockout. | — | — |
| `locked_until` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Application-clock end of a temporary lockout. | No active lockout. | — |
| `totp_secret` | `character varying(200)` | yes | — | RESTRICTED | AES-256-GCM encrypted RFC 6238 secret (IA_MNS_IDENTITY_ENCRYPTION_KEY). | No second factor enrolled. | — |
| `totp_enabled_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Instant the second factor was confirmed with a valid code. | Second factor not enabled. | — |
| `totp_last_step` | `bigint` | yes | — | CONFIDENTIAL | Last accepted 30-second TOTP step; prevents code reuse. | No code accepted yet. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_local_credentials_attempts_check` | `CHECK ((failed_attempts >= 0))` | Nonnegative failure counter. |
| `identity_local_credentials_login_check` | `CHECK (((login)::text ~ '^[a-z0-9][a-z0-9._-]{2,63}$'::text))` | Normalized login alphabet and length. |
| `identity_local_credentials_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Credential belongs to its Person. |
| `identity_local_credentials_pkey` | `PRIMARY KEY (person_id)` | One credential per Person. |
| `identity_local_credentials_totp_check` | `CHECK (((totp_enabled_at IS NULL) OR (totp_secret IS NOT NULL)))` | An enabled factor has a secret. |
| `identity_local_credentials_login_key` | `CREATE UNIQUE INDEX identity_local_credentials_login_key ON public.identity_local_credentials USING btree (login)` | Unique sign-in name. |

## identity_recovery_codes

Single-use second-factor recovery codes, stored only as SHA-256 hashes of high-entropy values shown once.

Owner: identity. Classification: RESTRICTED.

Lifecycle: Regenerated sets replace previous codes; used codes stay marked. Deleted with a TOTP reset or the Person.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Immutable code row UUID. | — | — |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Owning Person. | — | — |
| `code_hash` | `character(64)` | no | — | RESTRICTED | SHA-256 of the recovery code. | — | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock issue instant. | — | — |
| `used_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Instant the code was consumed. | Not used. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_recovery_codes_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Codes belong to one Person. |
| `identity_recovery_codes_pkey` | `PRIMARY KEY (id)` | Immutable code identity. |
| `identity_recovery_codes_hash_key` | `CREATE UNIQUE INDEX identity_recovery_codes_hash_key ON public.identity_recovery_codes USING btree (code_hash)` | A code hash is unique. |
| `identity_recovery_codes_person_idx` | `CREATE INDEX identity_recovery_codes_person_idx ON public.identity_recovery_codes USING btree (person_id)` | Per-Person code lookup. |

## identity_sessions

Authenticated continuity for a Person: method, surface, assurance and expiry. Direct-URL sessions hold a rotating refresh credential (hash only); embedded sessions have none and renew through a new host proof.

Owner: identity. Classification: RESTRICTED.

Lifecycle: Expire at idle or absolute limits; revoked on logout, Person disable, credential reset, refresh reuse, or explicit revocation. Expired rows are pruned by the application after 7 days.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Session UUID; carried as the access-token sid claim. | — | — |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Authenticated Person. | — | — |
| `method` | `character varying(16)` | no | — | CONFIDENTIAL | Proof used: local, pdt, sankhya, bootstrap or enrollment. | — | — |
| `surface` | `character varying(16)` | no | — | CONFIDENTIAL | Where the session started: direct, pdt or sankhya. Never used for authorization. | — | — |
| `assurance` | `character varying(8)` | no | — | CONFIDENTIAL | single or mfa; administrative operations require mfa. | — | — |
| `refresh_hash` | `character(64)` | yes | — | RESTRICTED | SHA-256 of the current refresh credential. | Embedded or revoked session without refresh. | — |
| `previous_refresh_hash` | `character(64)` | yes | — | RESTRICTED | SHA-256 of the previous refresh credential; presenting it revokes the session as reuse. | Not rotated yet. | — |
| `auth_time` | `timestamp(3) with time zone` | no | — | CONFIDENTIAL | Instant of the latest primary or step-up authentication; drives recent-authentication checks. | — | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock creation instant. | — | — |
| `last_seen_at` | `timestamp(3) with time zone` | no | — | CONFIDENTIAL | Application-clock last user activity reported by the browser (or sign-in); the inactivity deadline is derived from it. | — | — |
| `idle_expires_at` | `timestamp(3) with time zone` | no | — | CONFIDENTIAL | Application-clock idle expiry, extended on refresh but never past expires_at. | — | — |
| `expires_at` | `timestamp(3) with time zone` | no | — | CONFIDENTIAL | Application-clock absolute expiry. | — | — |
| `revoked_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Revocation instant. | Not revoked. | — |
| `revoked_reason` | `character varying(40)` | yes | — | CONFIDENTIAL | Allowlisted revocation reason code. | Not revoked. | — |
| `refresh_rotated_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | When the refresh credential last rotated. A request presenting the immediately previous credential within a short grace window is a concurrent refresh of the same browser and receives an access token without rotation; later presentations are treated as reuse and revoke the session. | Never rotated. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_sessions_assurance_check` | `CHECK (((assurance)::text = ANY ((ARRAY['single'::character varying, 'mfa'::character varying])::text[])))` | Explicit assurance levels. |
| `identity_sessions_expiry_check` | `CHECK (((idle_expires_at <= expires_at) AND (auth_time <= expires_at)))` | Idle expiry and authentication time cannot exceed the absolute expiry. |
| `identity_sessions_method_check` | `CHECK (((method)::text = ANY ((ARRAY['local'::character varying, 'pdt'::character varying, 'sankhya'::character varying, 'bootstrap'::character varying, 'enrollment'::character varying])::text[])))` | Implemented sign-in methods. |
| `identity_sessions_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Session belongs to its Person. |
| `identity_sessions_pkey` | `PRIMARY KEY (id)` | Session identity. |
| `identity_sessions_revocation_check` | `CHECK (((revoked_at IS NULL) = (revoked_reason IS NULL)))` | Revocation instant and reason exist together. |
| `identity_sessions_surface_check` | `CHECK (((surface)::text = ANY ((ARRAY['direct'::character varying, 'pdt'::character varying, 'sankhya'::character varying])::text[])))` | Known access surfaces. |
| `identity_sessions_expiry_idx` | `CREATE INDEX identity_sessions_expiry_idx ON public.identity_sessions USING btree (expires_at)` | Expired-session pruning. |
| `identity_sessions_person_idx` | `CREATE INDEX identity_sessions_person_idx ON public.identity_sessions USING btree (person_id, created_at DESC)` | Per-Person session listing. |
| `identity_sessions_previous_refresh_key` | `CREATE UNIQUE INDEX identity_sessions_previous_refresh_key ON public.identity_sessions USING btree (previous_refresh_hash)` | Reuse detection lookup. |
| `identity_sessions_refresh_key` | `CREATE UNIQUE INDEX identity_sessions_refresh_key ON public.identity_sessions USING btree (refresh_hash)` | A refresh credential maps to one session. |

## identity_role_assignments

Internal IA-MNS roles assigned to a Person. owner is the principal administrator with full IA-MNS capability and administration, independent of Sankhya or PDT roles.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Assigned by bootstrap or an existing owner with recent strong authentication; the last active owner cannot be removed. Every change is audited.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Role holder. | — | — |
| `role` | `character varying(40)` | no | — | CONFIDENTIAL | Internal role code; currently owner. | — | — |
| `granted_by` | `uuid` | yes | — | CONFIDENTIAL | Owner Person who assigned the role. | Assigned by the server-side bootstrap flow. | — |
| `granted_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock assignment instant. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_role_assignments_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Role belongs to its Person. |
| `identity_role_assignments_pkey` | `PRIMARY KEY (person_id, role)` | A role is assigned once per Person. |
| `identity_role_assignments_role_check` | `CHECK (((role)::text = 'owner'::text))` | Only defined internal roles. |
| `identity_role_assignments_role_idx` | `CREATE INDEX identity_role_assignments_role_idx ON public.identity_role_assignments USING btree (role)` | Owner counting and listing. |

## identity_capability_grants

Explicit capability permissions granted to a Person by an owner, in addition to provider-policy grants derived from active links. The language model never creates grants.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Granted and revoked by owners with recent strong authentication; changes reach new access tokens within their 10-minute lifetime. Audited.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Grantee. | — | — |
| `permission` | `character varying(80)` | no | — | CONFIDENTIAL | Registered capability permission such as sales:read; validated against the composed catalog. | — | — |
| `granted_by` | `uuid` | yes | — | CONFIDENTIAL | Owner Person who granted it. | Granted by the server-side bootstrap flow. | — |
| `granted_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock grant instant. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_capability_grants_permission_check` | `CHECK (((permission)::text ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'::text))` | Permission naming convention. |
| `identity_capability_grants_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Grant belongs to its Person. |
| `identity_capability_grants_pkey` | `PRIMARY KEY (person_id, permission)` | A permission is granted once per Person. |

## identity_tickets

Short-lived single-use flow state addressed by the SHA-256 of a high-entropy secret: bootstrap, enrollment, reset and link invitations, pending second factor, pending TOTP setup, provisioning choice, profile consolidation, and pending PDT or Sankhya proofs (state, nonce, PKCE verifier).

Owner: identity. Classification: RESTRICTED.

Lifecycle: Consumed atomically once or expires (minutes; invitations up to 72 hours). Expired rows are pruned by the application after 7 days.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Ticket row UUID. | — | — |
| `purpose` | `character varying(24)` | no | — | CONFIDENTIAL | Flow kind; a ticket is only accepted by its own purpose. | — | — |
| `token_hash` | `character(64)` | no | — | RESTRICTED | SHA-256 of the secret presented by the browser or callback. | — | — |
| `person_id` | `uuid` | yes | — | CONFIDENTIAL | Person the flow acts on. | The flow is not yet bound to a Person (sign-in, bootstrap or provisioning). | — |
| `payload` | `jsonb` | no | `'{}'::jsonb` | RESTRICTED | Allowlisted flow state such as intent, surface, PKCE verifier, nonce or a verified external identity awaiting a choice. Never passwords. | — | — |
| `created_by` | `uuid` | yes | — | CONFIDENTIAL | Owner Person who issued an invitation or reset. | Created by the Person's own flow or the bootstrap command. | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock creation instant. | — | — |
| `expires_at` | `timestamp(3) with time zone` | no | — | CONFIDENTIAL | Application-clock expiry. | — | — |
| `consumed_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | Single-use consumption instant. | Not consumed. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_tickets_expiry_check` | `CHECK ((expires_at > created_at))` | Expiry after creation. |
| `identity_tickets_payload_check` | `CHECK ((jsonb_typeof(payload) = 'object'::text))` | Payload is a JSON object. |
| `identity_tickets_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Optional Person binding. |
| `identity_tickets_pkey` | `PRIMARY KEY (id)` | Ticket identity. |
| `identity_tickets_purpose_check` | `CHECK (((purpose)::text = ANY ((ARRAY['bootstrap'::character varying, 'enrollment'::character varying, 'reset'::character varying, 'link_invitation'::character varying, 'mfa'::character varying, 'mfa_enrollment'::character varying, 'provision'::character varying, 'merge'::character varying, 'totp_setup'::character varying, 'pdt_login'::character varying, 'sankhya_login'::character varying])::text[])))` | Known flow purposes. |
| `identity_tickets_expiry_idx` | `CREATE INDEX identity_tickets_expiry_idx ON public.identity_tickets USING btree (expires_at)` | Expired-ticket pruning. |
| `identity_tickets_token_key` | `CREATE UNIQUE INDEX identity_tickets_token_key ON public.identity_tickets USING btree (token_hash)` | Secret lookup by hash. |

## identity_used_assertions

Replay protection for host identity assertions: SHA-256 of each accepted assertion jti until it expires.

Owner: identity. Classification: INTERNAL.

Lifecycle: Rows are pruned after their expiry.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `jti_hash` | `character(64)` | no | — | INTERNAL | SHA-256 of the assertion identifier. | — | — |
| `expires_at` | `timestamp(3) with time zone` | no | — | INTERNAL | Assertion expiry; after it the jti cannot be replayed anyway. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_used_assertions_pkey` | `PRIMARY KEY (jti_hash)` | Each assertion is accepted once. |

## identity_audit_events

Append-only audit of security-relevant identity events: sign-in outcomes, provisioning, link and unlink, credential and factor changes, role and grant changes, session revocation and bootstrap.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Append-only for the runtime role. Retention requires an owner-approved policy before shared deployment (PH-09).

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Event UUID. | — | — |
| `occurred_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Database-clock event instant. | — | — |
| `action` | `character varying(48)` | no | — | CONFIDENTIAL | Allowlisted dotted action code. | — | — |
| `actor_person_id` | `uuid` | yes | — | CONFIDENTIAL | Person who performed the action. | Anonymous attempt or server-side bootstrap. | — |
| `target_person_id` | `uuid` | yes | — | CONFIDENTIAL | Person affected by the action. | No Person resolved, for example a failed anonymous sign-in. | — |
| `details` | `jsonb` | no | `'{}'::jsonb` | CONFIDENTIAL | Allowlisted non-secret metadata such as provider, permission, role or reason codes. Never credentials, tokens or free text. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_audit_events_action_check` | `CHECK (((action)::text ~ '^[a-z][a-z0-9_.]*$'::text))` | Action code format. |
| `identity_audit_events_details_check` | `CHECK ((jsonb_typeof(details) = 'object'::text))` | Details are a JSON object. |
| `identity_audit_events_pkey` | `PRIMARY KEY (id)` | Event identity. |
| `identity_audit_events_recent_idx` | `CREATE INDEX identity_audit_events_recent_idx ON public.identity_audit_events USING btree (occurred_at DESC, id DESC)` | Recent audit listing. |
| `identity_audit_events_target_idx` | `CREATE INDEX identity_audit_events_target_idx ON public.identity_audit_events USING btree (target_person_id, occurred_at DESC)` | Per-Person audit history. |

## identity_security_policies

The single owner-administered authentication policy: session lifetime, inactivity timeout, recent-authentication windows, second-factor requirement and remembered browsers. Absent row means the built-in secure defaults.

Owner: identity. Classification: INTERNAL.

Lifecycle: One row, updated in place by owners with strong recent authentication; every change is recorded in identity_audit_events with previous and new values.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `smallint` | no | `1` | INTERNAL | Singleton key; always 1. | — | — |
| `session_max_minutes` | `integer` | no | — | INTERNAL | Longest a direct-URL session lasts from sign-in, whatever the activity. | — | — |
| `idle_timeout_minutes` | `integer` | no | — | INTERNAL | Longest a direct-URL session survives without user activity reported by the browser. | — | — |
| `recent_auth_minutes` | `integer` | no | — | INTERNAL | How long a sign-in or confirmation allows sensitive changes to the person's own account without confirming again. | — | — |
| `admin_recent_auth_minutes` | `integer` | no | — | INTERNAL | How long a strong sign-in or confirmation allows administrative changes without confirming again. | — | — |
| `mfa_requirement` | `character varying(16)` | no | — | INTERNAL | Who must use a second factor with IA-MNS passwords: everyone, administrators, or none (never applied in production). | — | — |
| `remember_device_days` | `smallint` | no | — | INTERNAL | Days a browser that completed the second factor skips it at sign-in; 0 asks at every sign-in. Owners are remembered only while the second factor is optional, which production never allows. | — | — |
| `updated_by` | `uuid` | yes | — | CONFIDENTIAL | Owner who last changed the policy. | Never changed by a person. | — |
| `updated_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | INTERNAL | Database-clock instant of the last change. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_security_policies_admin_recent_check` | `CHECK (((admin_recent_auth_minutes >= 5) AND (admin_recent_auth_minutes <= 240)))` | Administrative confirmation window between 5 minutes and 4 hours. |
| `identity_security_policies_idle_check` | `CHECK ((((idle_timeout_minutes >= 15) AND (idle_timeout_minutes <= 10080)) AND (idle_timeout_minutes <= session_max_minutes)))` | Inactivity timeout between 15 minutes and 7 days, never longer than the session. |
| `identity_security_policies_mfa_check` | `CHECK (((mfa_requirement)::text = ANY ((ARRAY['everyone'::character varying, 'administrators'::character varying, 'none'::character varying])::text[])))` | Known second-factor requirements. |
| `identity_security_policies_pkey` | `PRIMARY KEY (id)` | Singleton policy. |
| `identity_security_policies_recent_check` | `CHECK ((((recent_auth_minutes >= 5) AND (recent_auth_minutes <= 1440)) AND (recent_auth_minutes <= session_max_minutes)))` | Account confirmation window between 5 minutes and 24 hours, never longer than the session. |
| `identity_security_policies_remember_check` | `CHECK (((remember_device_days >= 0) AND (remember_device_days <= 90)))` | Remembered browsers last at most 90 days. |
| `identity_security_policies_session_check` | `CHECK (((session_max_minutes >= 60) AND (session_max_minutes <= 43200)))` | Session lifetime between one hour and 30 days. |
| `identity_security_policies_singleton_check` | `CHECK ((id = 1))` | Only one policy row exists. |
| `identity_security_policies_updated_by_fkey` | `FOREIGN KEY (updated_by) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE RESTRICT` | The last editor is an existing Person. |

## identity_trusted_devices

A browser that completed the second factor for a Person and asked to be remembered; its HttpOnly cookie holds a random token stored here only as SHA-256.

Owner: identity. Classification: CONFIDENTIAL.

Lifecycle: Valid while not revoked and younger than the policy's remember_device_days. Revoked by the Person, by password or second-factor changes, by an owner reset or disabling; expired rows are pruned.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | CONFIDENTIAL | Remembered-browser identifier. | — | — |
| `person_id` | `uuid` | no | — | CONFIDENTIAL | Person whose second factor the browser completed. | — | — |
| `token_hash` | `character(64)` | no | — | RESTRICTED | SHA-256 of the 256-bit browser token; the token itself is never stored. | — | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | When the second factor was completed on this browser. | — | — |
| `last_used_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | CONFIDENTIAL | Last sign-in that skipped the second factor with this browser. | — | — |
| `revoked_at` | `timestamp(3) with time zone` | yes | — | CONFIDENTIAL | When the browser stopped being remembered. | Still remembered while within the policy period. | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `identity_trusted_devices_person_id_fkey` | `FOREIGN KEY (person_id) REFERENCES identity_persons(id) ON UPDATE CASCADE ON DELETE CASCADE` | Removed with the Person. |
| `identity_trusted_devices_pkey` | `PRIMARY KEY (id)` | Remembered-browser identity. |
| `identity_trusted_devices_person_idx` | `CREATE INDEX identity_trusted_devices_person_idx ON public.identity_trusted_devices USING btree (person_id)` | Revocation of a Person's remembered browsers. |
| `identity_trusted_devices_token_key` | `CREATE UNIQUE INDEX identity_trusted_devices_token_key ON public.identity_trusted_devices USING btree (token_hash)` | Token lookup; one row per browser token. |

## operational_parameters

Values that owners saved for the operational parameters declared by the runtime catalog in apps/api/src/parameters.ts (ADR-0028). The catalog owns each parameter's type, domain, installation default and effect; a missing row or a null value means the installation default applies. Secrets and bootstrap settings are never stored here.

Owner: runtime (operational parameters). Classification: INTERNAL.

Lifecycle: At most one row per catalog key, written only by owners through administration with strong recent authentication; a reset stores null instead of deleting. Every change is recorded in identity_audit_events with previous and new values.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `key` | `character varying(64)` | no | — | INTERNAL | Catalog key of the parameter, such as ai.model. | — | — |
| `value` | `jsonb` | yes | — | INTERNAL | Saved JSON value in the catalog type of the key (string or array of strings). | Reset by an owner; the installation default applies. | — |
| `version` | `integer` | no | — | INTERNAL | Concurrency token incremented by every change; an owner's change applies only to the version they saw. | — | — |
| `updated_by` | `uuid` | no | — | CONFIDENTIAL | Person (identity_persons.id) who made the last change; historical attribution without a foreign key, because the authoritative trail is the identity audit. | — | — |
| `updated_at` | `timestamp(3) with time zone` | no | — | INTERNAL | Application-clock instant of the last change; informational, not the concurrency token. | — | — |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `operational_parameters_key_check` | `CHECK (((key)::text = ANY ((ARRAY['ai.model'::character varying, 'ai.traceLevel'::character varying, 'access.providerGrants'::character varying])::text[])))` | Only parameters declared by the catalog. |
| `operational_parameters_pkey` | `PRIMARY KEY (key)` | One saved value per parameter. |
| `operational_parameters_value_check` | `CHECK (((value IS NULL) OR (((key)::text = 'ai.model'::text) AND (jsonb_typeof(value) = 'string'::text) AND ((value #>> '{}'::text[]) ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'::text)) OR (((key)::text = 'ai.traceLevel'::text) AND (jsonb_typeof(value) = 'string'::text) AND ((value #>> '{}'::text[]) = ANY (ARRAY['off'::text, 'metadata'::text, 'content'::text]))) OR (((key)::text = 'access.providerGrants'::text) AND (jsonb_typeof(value) = 'array'::text) AND (jsonb_array_length(value) <= 32) AND (NOT jsonb_path_exists(value, '$[*]?(@.type() != "string")'::jsonpath)))))` | Each known key holds only its catalog type and domain (model identifier pattern, trace level, list of at most 32 strings). |
| `operational_parameters_version_check` | `CHECK ((version >= 1))` | Versions start at 1. |
