# ADR-0037: Grant Identified Per-Source Permissions to People and Groups with Data Restrictions

**Status:** proposed
**Date:** 2026-10-20

## Context

Until now IA-MNS had two capability permissions, `sales:read` (Sankhya and VR Master sales together) and `products:read` (both product registrations), granted to one Person at a time by an owner or automatically to people with a Sankhya link ([identity](../domains/identity.md#authorization), [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md)). A grant admitted every row of every source. The owner asked for four changes:

1. groups of people, so permissions can be granted to a group as well as to a person;
2. an identification for every permission, so that when the agent refuses a request it tells the person exactly which permissions to ask support for;
3. permissions separated by source (Sankhya and VR Master);
4. "sub-permissions" inside a permission, such as sales of only some projects, cost centers, companies, stores or buyers, with the possibilities discovered in the ERPs rather than specified by the owner.

The data owners are the sales and product modules, which hold the reviewed ERP queries ([ADR-0027](0027-select-the-sales-source-in-the-interface-and-read-each-source-separately.md), [ADR-0034](0034-apply-verified-product-selections-to-sales-without-materializing-display-lists.md)); identity decides who may read what. Read-only discovery on 2026-10-20 with the Runtime readers found, in the confirmed Sankhya sales of the last 90 days, 17 companies, about 40 item projects (a four-level tree), 40 sellers, 166 product groups (a tree) and 21 result centers; and in the last 30 days of VR Master sales, 2 of 6 stores, 5 sale-time buyers, 5 section cost centers (a three-level tree) and 15 level-1 classification sections. Results computed under a scope must not later be shown to someone who no longer covers it, as already holds for revoked permissions ([ADR-0035](0035-compose-conversations-over-authorized-evidence-and-semantic-tools.md)).

## Decision

1. **One grantable permission per source and data area, each with a stable code.** The catalog is composed from descriptors the owning modules declare: `sales_sankhya:read` (SNK-VEN-01), `sales_vrmaster:read` (VRM-VEN-01), `products_sankhya:read` (SNK-PRD-01) and `products_vrmaster:read` (VRM-PRD-01); owners keep `identity:admin` (IAM-ADM-01). `sales:read` and `products:read` remain as capability permissions that identity derives whenever a source permission of the family is held; they are never granted. Existing grants and saved automatic grants of the former names become the grants of both sources they covered, so nobody gains or loses access.
2. **Restrictions are declared and enforced by the module that owns the data.** Each permission lists the dimensions it can be narrowed by, each with a code. Sankhya sales: company (EMP, `CAB.CODEMP`), project/sector (PRJ, `ITE.AD_CODPROJ` with its subprojects), seller (VEN, `CAB.CODVEND`), product group (GRP, `PRO.CODGRUPOPROD` with its subgroups) and result center (CR, `CAB.CODCENCUS` with the centers below it). VR Master sales: store (LOJ, `venda.id_loja`), sale-time buyer (COM, `venda.id_comprador`), section cost center (CC, with the centers below it) and classification (MER, any mercadológico level with the levels below it). The sales readers add the restriction as a bound predicate to the reviewed reference SQL, filtering rows without changing joins or the DISTINCT projection. Product permissions have no restriction: the registrations are shared by every company and store.
3. **A grant is a conjunction, a person's access a union.** Within a grant, the values of one dimension are alternatives and every restricted dimension must match; a grant without restrictions admits every row. A Person's scope for a permission is the union of its own grant and its groups' grants (any unrestricted grant admits everything). Provider policy grants a permission, unrestricted, only when the Person has no explicit grant of it, so an owner narrows an automatic grant by granting it explicitly. Owners hold everything unrestricted. A grant restricted by a dimension its permission no longer declares cannot be enforced and is ignored.
4. **Groups belong to identity.** Owners create, rename and delete groups, add and remove active members and grant permissions to groups, with the same owner, second-factor and recent-confirmation checks as all administration; every change is audited in its transaction with permission codes and value counts, never labels.
5. **Restriction values are real records.** Owners choose values from a read-only directory the sales module supplies; identity reads each submitted value back from the source and stores its label, so neither codes nor labels come from the browser.
6. **Access is computed now and carried with each turn.** The agent, the legacy sales route and the WhatsApp channel obtain the current permissions and scopes of the principal from identity through a composition port instead of trusting the access-token scopes alone, so narrowing or revocation applies to the next request. Tokens keep the permission strings only.
7. **Denials are identified and server-written.** When a request needs a source the person may not read, the agent answers with a fixed message listing each missing permission's code, title and source and asking the person to give the codes to support; in conversational mode the model can only request this answer through a dedicated tool, never phrase it. A selected source that is denied appears in the answer as a denied section beside the others. A product selection that names a sale-time buyer outside the person's VR Master scope is refused with the permission and the exact values support must release. Every restricted result records its scope and carries a caveat that it is not the source's total; history and evidence are shown only to readers whose current scope covers the recorded one.

## Rationale

Splitting permissions by source matches how the business sees the data (MNS in Sankhya, Pilar da Terra in VR Master) and how restrictions differ between them; a single permission with a "source" restriction would have mixed dimensions of two ERPs in one grant. Keeping derived capability permissions avoids rewriting every capability gate and the readability of existing history, while per-source checks happen where each source is read.

Declaring dimensions with the queries that enforce them keeps identity free of ERP knowledge and makes an undeclared dimension impossible to grant. Filtering inside the reviewed SQL, rather than filtering returned rows, means totals are computed only from admitted rows and no unadmitted row leaves the ERP. The union-of-conjunctions model is the exact meaning of "this group sees company 1, and this person also sees seller 12"; flattening it per dimension would grant combinations nobody granted.

Computing access now per request costs one identity read per agent request, but it gives immediate revocation, which a 10-minute token cannot, and avoids putting value lists into tokens. Server-written denials guarantee that the codes support receives are exact; a model could omit or invent them.

## Alternatives Considered

### Restrictions in the access token

Putting the scopes into a token claim would avoid the identity read, but it would delay revocation by the token lifetime, enlarge every token with value lists, and require the shared verifier to understand an IA-MNS-specific claim.

### One permission with a source restriction

Keeping `sales:read` and treating the source as a restriction dimension would avoid renaming grants, but would put Sankhya and VR Master dimensions in one grant, make codes depend on restrictions, and contradict the owner's request to separate permissions by source.

### Product registration restrictions

Restricting product lookup by classification, buyer or cost center was considered and deferred: the registration is shared and not financial, and enforcing it would require changes across candidate search, counts and examples of both resolvers. Sales figures, the sensitive data, are restricted.

## Consequences

### Positive

- Owners grant once to a group, narrow any grant to real ERP records, and see where each effective permission comes from; people see their own codes in Minha conta.
- Refusals tell the person and support exactly what to release, on the web and on WhatsApp.
- Restricted figures are computed in the ERP from admitted rows only and are labeled as partial.

### Negative

- Each agent and legacy sales request reads the Person's grants and groups from the database.
- Hierarchical restrictions are compared as selected when checking history coverage; an equivalent narrower restatement can hide older answers. Conflicts between a product selection and a restriction are detected only for VR Master buyers; for hierarchical dimensions the restricted SQL still applies and the caveat explains it.
- Consolidating two Persons can keep only the surviving Person's restricted grant when two restricted grants cannot be united exactly.
- History computed before a restriction existed is unrestricted and is no longer shown to a person whose access becomes restricted.

### Operational or Migration Impact

- Two migrations: an additive one for groups and restrictions and a data step converting `sales:read`/`products:read` grants and the saved automatic grants. The data step is not reversible in place; an older application needs a backup restore. `IA_MNS_PROVIDER_GRANTS=sankhya:sales:read` keeps its meaning.
- The Sankhya restriction by result center needs `SELECT` on `TSICUS` for the Runtime reader, prepared in the reviewed grant template and awaiting the owner ([PH-36](../project/human-actions.md#ph-36)); until then that dimension cannot be granted.
- Whether a Sankhya link should keep granting VR Master sales automatically is the owner's decision ([PH-13](../project/human-actions.md#ph-13)); the default preserves the previous behavior.

## References

- [Identity](../domains/identity.md#authorization) and [sales](../domains/sales-chat.md) domains
- [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0027](0027-select-the-sales-source-in-the-interface-and-read-each-source-separately.md), [ADR-0028](0028-administer-operational-parameters-separately-from-secrets-and-bootstrap-configuration.md), [ADR-0033](0033-use-one-reader-and-the-existing-administrator-per-erp.md), [ADR-0035](0035-compose-conversations-over-authorized-evidence-and-semantic-tools.md), [ADR-0036](0036-add-whatsapp-as-an-agent-channel-authorized-by-owner-linked-numbers.md)
- [ERP database access](../security/erp-database-access.md)
