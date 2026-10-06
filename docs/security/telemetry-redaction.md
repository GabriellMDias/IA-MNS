# Telemetry Redaction

This policy owns safe data selection and sanitization for logs, traces, metrics, errors, breadcrumbs, audit/security records, profiling, diagnostics, and support artifacts across applications, tooling, SDKs, and infrastructure. [Data classification](data-classification.md) determines sensitivity. When diagnostic usefulness conflicts with data protection, protection takes priority.

## Current implementation and ownership

[ADR-0010](../adr/0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md) governs the selected foundation. The API has [Pino field redaction](../../apps/api/src/logging.ts), [allowlisted trace/metric export](../../apps/api/src/telemetry.ts), and [safe HTTP/error diagnostics](../../apps/api/src/app.ts). AI turn tracing follows the same rules: its default metadata level logs only allowlisted decisions, codes, timings and token counts, and confidential interpretation content is stored, when explicitly enabled, with the conversation rather than in telemetry ([AI tracing](../architecture/ai-interpretation.md#ai-tracing-and-observability)). These local controls do not establish a universal schema-driven redaction engine or prove that every future SDK/platform default is safe. The API runtime documentation and [validation inventory](../validation.md) identify current implementation and checks.

## Default deny for payload capture

Capture only fields needed to answer an operational question. Prefer explicit safe projections over capturing whole objects and attempting cleanup afterward. Request/response bodies, event/job/RPC/WebSocket payloads, ORM/domain entities, free-form metadata, environment dumps, and complete configuration must not be captured by default.

`RESTRICTED` data must never be intentionally captured, including passwords/hashes, access/session/refresh tokens, API/private/signing keys, database/payment credentials, recovery codes, and credential-bearing headers/cookies. Encryption, restricted provider access, development mode, incidents, and provider-side filtering do not exempt this rule.

Confidential fields require concrete diagnostic need, minimized representation, and controlled access/retention. Prefer justified opaque identifiers to names, email, phone, or complete records. Public/internal data may be captured when operationally useful; the destination never lowers classification. User-generated strings and arbitrary exceptions remain untrusted and potentially sensitive.

## Redaction strategies

Use source allowlists first, centralized application filtering as defense in depth, and collector/provider scrubbing as additional layers. Restricted data must be removed or replaced with a constant marker before export. Partial masking requires a justified safe remainder; it is not adequate for authentication secrets. Pseudonymization or hashing may permit correlation but does not establish anonymity, especially for predictable values.

Recognize common secret-bearing field names and locations, including authorization, cookies, query/form fields, provider metadata, exceptions, and environment variables. Name-based blocklists are a safety net, not the primary policy: schemas evolve. Use clear field names, safe structured projections, and canonical classification metadata where practical. Local rules may be stricter but must not conflict with shared policy.

If safe sanitization cannot be completed, drop unsafe telemetry and emit only a bounded safe failure signal. Never include the rejected payload in that signal or recurse through the failing serializer. Review getters, `toJSON`, custom serializers, recursion, arrays, and nesting; deterministic telemetry-specific serialization must not expose extra fields. Bound string length, depth, array size, breadcrumb count, and exception metadata. Truncation is not redaction and must not misrepresent meaning.

## HTTP request telemetry

Useful safe metadata includes method, normalized route template, status, duration, service, environment, release, and request/trace IDs. Full URLs, query strings, headers, and bodies are not default telemetry. Allowlist justified parameters/headers individually and remove credential-bearing `Authorization`, `Proxy-Authorization`, `Cookie`, and `Set-Cookie` values. File content, binary buffers, document text, image metadata, and archive contents must never be captured automatically; filenames can also disclose sensitive data.

Apply the same rule to other transports. Prefer event/job type, safe ID, consumer, attempt, result, and duration over payloads. Normalize routes rather than embedding resource IDs. Public support references must be opaque and contain no personal information, secret state, or key material; preserve safe correlation during redaction.

## Database and provider instrumentation

Database telemetry may describe operation, logical entity, system, duration, and result. Raw SQL can contain literals; use normalized/parameterized representations when query telemetry is required. Do not automatically capture bind values, rows, connection strings, or raw ORM objects. Any exceptional parameter diagnostics still require explicit classification/access controls and cannot capture restricted data.

Review driver/ORM error metadata before export: errors may contain SQL, values, hostnames, and connection information. Never expose raw database/provider exceptions to users. Review SDK requests, responses, headers, breadcrumbs, and debug modes independently. Prefer safe provider result codes and references; payment and authentication credentials remain prohibited. Provider-specific codes need sensitivity and cardinality review and do not replace the API's public error contract.

## Errors, traces, metrics, and audit

Error SDK automatic capture must be reviewed before use: requests, queries, cookies, locals, environment, console output, user context, and breadcrumbs can leak data. Local-variable capture is disabled by default unless an explicitly acceptable environment and controls justify it. `captureException(error)` is not automatically safe. Internal stacks can help diagnosis but may expose implementation paths and must not reach untrusted users or intentionally contain secrets.

Use safe minimal user context, preferring a justified internal identifier to profile data, and clear it on logout. Review navigation, console, database, HTTP, and interaction breadcrumbs. Trace attributes/events must use safe selected metadata, not objects or payloads.

Metric labels must never contain secrets and should avoid personal/entity-specific values, arbitrary error messages, full URLs, and request/trace IDs. Any exceptional dimension requires explicit privacy and cardinality justification; prefer bounded error/result categories. Audit/security records may justify confidential actor/resource identifiers that routine diagnostics omit, but still exclude credentials and unnecessary payloads.

## Clients, infrastructure, and special diagnostics

Do not automatically collect form values, clipboard, local storage, navigation state, screen contents, or user content. Session replay, screenshots, crash attachments, and full memory dumps are separate high-risk collection capabilities requiring explicit review; replay must mask/exclude sensitive areas. Memory dumps can contain arbitrary credentials and require justified collection and restricted access. Do not enable features merely because a vendor offers them.

Collect IP, user-agent, device identifiers, file paths, and geolocation only for justified needs with suitable retention; normalized platform/version/device-class data is often sufficient. Precise location is not default telemetry. Feature-flag diagnostics should contain bounded state, not full targeting contexts.

Inspect reverse proxies, load balancers, database server logs, container stdout/stderr, CI, and SDK debug logging independently. Application redaction cannot stop another layer from recording URLs, failed SQL, or credentials. CI output must not echo secrets; use platform masking where available. Development follows the same secret rules. Tests should use isolated/disabled exporters and never send synthetic test telemetry into production systems.

Temporary/emergency diagnostics must be explicit, minimized, reviewed, time-bounded, and removed afterward. They still cannot intentionally collect restricted data. Do not globally expand collection merely to investigate one issue.

## Representative secret tests

Important redaction behavior must have automated tests using obvious synthetic secrets. Assert both that safe correlation remains and that prohibited values appear nowhere in emitted logs, spans, breadcrumbs, or errors. Exercise headers, nested metadata, query strings, bodies, exception objects, and serialization failure where relevant. Inspect final export payloads for important flows; helper-level tests alone may miss SDK enrichment.

Treat redaction regressions as security defects. Extend tests when instrumentation, schemas, SDKs, or destinations change. Static rules, runtime guards, schema validation, and secret scanning are complementary; consult [validation](../validation.md) before claiming any check exists.

## Destinations, access, and leakage

Export only to approved destinations. Each additional provider/copy creates independent access, retention, residency, and deletion responsibilities; significant changes may need an ADR and security/privacy review. Do not duplicate telemetry across vendors without concrete value. [Retention](data-retention.md) and [production access](production-access.md) govern storage and readers, including AI agents.

Provide AI/support tooling with structured, sanitized, task-relevant evidence, never raw environment dumps, credential-bearing logs, or full customer/request objects by default. A future diagnostic bundle must exclude restricted data by construction and be introduced only for real need.

For leakage, follow [incident response](incident-response.md): stop further collection, identify data/classification/destinations/exposure, restrict access, remove data where possible, revoke/rotate exposed credentials, review usage, fix instrumentation, and add regression protection. Historical logs, traces, errors, exports, provider retention, and backups may still contain leaked values. Deleting an entry does not restore credential secrecy.

## New telemetry checklist

Before adding telemetry, identify the question answered, required fields and classifications, safer representations, untrusted/credential-bearing inputs, size/cardinality bounds, approved destination, retention/access, and redaction tests. Do not ship unexplained collection. Derive structural redaction references from canonical sources where practical; provider deployment, retention durations, session replay, and a cross-application metadata engine remain separate decisions, not implied capabilities.
