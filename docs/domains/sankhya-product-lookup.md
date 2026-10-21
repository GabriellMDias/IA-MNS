# Sankhya Product Lookup

[Product lookup](product-lookup.md) · [Resolver architecture](../architecture/semantic-product-resolution.md) · [Implementation plan](../project/implementation-plan.md) · [Read-only account](../project/human-actions.md#ph-08)

This page owns Sankhya product semantics, discovery evidence, adapter differences and remaining validation. The executable knowledge is the [reviewed catalog](../../apps/api/src/features/products/sankhya/catalog.ts) and the generated [metadata snapshot](../../apps/api/src/features/products/sankhya/snapshot.ts). The shared resolver remains the one introduced for VR Master under [ADR-0032](../adr/0032-resolve-product-selections-through-a-verified-semantic-catalog.md).

## Availability and scope

The adapter identifies physical `TGFPRO` registrations through the existing `products` capability and the SNK-PRD-01 permission (`products_sankhya:read`). Choose **MNS (Sankhya)** in the source selector. When both adapters are configured, **Tudo** asks for one ERP: product codes, selections and pending choices remain independent. It does not calculate sales, quantities, conversion factors, prices, stock, legal certificate validity or availability by company.

The configured privileged account is authorized for local discovery only. The runtime refuses ERP object owners and accounts with privileges beyond CREATE SESSION and object SELECT, before executing product queries. The subsequent [owner-authorized provisioning](../project/runtime-access-verification.md) granted the existing `IA_MNS_RO` account its minimum access and verified Runtime execution; PH-08 retains business confirmations. No ERP grants, writes, migrations or procedures were executed. The later [ERP access decision](../security/erp-database-access.md) separates administrative Discovery credential delivery from runtime; actual Runtime grant verification is recorded separately.

## Dictionary and physical discovery

The [official Data Dictionary documentation](https://developer.sankhya.com.br/docs/dicion%C3%A1rio-de-dados) describes the entity mappings, relationship expressions, calculated fields and properties that must accompany physical metadata. Read-only Oracle discovery on 2026-10-11 reconciled:

| Structure | Captured knowledge |
| --- | --- |
| `TDDTAB` | Physical table names and business descriptions |
| `TDDCAM` | Field names, descriptions, calculated/custom flags and expression fingerprints |
| `TDDINS` | Instance ids/names, inheritance, active state, expression fingerprints and key-script presence |
| `TDDLIG` | Origin/target instances, direction, mandatory flag, relationship/instance-rule fingerprints |
| `TDDLGC` | Every mapped field pair, including composite keys |
| `TDDOPC` | Stored values and descriptive labels, joined through field ids |
| `TDDPCO` | Additional property names and value fingerprints, including possible interceptors/security rules |
| Oracle native catalogs | Actual column types/nullability, PK/unique/FK column positions and enabled/validated status, indexes and local synonym resolution |

`TGFPRO` has 444 physical columns, 412 dictionary fields and ten custom dictionary fields. Four dictionary fields are calculated (including `TIPO`); none are used by runtime projections. Product-table metadata describes 22 instances and 160 outgoing instance relationships, 63 of which carry relationship/target expressions, conditions or key scripts requiring separate review. The bounded product frontier covers 11 tables, 928 physical columns and 267 outgoing dictionary relationships. The snapshot preserves edges beyond the frontier as discovered candidates; it does not expose them as executable joins. Related tables are `TGFGRU`, `TGFMAR`, `TGFVOL`, `TGFVOA`, `TGFPAP`, `TGFPAR`, `TGFCLP`, `TGFCLA`, `TSICUS` and custom `AD_LISTADCEMB`. The frontier was selected from actual product mappings and relevant two-hop paths; synchronization does not crawl the entire ERP or automatically expand this reviewed scope.

Dictionary expressions, BeanShell, UI reference parameters and key scripts are never executed. Raw expressions/property values are fingerprinted rather than included in the tracked snapshot or model prompt. Metadata contains no ERP product/partner rows, credentials, connection descriptors or database-owner names.

### Physical registration and JAPE instances

`Produto` is instance 27, with a dynamic `TSIPAR`-dependent `SERVFILUSOPROD` expression governing service usage `S` and excluding usage `3`; `Servico` is a separate instance (29). Product instance descendants inherit additional rules. These are entity semantics, not unconditional SQL relationships. The adapter explicitly queries physical `TGFPRO`, including services/tariffs, and explains that scope in every answer. It does not claim parity with JAPE `Produto`.

`USOPROD` has 15 descriptive options in `TDDOPC`. Actual registrations also contain `S` (107 rows) and `3` (seven rows), without descriptive options there. Those codes remain included in an unrestricted physical registration query, but are not invented as named domain filters. Complete dictionary option labels take precedence over qualified partial matches; multiple remaining matches require clarification.

## Verified relationship graph

Every executable edge records source/destination, all join pairs, conditions, cardinality, meaning, dated evidence, dictionary instance ids, physical constraint and confidence in the catalog. The following edges have high confidence for physical joins; dictionary/JAPE rules are assessed separately.

| Path from product | Join and cardinality | Verified evidence and interpretation |
| --- | --- | --- |
| Group | `TGFPRO.CODGRUPOPROD → TGFGRU.CODGRUPOPROD`, many-to-one | Every one of 10,959 products has a valid group; FK and instance mapping agree |
| Group ancestors | `TGFGRU.CODGRUPAI → CODGRUPOPROD` | 672 nodes, maximum depth three; explicit parent ids, including negative root sentinel and special group zero; no numeric prefix assumption |
| Registered brand | `CODMARCA → TGFMAR.CODIGO`, many-to-one | All non-null values reference unique brands; 100 assigned brand ids, distinct from 114 free-text `MARCA` values |
| Base / purchase unit | `CODVOL` / `CODVOLCOMPRA → TGFVOL.CODVOL`, many-to-one | Enabled validated FKs; string key `VARCHAR2(2)`; purchase unit may be absent |
| Alternate unit | `CODPROD → TGFVOA.CODPROD → TGFVOL.CODVOL`, one-to-many then many-to-one | 18,185 rows cover 4,909 products; composite registration PK `(CODPROD,CODVOL,CONTROLE)` |
| Linked supplier | `CODPROD → TGFPAP.CODPROD`, then `CODPARC → TGFPAR.CODPARC` | 8,956 registrations cover 3,746 products; link PK `(CODPARC,CODPROD,SEQUENCIA)`; explicit `FORNECEDOR='S'` condition enforces supplier meaning |
| Additional classification | `CODPROD → TGFCLP → TGFCLA.CODCLASSIF` | Physical FKs and mapped pairs agree, but both tables are empty; dimension disabled pending nonempty validation |
| Custom packaging list | Product → group, `TGFGRU.AD_CODLISTADC → AD_LISTADCEMB.CODLISTA` | Custom FK and mapped pairs agree; 300 groups assign seven nonzero lists; immediate-group assignment only |

The product-to-alternate-unit and product-to-partner-link mappings carry the reviewed `@ref-param[include-in-deep-copy=true]` annotation. Only its exact known fingerprint is accepted as a harmless copy annotation. Arbitrary relationship expressions cannot enter compilation. The preferred-supplier instance instead carries a supplier expression; it is not silently promoted to a general join.

The group parent graph is validated for duplicate keys, cycles, missing positive parents and depth above eight. Oracle traverses explicit parents with `CONNECT BY NOCYCLE`, also bounded to eight. Source nodes carry their actual ancestor ids so the shared resolver can compare containment without ERP-specific arithmetic. Composite bridge registrations retain every mapped join pair; named-value lookup currently requires a single key.

## Filtering capabilities

| Enabled dimension | Meaning and limitations |
| --- | --- |
| Group / category | Named group and descendants; candidate discovery also uses product descriptions and synonyms |
| Registered brand | `CODMARCA` registration; free-text brand is not substituted |
| Base unit | Main registered unit; KG does not imply the VR Master weighable flag |
| Purchase unit | Purchase unit on the current product registration |
| Alternate unit | Any registered alternate unit, active or inactive; no conversion or control selection |
| Linked supplier | Product-partner association with supplier role; neither preferred supplier nor purchase history |
| Product usage | Only descriptive options found in the official dictionary |
| Active | Current product `ATIVO='S'`; no company/store availability inference |
| Description | Literal whole-word text, case/accent insensitive |
| Characteristics | Literal text in `CARACTERISTICAS`, populated on 306 products; independent of description |
| EPI certificate | Literal additional field `AD_CA`, dictionary description CA E.P.I., populated on 26 products |
| Additional-packaging list | Custom list assigned directly to the immediate group; no inherited pricing or discounts |

Filters combine through the shared validated selection AST, with null-safe exclusions and nested `EXISTS` for one-to-many paths. Products are never multiplied by alternative-unit or supplier registrations. Supplier candidate retrieval enforces the same supplier-role predicate as final execution. Supplier values may identify natural persons; candidate names stay out of model input and are resolved through the existing deterministic choice mechanism.

Not established: buyer responsibility, manufacturer, meaningful cost-center classification, preferred supplier, additional classification on nonempty data, computed fields, company-dependent instance rules, barcode selection, packaging conversion and inheritance. `CODPARCFORN` and product `CODCENCUS` contain only zero, `CODFAB` is empty, and custom `AD_CODUSU` identifies the last editing user, not a buyer. Names alone are insufficient evidence. No relationship was invented to satisfy these questions.

## Execution and native API evaluation

The Oracle adapter owns a pool of at most two connections (queue four, acquisition timeout five seconds), `SET TRANSACTION READ ONLY`, rollback and cancellation, a 15-second per-call timeout and a 30-second operation budget. Results/metadata have explicit row bounds, product lists stop at 200, group nodes at 2,000 and candidates at 60. Identifiers come from the reviewed catalog; all user values are binds. SQL is compiled from the validated AST and never provided by the model. Runtime verification checks used physical/dictionary definitions, keys, mapped relationships, properties, domain options and readable projections before first use and every ten minutes.

[CRUDServiceProvider.loadRecords](https://developer.sankhya.com.br/reference/get_loadrecords) supports root entities, entity paths, parameterized criteria, pagination and calculated-field selection. It could preserve native instance rules and calculated values better than direct physical SQL. However, `ignoreCalculatedFields` defaults to false, `modifiedSince` depends on change logging, and file-based pagination uses server storage. Entity reads may involve application hooks, rules and authorization different from SQL. A documented read endpoint alone does not establish strict absence of side effects in this installation.

Direct read-only SQL is implemented for these verified physical filters and consistent count/list snapshots; nested existence predicates avoid collection expansion. Native API execution is deferred until a separately authorized least-privilege API identity and read-side behavior can be validated. No database credentials were transmitted to the API and no API call was made. Future calculated/JAPE-dependent capabilities should compare authorized API results with known entity behavior rather than translate raw dictionary expressions into SQL.

## Minimum runtime account

Human action **PH-08** originally requested provisioning of the dedicated non-owner runtime account `IA_MNS_RO`. The existing administrator remains the Administration/Discovery user; do not create a third account. The current product implementation requires exactly `CREATE SESSION` and object `SELECT` on these **15 tables**, with private local synonyms of the same names:

| Purpose | Required tables |
| --- | --- |
| Enabled product paths | TGFPRO, TGFGRU, TGFMAR, TGFVOL, TGFVOA, TGFPAP, TGFPAR, AD_LISTADCEMB |
| Dictionary verification | TDDTAB, TDDCAM, TDDINS, TDDLIG, TDDLGC, TDDOPC, TDDPCO |

Native metadata/guard queries use the normally available `ALL_TAB_COLUMNS`, `ALL_CONSTRAINTS`, `ALL_CONS_COLUMNS`, `ALL_INDEXES`, `ALL_IND_COLUMNS`, `USER_SYNONYMS`, `SESSION_PRIVS`, `USER_TAB_PRIVS_RECD`, `ROLE_TAB_PRIVS`, `SESSION_ROLES` and `USER_TABLES` views. No SELECT ANY TABLE, SELECT ANY DICTIONARY, SELECT_CATALOG_ROLE, CONNECT/RESOURCE/DBA role, procedure execution, object creation, tablespace quota or grant option is required. The DBA creates the private synonyms; **do not grant CREATE SYNONYM to the reader**. TGFCLP, TGFCLA and TSICUS require no runtime table grant. Account-visible metadata for those disabled candidates may consequently be absent.

Oracle grants SELECT at table/view level; the current adapter does not support substituting projection views for these reviewed physical tables. Therefore the database account can read all columns of those 15 objects, while the backend executes only reviewed projections (for TGFPAR: CODPARC, NOMEPARC and FORNECEDOR). These are the minimum grants for the current implementation, not column-level database isolation. Synonyms provide naming, not authorization. [Oracle's privilege guidance](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/dbseg/configuring-privilege-and-role-authorization.html) explains object grants and synonym resolution.

The following commands are **for the DBA to review and execute privately**, not an agent-executed migration. `ERP_OWNER` denotes the owner of the actual Sankhya tables, not a runtime login; the DBA can locate it with `SELECT OWNER FROM DBA_TABLES WHERE TABLE_NAME = 'TGFPRO'`. Use the owner of this environment if multiple schemas contain that name. Run in the existing ERP database/service using the DBA's established account-management procedure, with spooling/terminal recording disabled; do not save a substituted password in a script:

```sql
SET ECHO OFF
SET VERIFY OFF
DEFINE ERP_OWNER = <actual_erp_schema>
ACCEPT reader_password CHAR PROMPT 'New dedicated reader password: ' HIDE
CREATE USER IA_MNS_RO IDENTIFIED BY "&reader_password";
UNDEFINE reader_password
GRANT CREATE SESSION TO IA_MNS_RO;

GRANT SELECT ON &ERP_OWNER..TGFPRO TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFGRU TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFMAR TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFVOL TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFVOA TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFPAP TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFPAR TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..AD_LISTADCEMB TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDTAB TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDCAM TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDINS TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDLIG TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDLGC TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDOPC TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TDDPCO TO IA_MNS_RO;

CREATE SYNONYM IA_MNS_RO.TGFPRO FOR &ERP_OWNER..TGFPRO;
CREATE SYNONYM IA_MNS_RO.TGFGRU FOR &ERP_OWNER..TGFGRU;
CREATE SYNONYM IA_MNS_RO.TGFMAR FOR &ERP_OWNER..TGFMAR;
CREATE SYNONYM IA_MNS_RO.TGFVOL FOR &ERP_OWNER..TGFVOL;
CREATE SYNONYM IA_MNS_RO.TGFVOA FOR &ERP_OWNER..TGFVOA;
CREATE SYNONYM IA_MNS_RO.TGFPAP FOR &ERP_OWNER..TGFPAP;
CREATE SYNONYM IA_MNS_RO.TGFPAR FOR &ERP_OWNER..TGFPAR;
CREATE SYNONYM IA_MNS_RO.AD_LISTADCEMB FOR &ERP_OWNER..AD_LISTADCEMB;
CREATE SYNONYM IA_MNS_RO.TDDTAB FOR &ERP_OWNER..TDDTAB;
CREATE SYNONYM IA_MNS_RO.TDDCAM FOR &ERP_OWNER..TDDCAM;
CREATE SYNONYM IA_MNS_RO.TDDINS FOR &ERP_OWNER..TDDINS;
CREATE SYNONYM IA_MNS_RO.TDDLIG FOR &ERP_OWNER..TDDLIG;
CREATE SYNONYM IA_MNS_RO.TDDLGC FOR &ERP_OWNER..TDDLGC;
CREATE SYNONYM IA_MNS_RO.TDDOPC FOR &ERP_OWNER..TDDOPC;
CREATE SYNONYM IA_MNS_RO.TDDPCO FOR &ERP_OWNER..TDDPCO;
```

The **same configured Sankhya login also serves existing sales**. Before replacing its credentials for a combined products/sales runtime, the DBA also reviews and executes these nine additional grants (**24 objects total**), using the same owner definition:

```sql
GRANT SELECT ON &ERP_OWNER..TGFCAB TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFTOP TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFVEN TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFITE TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TSIEMP TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TCSPRJ TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..TGFVAR TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..AD_MOTIVODEV TO IA_MNS_RO;
GRANT SELECT ON &ERP_OWNER..AD_RESULTADO_LOTE TO IA_MNS_RO;
CREATE SYNONYM IA_MNS_RO.TGFCAB FOR &ERP_OWNER..TGFCAB;
CREATE SYNONYM IA_MNS_RO.TGFTOP FOR &ERP_OWNER..TGFTOP;
CREATE SYNONYM IA_MNS_RO.TGFVEN FOR &ERP_OWNER..TGFVEN;
CREATE SYNONYM IA_MNS_RO.TGFITE FOR &ERP_OWNER..TGFITE;
CREATE SYNONYM IA_MNS_RO.TSIEMP FOR &ERP_OWNER..TSIEMP;
CREATE SYNONYM IA_MNS_RO.TCSPRJ FOR &ERP_OWNER..TCSPRJ;
CREATE SYNONYM IA_MNS_RO.TGFVAR FOR &ERP_OWNER..TGFVAR;
CREATE SYNONYM IA_MNS_RO.AD_MOTIVODEV FOR &ERP_OWNER..AD_MOTIVODEV;
CREATE SYNONYM IA_MNS_RO.AD_RESULTADO_LOTE FOR &ERP_OWNER..AD_RESULTADO_LOTE;
```

If owner association of real Sankhya users is configured, separately preserve SELECT and naming for `SANKHYA_DIRECTORY_VIEW` as requested in PH-08; that view is not needed for product resolution or existing IA-MNS local sign-in. None of these grants permits writes, DDL or execution by the reader.

The DBA/owner puts only the new reader username/password in the existing ignored `.env.local` settings `SANKHYA_DB_USER` / `SANKHYA_DB_PASSWORD`, preserves the host/service and Oracle Client settings, and keeps the existing administrator credentials only in `.env.discovery.local` using `SANKHYA_DB_USER_FULLACESS` / `SANKHYA_DB_PASSWORD_FULLACESS`, outside normal runtime configuration. No secret is sent through chat. Then run these **read-only** checks and restart the application:

```sh
pnpm -C apps/api products:sankhya:sync --runtime-check
pnpm -C apps/api products:sankhya:regression --runtime --model
```

`--runtime-check` enforces the real privilege guard and compares only enabled dependencies. It neither promotes nor writes a partial discovery snapshot. This avoids reporting the reader's narrower ALL_* visibility as full-schema drift. `--runtime` makes the complete regression use the strict reader; a privileged-account refusal is a failure in that mode, not an acceptance success. Neither check replaces the final authenticated UI journey. No new account/grants have been executed; current runtime remains blocked.

The existing `IA_MNS_RO` account now has all 24 table reads, corresponding private synonyms and the five-column directory view. [Live verification](../project/runtime-access-verification.md) passed the privilege guard, metadata check and 14 Runtime regression checks without AI calls. The old manual examples above remain provisioning reference; the [canonical executable template](../../apps/api/scripts/erp-access/sankhya-runtime.sql) and owner-authorized access tool own current application.

## Reproducible synchronization

Discovery commands explicitly load the existing administrator from `.env.discovery.local`; `--runtime-check` and `--runtime` load only runtime settings and never read that file. Missing administrative credentials fail without fallback. [Setup](../setup.md#erp-discovery) owns delivery and [ERP access policy](../security/erp-database-access.md) owns permitted operations and confidentiality.

From the repository root, existing ignored `.env.local` supplies the configured Oracle connection and optional Oracle Client directory. No credentials are copied into the catalog.

| Command | Behavior |
| --- | --- |
| `pnpm -C apps/api products:sankhya:sync` | Refreshes bounded metadata into ignored `evals/.local/sankhya/metadata-candidate.json` and `.ts.txt`; reports counts, complete fingerprint drift and used-metadata problems |
| `pnpm -C apps/api products:sankhya:sync --check` | Exits nonzero for any snapshot drift or used-metadata problem |
| `pnpm -C apps/api products:sankhya:sync --write-reviewed` | Promotes metadata after review only when current used metadata remains compatible; never enables a capability |
| `pnpm -C apps/api products:sankhya:sync --runtime-check` | Requires a SELECT-only non-owner account, verifies enabled metadata without promoting a partial-visibility snapshot |
| `pnpm -C apps/api products:sankhya:regression` | Runs bounded real-data scenarios, independent SQL symmetric-difference/count checks, ambiguity discovery and runtime-account refusal check |
| `pnpm -C apps/api products:sankhya:regression --model` | Also validates natural-language requests with the existing authorized OpenAI configuration |
| `pnpm -C apps/api products:sankhya:regression --runtime --model` | Requires the strict runtime reader throughout; validates real filters and language with the interactive product timeout |

Changes to used columns, dictionary expressions/properties, unique keys, verified FK/mapping definitions or domain labels fail closed. Additive unused metadata is retained as a candidate and reported by synchronization, without disabling compatible runtime filters. Promotion does not establish business semantics: inspect changed evidence, review executable paths/conditions, bump the semantic catalog version, extend focused tests and live scenarios, and run the complete repository gate. Version changes invalidate persisted Sankhya selections. For incompatible changes, the generated local candidate supplies the snapshot in a reviewed code change together with the changed catalog, version and tests; the safe promotion command refuses to overwrite the existing artifact while used metadata is incompatible. Never edit generated field facts independently of a fresh candidate.

The model receives a small semantic dimension guide and at most six relevant authorized capability descriptions through [targeted metadata retrieval](../../apps/api/src/features/products/metadata-retrieval.ts), not the raw dictionary. The capability permission authorizes the reviewed dimension set; future finer authorization must narrow the passed allowlist.

## Validation evidence and remaining work

Live scenarios compare exact product-id sets through independently written SQL `MINUS` in both directions and separately verify totals and absence of duplicate output codes. Current scenarios cover description (382 products), a top group including descendants (573), base KG (794), alternate KG (3,035), active resale plus BATATA description (97), KG exclusion including nulls (10,165), registered brand (17), linked supplier (3,560), custom certificate (two) and custom group list (199). Fixture ids and certificate values are derived locally rather than committed. The characteristics ALGODAO case currently returns zero: it verifies empty-result semantics only, not a nonempty match. Counts are dated observations, not fixed assertions about future ERP data.

On 2026-10-11, the final discovery regression passed 23 checks with two unsupported scenarios: all 11 independent-SQL cases, three live ambiguity/supplier-role/account checks, and all nine model scenarios (seven exact-set comparisons, ambiguous real unit clarification and safe refusal of buyer responsibility). It uses the same bounded 30-second product request budget as runtime. Full metadata synchronization found no drift; strict `--runtime-check` refused the current privileged account as expected. A dedicated runtime account has not yet been validated. Local reports contain pass/fail/unsupported outcomes and timings under ignored `apps/api/evals/.local/sankhya/`; they are regenerated each run. Unit tests cover compiler safety, string/composite keys, metadata drift, bounded adjacency traversal, privilege refusal/rollback/cancellation, targeted retrieval and ERP-isolated conversation state. VR Master regression suites remain intact. The [combined acceptance evidence](product-lookup.md#verification) records 83 focused resolver tests and the complete passing `pnpm validate` in the actual working tree, plus the final live routing run. No remote CI or production validation was run, and no authenticated real-ERP browser acceptance is claimed.

Warm source-plus-independent-comparison scenarios initially took approximately 0.5–1.6 seconds; first schema verification added approximately three seconds. These are end-to-end validation timings including reference queries and network overhead, not isolated SQL benchmarks. Group candidate discovery scans product descriptions and aggregates the group graph; unindexed regular expressions, correlated multi-hop existence predicates, full counts and metadata synchronization are the expensive paths. Timeouts and bounds fail safely rather than return incomplete exact totals. Execution-plan analysis under a production-like least-privilege account and larger datasets remains open; no index was changed.

Remaining work: complete the PH-08 currency/weight confirmations; validate API entity behavior if needed; extend the reviewed frontier and regression with newly meaningful business data; establish nonempty additional-classification and characteristics scenarios; broaden Sankhya business reconciliation for product concepts and qualifiers such as fresh versus processed (current live cases validate explicit description and named-group intent); define requested concepts only where evidence supports them. No production deployment, native API parity or complete ERP-wide capability discovery is claimed.
