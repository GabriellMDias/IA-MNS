# Corporate Agent Verification

[Current architecture](../domains/corporate-agent.md) · [Project plan](implementation-plan.md) · [Human actions](human-actions.md) · [Setup](../setup.md#corporate-agent-and-local-postgresql)

## Scope and evidence boundary

Verification on 2026-10-01 covers PJ-09 in this local checkout. Existing uncommitted MVP work was preserved. The owner authorized reuse of the configured OpenAI key; no key was created or rotated. Oracle operations were read-only. PostgreSQL writes affect only IA-MNS's application history. No Git publication, remote CI, production identity or new business domain was performed.

The corporate agent has one registered business capability, sales. Social/capability replies use bounded routing and application-owned Portuguese prose. Business numbers retain the original controlled SQL, decimal aggregation and deterministic renderer. The reference excludes computed non-sale movements rather than subtracting returns; requests to include returns are explicitly unavailable. New identity/history work does not redefine that rule.

## Changes and relevant guarantees

- A composed agent owns routing, implemented capability metadata, permissions, persistent conversation/context and real progress. Sales retains its domain executor; both legacy and agent transports share one Oracle pool.
- PostgreSQL acceptance uses owner-scoped row locks, ordered turns, request UUID replay/conflict, atomic outcomes and a crash lease. Failed/interrupted turns preserve trusted filters and cannot invent answers. No provider call is automatically retried.
- Result snapshots and context have stored versions. Sales context remains independent of intervening social turns; at most 12 sales questions/clarifications enter interpretation. Financial results never enter OpenAI requests.
- Reading historical business answers enforces current capability permission as well as ownership. Runtime PostgreSQL credentials cannot create tables. Administrative migration credentials are removed from the API process before infrastructure imports.
- The UI uses generated SDK operations, previous conversations, reload/continuation, explicit deletion and recovery of unknown acceptance with the original request UUID. Credentials/transcripts remain out of browser storage; only a light/dark preference is persisted there.
- Progress is emitted before actual routing, sales interpretation, Oracle execution and deterministic result organization. Social, unsupported and clarification paths do not emit an Oracle stage.

## Local infrastructure and runtime findings

`pnpm db:local` provisioned PostgreSQL 16 at `127.0.0.1:55432`, applied the reviewed additive migration and restricted runtime grants, and updated only ignored local database settings. Existing OpenAI/Oracle settings were preserved. The named Docker volume retains application history. A Docker Desktop startup failure required moving its verified transient `run` directory to `run.recovery-20261001`; no Docker image/volume data was deleted.

A cold real Oracle query exceeded the previous 30-second native round-trip limit (`NJS-123`) and correctly persisted a failed turn without a result. The limit is now 45 seconds, within the agent's 90-second overall deadline. There is no automatic retry. Historical native-client compatibility and fetch limitations remain documented in [PH-08](human-actions.md#ph-08).

## Validation evidence

Frozen dependency installation and the complete local `pnpm validate` passed: format, lint, types, architectural boundaries, documentation/instructions, environment metadata, migration/provenance guards, generated API/database/SDK/portal checks, 92 API tests, 63 web unit tests, five browser component tests, builds/bundle checks, process smoke and all 20 end-to-end journeys. Remote CI was not run. An earlier complete run retained a historical failure in one shell journey that expected the removed documentation CTA; after updating it to exercise the real application navigation, its focused rerun and the complete gate passed. Final documentation/artifact consistency checks were repeated after recording these results.

The tests use synthetic providers and migrated PostgreSQL to cover ownership/current permission, concurrent acceptance, replay/conflict, lease interruption, paging, cascade deletion, context continuity, malformed provider output, redaction, truthful progress, history/reload, unknown acceptance, token memory, light/dark desktop/mobile and accessibility. Synthetic screenshots contain no ERP data. Both themes and the mobile layout were visually inspected.

Fourteen real HTTP scenarios passed using the existing key, actual routing/planning and Oracle 12.1.0.2 in Thick mode. Eight numerical answers were independently reconciled against the owner's complete original reference projection, including grouped rows, unit-specific totals, product sets, prior-year rows and percentage changes. Reference operations ran in a separate READ ONLY snapshot; no financial values or credentials are copied into this report.

| Scenario | Result |
| --- | --- |
| "Oi, tudo bem?" and "O que você pode fazer hoje?" | Natural conversation/current registered capabilities; no Oracle stage. |
| Current stock and a request to change prices | Unavailable; no Oracle stage or ERP write. |
| "Quanto vendi de maçã por mês nos últimos 3 meses?" | July 1 through September 30, 2026; three monthly rows and 33 matched products; original SQL matched. |
| Plural "maçãs", "mês a mês", "último trimestre completo" | Same explicit period/filters and reference results. |
| Considered products as a follow-up | Preserved product/period filters; 33 product rows; reference matched. |
| "Quanto vendi de maçã este mês?" | October 1, 2026 month-to-date; reference matched. |
| "Quantos quilos de maçã vendi nos últimos 30 dias?" | September 2 through October 1; ERP weight calculation matched, with the existing unconfirmed-unit warning. |
| "E comparado ao mesmo período do ano passado?" | Preserved July–September filters; current/prior rows, union of 69 products and percentage changes matched. |
| Quantity between July and September | Two separate ERP units; no cross-unit sum; reference matched. |
| Missing period, then "Nos últimos três meses, separado por mês." | Clarification followed by correct July–September monthly answer; reference matched. |
| Include sales and returns | Explicitly unavailable under the existing reference business rule; no Oracle stage. |

The real query responses in this run took approximately 14–41 seconds. Progress reduces uncertainty but does not make Oracle faster; the deadline remains bounded and slow/failed executions produce explicit errors rather than guessed results.

After restarting the actual PostgreSQL container and repeating `pnpm db:local`, all 11 conversations from the 14-scenario set had identical HTTP history snapshots. The actual emitted API was then stopped/restarted; those histories remained identical. A real browser, without API interception, reopened a conversation, sent a social thanks and continued with "Agora mostre por mês, mantendo o mesmo produto e período." All four persisted stages were observed, the original filters survived, three monthly rows/33 products matched the already reconciled baseline, and reload retained the conversation. Browser storage held no credentials/transcript. A container restart is durability evidence, not a backup/restore test.

## Sidebar organization and local upgrade (2026-10-02)

PJ-13 adds an animated, resizable desktop sidebar with a 60-pixel collapsed icon rail. New conversation, title/question search, pinned/archived views, documentation and theme selection live in the sidebar; each history row has a native menu for rename, pin/unpin, archive/restore and delete. Pointer and keyboard resizing, reduced motion, mobile modal focus and row-specific actions are covered by browser journeys. Original shared light/dark palettes and sales semantics are unchanged.

The additive `202610020001_conversation_organization` migration was applied to the existing local PostgreSQL database without resetting it. Real local HTTP calls verified title/favorite/archive updates, case-insensitive owned search, restoration and deletion. A fresh database connection read the saved metadata; after removing only the synthetic verification conversation, the existing history count matched. No OpenAI or Oracle request was needed. Migrated disposable-PostgreSQL tests additionally cover manual-title preservation, busy/owner validation, archive/replay/context continuation, literal wildcard escaping and favorite-first pagination.

The complete local `pnpm validate` passed after corrections: 95 API tests, 63 web unit tests, five browser component tests and 23 end-to-end journeys, including desktop/mobile accessibility and documentation navigation. The first full run exposed default-scope URL pollution and an accessibility test racing initial rendering; the default active view now keeps the canonical home URL clean, and the test awaits the visible workspace before analysis. No check was disabled or weakened. Generated API/SDK/schema/portal references were refreshed from their sources.

Conversation organization survives reconnect/restart through PostgreSQL. Sidebar expansion and width remain session preferences in memory; reload resets their default values. Search is literal and case-insensitive over titles and sent questions, including archives; accent-insensitive, semantic and answer-body search are intentionally absent. Shared retention/backup/authentication obligations remain unchanged. Manual acceptance should include dragging the desktop edge, using the collapsed shortcuts, renaming/pinning a prior conversation, archiving/restoring it, and cancelling deletion in the mobile drawer.

## Intentional limits and next decisions

Only sales is implemented. Conversation is bounded rather than an unrestricted general-knowledge assistant. Execution is process-local, not a durable workflow engine: crashed work is interrupted after the lease and never automatically resumed. Old temporary transcripts have no durable migration source. Stored answers are historical snapshots, not automatically refreshed ERP data.

Local development represents one local owner; production login/shared deployment remain PJ-05. Before shared use, PH-09 requires retention/provider/backup/identity decisions. PH-08 still requires a dedicated SELECT-only Oracle account, currency/weight confirmation and investigation of the legacy fetch discrepancy. PH-10 requires a committed immutable migration baseline before a supported durable release. These are not silently implemented by this review.

Manual interface acceptance should include toggling both themes, reopening an old conversation after closing the browser, continuing its filters, checking a clarification, reading the matched-products list and cancelling/confirming explicit deletion. The automated and real-browser checks do not replace the owner's assessment of conversational tone and presentation.
