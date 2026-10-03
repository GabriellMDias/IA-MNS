# IA-MNS MVP Readiness Audit

[Implementation plan](implementation-plan.md) · [Human dependencies](human-actions.md) · [Sales semantics](../domains/sales-chat.md)

## Decision and scope

Historical review on 2026-10-01. The subsequent [corporate agent evolution](../domains/corporate-agent.md) owns current product identity, durable context and progress; the sales guarantees below remain relevant. The sales MVP has a coherent Orion module architecture and an executable Portuguese chat interface. It is suitable for continued supervised local evaluation, subject to the external controls below. Subsequent [live verification](live-sales-verification.md) resolved provider interpretation/browser acceptance with the owner-authorized existing key. It is not yet approved for a shared internal rollout. Local validation is evidence about this checkout, not remote CI or account-specific provider behavior.

The review covered the API module, OpenAI SDK boundary, deterministic domain calculations, Oracle adapter and reference projection, context lifecycle, authorization, configuration, redacted diagnostics, generated contracts, desktop/mobile presentation, tests, and documentation. No additional business domain, ERP write, grant, migration, deployment, or new infrastructure was introduced. Existing uncommitted MVP work was preserved.

## Defects corrected

| Finding | Correction and regression boundary |
| --- | --- |
| A clarification could contain arbitrary model-authored text, including invented figures. | The internal strict tool accepts only six clarification categories. The application supplies Portuguese prompts. Inconsistent plans and arbitrary text fail closed. SDK tests exercise invented figures, malformed plans, refusal, incomplete responses, multiple calls, and wrong tools. |
| Foundation socket inactivity expired after 10 seconds while sales processing allowed 90 seconds. Injection tests did not reveal this transport mismatch. | The sales route allows 95 seconds of socket inactivity and retains its 90-second cancellation deadline. A real HTTP regression exercises a deliberately shorter server timeout; real Oracle requests subsequently succeeded beyond 10 seconds. |
| Comparisons could derive dates before the supported year 2000 boundary. | Both periods pass the same calendar/date-window validation before database execution. Prior-year and prior-period boundary tests cover rejection. |
| Zero filling could expand a bounded monthly result beyond its row cap. | The completed monthly series also enforces 500 rows. A regression exercises expansion beyond the cap. |
| A well-shaped Oracle row could still carry an unexpected period, unit, grouping, or duplicate aggregate key. | The adapter checks each row against the requested scope and rejects duplicate groups before returning totals. Regressions cover wrong years, total/month mismatch, units, product grouping, and repeated rows. |
| Previous-period detail disappeared when current product rows were empty. | Comparison tables are independent of current-row visibility, and an explicit warning separates empty current sales from prior sales. Browser tests inspect the prior-only table. |
| Positive-only bars could misrepresent negative adjusted net values. | Negative results retain their signed table and do not offer the positive-only chart. A browser regression protects this behavior. |
| Filters were less inspectable, typography was small, and product navigation mixed languages. | Results visibly show dates and product scope; typography is more readable; product navigation is Portuguese. Pending questions remain visible while querying. Existing desktop/mobile layout and component ownership were retained. |

## Confirmed guarantees and limits

