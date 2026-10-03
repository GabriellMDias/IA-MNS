# Live Sales Runtime Verification

[Sales semantics](../domains/sales-chat.md) · [Implementation plan](implementation-plan.md) · [Human actions](human-actions.md)

## Failure and root cause

On 2026-10-01 the owner explicitly authorized reusing the manually configured OPENAI_API_KEY and reported SALES_PROVIDER_UNAVAILABLE after removing SANKHYA_ORACLE_CLIENT_LIB_DIR. No key was created or rotated during diagnosis.

The owner supplied a correlated sales_provider_unavailable event for request req_b9508661-d561-4516-9843-a65288f8d2d0 / error err_87cf46e9-c126-48f1-9bdc-79e411494aa6. Its cause was DPI-1047 at initOracleClient, before obtaining an Oracle connection. This means the native client selected by that process could not be loaded. The event does not reveal its path or distinguish missing libraries from their dependencies or architecture. It has different IDs from the initially reported request; the original event was unavailable, so no exact-ID correlation is claimed.

Separately, a fresh process using the edited environment without a client directory selected Thin mode and failed with NJS-116. Thin supports Oracle 12.1, but not this account's legacy password verifier. A fresh process using the existing compatible Client 19.32 connected successfully in Thick mode to Oracle 12.1.0.2.0 and executed SELECT 1 in a read-only transaction. These constraints are documented in the [official mode comparison](https://node-oracledb.readthedocs.io/en/stable/user_guide/appendix_a.html#password-verifier-support).

The live development listener still failed after correcting the file and reloading source, while fresh-process Oracle and OpenAI checks succeeded. The earlier event also attempted client initialization despite the file's removed setting. Startup/inherited configuration therefore mattered: source hot reload was not an effective environment reset. Only the verified API listener and its watcher were restarted; the existing web server was retained. The restarted API then passed the full real-provider workflow.

## Changes

- Restored only the non-secret Oracle Client directory setting in ignored root .env.local, selecting the already installed compatible Client 19.32. Existing key, password, user, and connection descriptor were preserved. No automatic mode fallback, new installation, password reset, grant, or ERP mutation was performed.
- Added internal provider/stage metadata to sales failures: OpenAI interpretation; Oracle connection, query, or cleanup. Correlated logs retain public provider codes and safe frames. Public error envelopes remain generic and never expose those internal details, raw messages, configuration, credentials, or SQL.
- Added regressions for Thin authentication failure, native client loading failure, OpenAI authentication/no retry behavior, and safe HTTP diagnostic correlation/redaction.
- Updated setup to require a complete development-process restart after environment changes and explain why this account needs Thick. No sales SQL, domain rules, frontend, or product scope changed for this repair.

## Separate provider checks

The configured OpenAI model accepted the existing key and the actual strict plan_sales_query request. It interpreted the original question as net_value, month grouping, product maçã, July 1 through September 30, 2026, without a comparison. No retry, new key, or model substitution was used.

Oracle was tested independently using the same existing credentials. Without an explicit client it failed with NJS-116; with Client 19.32 it connected in Thick, confirmed server version 12.1.0.2.0, and executed SELECT 1, followed by rollback/close. That isolated both native connectivity and authentication from model behavior.

## Real HTTP and reference reconciliation

The real API at loopback port 3000 used its actual OpenAI planner and Oracle adapter. Ten natural-language requests passed. Eight produced sales answers; the other two correctly requested a period or rejected unsupported returns.

| Scenario | Verified interpretation / result shape |
| --- | --- |
| Quanto vendi de maçã por mês nos últimos 3 meses? | July–September 2026, three month rows, 33 considered products. |
| Mostre o valor líquido das vendas de maçãs mês a mês no último trimestre completo. | Same dates, net value, and monthly/product scope. |
| Quais produtos de maçã foram considerados nessa consulta? | Context preserves the original filters; 33 product rows and matched products. |
| Quanto vendi de maçã este mês? | October 1 to date; one aggregate and one product at verification time. |
| Quantos quilos de maçã vendi nos últimos 30 dias? | September 2–October 1 inclusive, QTDNEG times PESOLIQ, one row and 20 products. The unverified ERP weight unit remains explicit. |
| E comparado ao mesmo período do ano passado? | Context preserves July–September monthly filters; compares July–September 2025, 69 unique products across both periods. |
| Qual foi a quantidade vendida de maçã entre julho e setembro de 2026? | Two ERP unit totals; units are not added together. |
| Quanto vendi de maçã? → Nos últimos três meses, separado por mês. | Fixed clarification followed by the correctly scoped monthly query. |
| Some as vendas e devoluções de maçã no mês passado. | Unsupported scope; no partial sales-only answer is substituted. |

All eight numerical answers were reconciled directly with the owner's original SQL, not a replay of the adapter's optimized CTE. The verification adjusted only date bind bounds to include complete days and applied the equivalent product predicate after the original DISTINCT projection. Aggregate rows, exact decimal totals per unit, previous-period values, percentage changes, and considered-product lists matched. Reference reads shared a separate read-only Oracle snapshot after HTTP execution; this is an observed match, not a claim that HTTP and verification used one cross-process snapshot. Only metadata/counts were saved in ignored test-results/live-sales-acceptance.log and .json; no financial values or source records were persisted.

The reference's final TIPMOV = V still excludes returns and bonus sales. “Net value” remains VLRLIQUIDO with the original adjustment precedence; it does not mean revenue after subtracting returns.

## Browser, gates, and remaining controls

The actual browser at the existing Vite server used the generated SDK/proxy and live API, with no network interception. The original question returned HTTP 200, displayed three monthly rows and 33 considered products, and matched an independent original-SQL aggregate. The input became available again without an alert. New conversation deleted the real server context and returned to the welcome screen. No real-data screenshot, trace, or financial output was saved. SESSION_PRIVS still showed seven broad write privileges.

Frozen installation and the complete pnpm validate gate passed after the repair: 86 API tests, 63 web unit tests, 5 browser tests, and 19 end-to-end journeys, plus format, lint, types, architecture, instruction/documentation/configuration/provenance validation, API/SDK/portal reference checks, builds, bundle-secret checks, and process smoke. Evidence is in ignored test-results/validation-live-runtime.log. PJ-08 records completion. Synthetic regression tests remain separate from live-provider acceptance and use no real credentials. No remote CI run is claimed.

The runtime repair does not resolve the DBA's dedicated SELECT-only account, owner confirmation of BRL/PESOLIQ units, the earlier legacy small-fetch investigation, or shared-use identity/deployment controls. These remain PH-08/PJ-05. Live language acceptance now supplements the earlier [readiness audit](mvp-audit.md); it is not approval for shared deployment. Questions use literal description matching, not a semantic product taxonomy. This finite acceptance set does not prove every future natural-language interpretation.
