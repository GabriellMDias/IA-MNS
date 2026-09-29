# Approval Request Database Reference

<!-- Generated from migrated PostgreSQL and apps/api/prisma/schema-metadata.json. Do not edit. -->

[Schema documentation policy](../../database/schema-documentation.md) · [Approval Request specification](../../domains/approval-request.md)

## approval_requests

Canonical current state of a human-owned Approval Request, from draft through a terminal decision or cancellation.

Owner: Approval Request. Classification: INTERNAL.

Lifecycle: Created in DRAFT; retained through terminal state. No automatic deletion or legal retention duration is defined; production retention remains a separate decision.

| Column | PostgreSQL type | Nullable | Default | Classification | Meaning | Null meaning | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | no | — | INTERNAL | Backend-generated immutable UUID that is both the primary key and public resource identifier. | — | — |
| `creator_id` | `uuid` | no | — | INTERNAL | Immutable provider-independent Orion principal UUID of the human who owns the request; supplied by the trusted authentication boundary. | — | — |
| `title` | `character varying(200)` | no | — | INTERNAL | Owner-authored concise purpose of the approval request; editable only in DRAFT. | — | — |
| `description` | `character varying(2000)` | yes | — | INTERNAL | Optional owner-authored supporting context; editable only in DRAFT. | No supporting context supplied. | — |
| `status` | `"ApprovalRequestStatus"` | no | `'DRAFT'::"ApprovalRequestStatus"` | INTERNAL | Current lifecycle state; APPROVED, REJECTED, and CANCELLED are terminal. | — | — |
| `version` | `integer` | no | `1` | INTERNAL | Optimistic concurrency token, initialized to one and incremented exactly once per successful edit or transition. | — | successful writes |
| `rejection_reason` | `character varying(2000)` | yes | — | INTERNAL | Reviewer-authored reason for rejection, present exactly when status is REJECTED. | The request has not been rejected. | — |
| `idempotency_key` | `character varying(200)` | no | — | INTERNAL | Opaque caller-supplied creation intent key, unique within creator_id and retained with the request. | — | — |
| `intent_fingerprint` | `character varying(64)` | no | — | INTERNAL | SHA-256 fingerprint of the canonical title and description creation intent; detects key reuse for different content. | — | — |
| `created_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | INTERNAL | PostgreSQL-clock absolute creation instant, serialized as UTC RFC 3339; does not constitute audit history. | — | UTC instant, millisecond precision |
| `updated_at` | `timestamp(3) with time zone` | no | `CURRENT_TIMESTAMP` | INTERNAL | PostgreSQL-clock absolute instant of the latest successful write; not a concurrency token or audit history. | — | UTC instant, millisecond precision |

### Constraints and indexes

| Object | Physical definition | Purpose |
| --- | --- | --- |
| `approval_requests_description_nonblank` | `CHECK (((description IS NULL) OR ((description)::text ~ '[^[:space:]]'::text)))` | Optional description cannot be whitespace only. |
| `approval_requests_fingerprint_sha256` | `CHECK (((intent_fingerprint)::text ~ '^[a-f0-9]{64}$'::text))` | Fingerprint is exactly lowercase SHA-256 hex. |
| `approval_requests_idempotency_key_nonblank` | `CHECK (((idempotency_key)::text ~ '^[A-Za-z0-9._~-]+$'::text))` | Creation keys must use the documented opaque ASCII key alphabet and cannot be blank. |
| `approval_requests_pkey` | `PRIMARY KEY (id)` | Enforces the immutable unique request identity used by persistence and the public API. |
| `approval_requests_rejection_reason_state` | `CHECK (((status = 'REJECTED'::"ApprovalRequestStatus") = ((rejection_reason IS NOT NULL) AND ((rejection_reason)::text ~ '[^[:space:]]'::text))))` | Requires one nonblank reason exactly for a rejected request. |
| `approval_requests_title_nonblank` | `CHECK (((title)::text ~ '[^[:space:]]'::text))` | Rejects blank titles even if a caller bypasses the API. |
| `approval_requests_version_positive` | `CHECK ((version > 0))` | Rejects invalid concurrency versions. |
| `approval_requests_creator_key_unique` | `CREATE UNIQUE INDEX approval_requests_creator_key_unique ON public.approval_requests USING btree (creator_id, idempotency_key)` | Prevents two requests for one owner and creation intent key, including racing inserts. |
| `approval_requests_mine_page_idx` | `CREATE INDEX approval_requests_mine_page_idx ON public.approval_requests USING btree (creator_id, created_at DESC, id DESC)` | Supports authorized owner pagination by creation time and ID. |
| `approval_requests_review_page_idx` | `CREATE INDEX approval_requests_review_page_idx ON public.approval_requests USING btree (status, created_at DESC, id DESC)` | Supports submitted reviewable pagination before applying the non-owner predicate. |

## Database enums

| Enum | Values | Meaning |
| --- | --- | --- |
| `ApprovalRequestStatus` | DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED | Five-state request lifecycle: DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED. |