- The model selects structured filters; it never supplies SQL, database numbers, public clarification prose, or result arithmetic. Numeric answers, tables, totals, and percentage changes derive from checked Oracle aggregates using decimal arithmetic. This prevents model-authored figures; it does not prove that every natural-language interpretation selects the intended filters.
- The SQL retains the supplied 46-column DISTINCT grain, joins, adjusted net precedence, operation/product exclusions, confirmed status, and movement rule. The final computed TIPMOV = V excludes returns and bonus sales. “Net value” is the reference's VLRLIQUIDO, not revenue after returns. A request including returns is outside this capability.
- Date ends include the complete calendar day. Sao Paulo determines today. Current and comparison reads share one read-only snapshot; units remain separate. Leap days, missing months, no rows, missing weights, zero comparison bases, accent/case matching, and oversized results have explicit behavior.
- User text and descriptions remain bound data. Tool shapes are checked. Truncation, provider failure, invalid dates, cancellation, and cleanup failures do not become plausible successful sales answers. Oracle cancellation is covered by an active-call interruption/rollback/close test.
- Every protected request requires sales:read or deliberate private loopback mode. Actor ownership protects context, including deletion. Context is transient, bounded, and contains filters/questions rather than ERP rows. Browser storage does not persist credentials or results. Local bypass is unsuitable for a shared listener or tunnel.
- Credentials remain server-only and ignored; the root .env.local was verified untracked. Logs retain correlation and allowlisted diagnostic categories without questions, binds, totals, secrets, or connect descriptors. OpenAI receives questions/filter context, not ERP result rows. store:false is not a claim of zero provider retention.
- The existing separation between planner, application, pure domain, fixed SQL, and Oracle reader is useful. No agent loop, vector database, persisted chat store, new dependency, or abstraction was necessary for this audit.

## Executed verification

The same-day reference reconciliation previously compared nine structured scenarios with real Oracle 12.1.0.2: monthly apple net sales for July–September 2026, month to date, 30 inclusive days of weight, quantities by ERP unit, product detail, prior year, preceding equal-length days, accent/case equivalence, and an absent product. Complete reference records and a separate 311-group all-product week were also reconciled. SQL was unchanged during this readiness review; those results do not establish live model interpretation.

This review reran three requests through an actual listening Fastify HTTP server and the real Oracle adapter with a controlled planner. Annual comparison passed in 29.2 seconds with three current month rows and 69 products across both periods. No-result handling passed. A seven-day all-product breakdown passed in 27.6 seconds with 311 rows. These were SELECT operations in read-only transactions, followed by rollback and connection release. No ERP mutation was attempted. Evidence is metadata-only in ignored test-results/real-socket-check.log.

Frozen-lockfile installation and the full pnpm validate gate passed on 2026-10-01: 82 API tests, 63 web unit tests, 5 browser tests, and 19 end-to-end journeys, in addition to generated-reference drift, architectural/security checks, builds, and smoke. Evidence is in ignored test-results/validation-mvp-audit.log. Desktop and mobile browser journeys use synthetic data and check accessibility and overflow. Screenshots are ignored local artifacts, never real sales disclosures. PJ-07 records completion of this audit, while the remaining external-account controls stay separately blocked under PJ-06. No remote CI run is claimed.

## Outstanding acceptance and next steps

1. [PH-07](human-actions.md#ph-07) was subsequently completed: the owner configured a key manually and explicitly authorized reuse. Actual Portuguese queries and original-SQL reconciliation passed in the [live follow-up](live-sales-verification.md). This finite evaluation does not establish every possible future interpretation; account policies remain owner controls.
2. Complete [PH-08](human-actions.md#ph-08): provide a dedicated SELECT-only Oracle account. The current account has seven broad write privileges even though this application uses read-only transactions. Confirm BRL and the PESOLIQ unit before describing weight as certified kilograms.
3. Investigate the intermittent legacy Oracle/Thick small-fetch discrepancy with the DBA. Database-side MINUS and complete bounded fetching agreed; the adapter uses the bounded-fetch workaround. The underlying cause remains unverified.
4. Before shared use, select the identity/login provider and deployment controls under PJ-05; local mode and manual bearer input are not a complete employee sign-in experience. Publish and verify this repository's own CI/settings under PH-01–PH-04 when authorized. (Update, 2026-10-03: publication, Renovate, protection, and security settings were configured and verified; see the [human actions](human-actions.md).)

Manual acceptance should inspect the displayed product/date scope for differently phrased questions, complete-month versus rolling-day periods, variety names, contextual changes, ambiguous or unsupported filters, empty current comparisons, and weight warnings. Check keyboard submission, error recovery, new-conversation deletion, mobile scrolling, and tables with long product descriptions. Do not broaden into purchases, stock, production, orders, or automation before sales interpretation acceptance.
