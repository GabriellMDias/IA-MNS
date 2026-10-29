# ERP Runtime Access Verification

[Access policy](../security/erp-database-access.md) · [Human actions](human-actions.md) · [Implementation plan](implementation-plan.md#current-work)

## Owner authority and applied scope

On 2026-10-11 the owner supplied the existing administrative credentials in ignored `.env.discovery`, configured the existing Runtime accounts and explicitly authorized the minimum access needed by the current application. This is separate from read-only Discovery. No account or password was created, replaced or rotated; no business-table rows were written and no application migration was run against an ERP.

Source review covered the actual composed sales/product adapters and the Sankhya identity directory. The executable canonical grant templates are [Sankhya](../../apps/api/scripts/erp-access/sankhya-runtime.sql) and [VRMaster](../../apps/api/scripts/erp-access/vrmaster-runtime.sql); their placeholders are resolved privately from the connected environment. The access tool validates object existence, target accounts, Oracle owner/name resolution and existing grants before execution. It refuses conflicting synonyms or an existing directory view with a different projection.

| Runtime     | Applied access                                                                                                                                                                       | Retained restrictions                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IA_MNS_RO` | `CREATE SESSION` already existed. Added `SELECT` on 24 existing sales/product/dictionary tables, 24 private synonyms, and `SELECT`/synonym for the new `IA_MNS_USER_DIRECTORY` view. | No ERP table/view ownership, broader system roles, ANY privileges, grant option, DML, DDL or procedure grants to Runtime. No raw `TSIUSU` access.                                           |
| `ia_mns`    | Preserved the nine sales-reference table reads and added 11 column reads across `produtocomplemento`, `tipoembalagem` and `familiaproduto` under PH-27.                              | No new ownership, role administration, memberships, table-write or whole-table grants on those three registrations. Other columns, including prices/costs/stock, remain inaccessible there. |

The Oracle directory view is owned by the existing ERP schema and exposes only `CODUSU`, `NOMEUSU`, `NOMEUSUCPLT`, `EMAIL` and `DTLIMACESSO`. `SANKHYA_DIRECTORY_VIEW=IA_MNS_USER_DIRECTORY` was added to ignored `.env.local`, preserving all other settings and credential values. Restart an already running API to ingest this setting; no deployment or restart of external services was performed.

Oracle executed 51 scoped DDL/grant statements: 25 SELECT grants, 25 synonyms and one view. They are not transactionally reversible; rerunning the planner found zero missing statements. PostgreSQL applied three column-grant statements in one transaction, preserving `PUBLIC`. Before/after metadata and operation reports are kept only in ignored `apps/api/evals/.local/runtime-access`; public evidence omits real schemas, hosts, account secrets, record values and personal data.

## PostgreSQL security dependency

Actual ACL inspection found `CREATE` on the connected database and `public` schema, plus `TEMPORARY`, granted to `PUBLIC`. Therefore `ia_mns` inherits them despite having no privileged role attributes, memberships, object ownership or effective write privileges on existing `public` tables. Revoking them directly from `ia_mns` cannot deny the inherited permissions.

The owner explicitly instructed **preserve PUBLIC and record the security dependency**. No global ACL was changed. [PH-30](human-actions.md#ph-30) tracks a coordinated review with the other ERP clients before any global restriction. Do not claim this account is strictly SELECT-only at the effective DDL boundary or that `default_transaction_read_only=on` guarantees it. Current fixed application queries continue using bounded read-only transactions; this does not resolve the inherited capability.

## Live verification and limits

- Both existing Runtime credentials authenticate. Oracle changed from zero to 24 readable required tables; its guard sees only `CREATE SESSION` and object `SELECT`, without runtime table ownership or roles. The directory projection is separately readable.
- Actual Oracle and PostgreSQL sales adapters executed a bounded one-day total query successfully. Only pass/fail was emitted; no totals or record values were exported to console or AI.
- The actual Sankhya directory adapter executed its five-column query with a random non-personal search. Native metadata verified exactly those five columns and a zero-row read of the raw TSIUSU table was refused (a read-denial check, not a write probe). No personal records were exposed.
- `products:sankhya:sync --runtime-check` reported zero problems without promoting the restricted-visibility snapshot. `products:sankhya:regression --runtime` passed 14 real read-only checks, including exact-set SQL comparisons and the reader guard. Two pre-existing unsupported scenarios remain: additional classification and buyer semantics. No model was called.
- `products:catalog` passed with the VRMaster Runtime account. PH-27 columns are now readable; the catalog records the three paths as awaiting validation, preserving their unavailable behavior and identical model instructions. This grant task does not activate new product semantics; [PJ-36](implementation-plan.md#current-work) remains the corresponding follow-up.
- Replanning both ERPs reported zero missing changes. Credential files remain ignored, and normal application loading never reads either administrative file.

These checks establish actual access and finite reader behavior, not broad business reconciliation, BRL/weight-unit confirmation, production approval or an authenticated real-ERP browser acceptance. PH-08 retains its remaining business confirmations. Local full-validation evidence is recorded in PJ-41.

## Local repository validation

Complete `pnpm validate` passed: 410 API tests, 63 web unit tests, 12 browser component tests and 35 end-to-end journeys, builds, internal HTTPS smoke and all static/generated-reference checks. The installed Git OpenSSL directory was added only to the validation process PATH. Grant-scope tests derive the 24 Oracle dependencies from actual sales SQL, enabled catalog paths and dictionary queries; they protect the five-column view and PostgreSQL column-only scope without changing PUBLIC. File-selection tests cover both administrative filenames without merging or Runtime fallback. No remote CI or deployment was run.

## Post-release access verification on 2026-10-29

After the owner reported a product-consultation failure following deployment of `ia-mns-v1.1.0`, the owner explicitly authorized checking both existing ERP readers with the existing administrative credentials and applying missing reviewed access. The local Runtime configuration selects the connection targets; this does not independently attest that the production server uses the same endpoints or settings.

The reviewed planner found exactly two missing Oracle statements: the `SELECT` on `TSICUS` and its private synonym for `IA_MNS_RO` (PH-36). Both were applied. PostgreSQL needed no changes. A fresh plan reported zero missing statements for both ERPs. No accounts, passwords, PUBLIC privileges, business rows or migration history were changed.

Fresh verification passed:

- Oracle access audit: all 24 original required tables readable, no missing reads, effective privileges limited to `CREATE SESSION` and object `SELECT`, no runtime roles or owned tables.
- PH-36: all six required `TSICUS` columns are readable using a zero-row query; the private synonym points to the expected local table without a database link.
- Both actual sales adapters, the five-column Sankhya directory adapter and the directory-projection/raw-`TSIUSU`-denial check passed.
- `products:sankhya:sync --runtime-check` reported zero enabled-capability metadata problems without promoting the snapshot.
- `products:sankhya:regression --runtime` passed 14 checks; additional classification and buyer remain the same two unsupported scenarios. No AI calls were made or record values printed.
- `products:catalog` passed against VRMaster with no error findings. The three pending registration dimensions remain unactivated.
- The three focused `erp-runtime-grants.test.ts` tests passed; documentation validation and generated-reference checks cover the evidence update. The full application validation gate was not rerun for this documentation-only follow-up.
- PostgreSQL effective-ACL audit: no privileged role flags, memberships, owned/writable public objects; the pre-existing PUBLIC CREATE/TEMP inheritance remains PH-30 and was preserved.

These results establish current reader access and product-source operation from this workstation. They do not prove that missing TSICUS access caused the reported product error: PH-36 supports sales result-center restrictions. Owner retesting on the server is still required; if it fails, correlate the server diagnostic and verify its Runtime configuration rather than broadening database privileges. No deployment or server restart was performed. The immutable release tag and durable release registry remain unchanged.
