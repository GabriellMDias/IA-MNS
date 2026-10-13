# ADR-0034: Apply Verified Product Selections to Sales without Materializing Display Lists

**Status:** proposed
**Date:** 2026-10-12
**Extends:** [ADR-0032](0032-resolve-product-selections-through-a-verified-semantic-catalog.md), [ADR-0018](0018-bound-natural-language-sales-to-a-read-only-query-capability.md), [ADR-0027](0027-select-the-sales-source-in-the-interface-and-read-each-source-separately.md).

## Context

The owner requested integration of the existing resolver with sales. Product answers list at most 200 registrations, while a valid classification or indirect filter can identify thousands. Passing that display list to sales would silently undercount. The registration catalogs already own reviewed relationships, semantics, validation and compilers; sales owns its reference grain, monetary/quantity/weight definitions and date bounds.

## Decision

The implementation under review composes a product-owned coordinator through a sales-owned resolution port. The resolver interprets only the product conditions of an otherwise validated sales request and retains its existing grounding and ambiguity rules. Its adapter revalidates access/metadata and compiles complete key membership. The sales adapter adds this internal, bound key subquery as a semi-join to its reference SQL. Neither model nor HTTP caller supplies SQL, identifiers or product codes.

Membership uses the current registration at execution, equally for both comparison periods. A current product buyer filter does not become a historical sale-time buyer filter. Existing monetary measures, reference joins, unit handling and transaction limits remain authoritative. A scoped request chooses one ERP; ordinary literal sales retain the existing independent `Tudo` behavior. Explicit references can reuse a same-source, catalog-versioned lookup; unrelated new sales do not inherit it. Semantic sales requires both existing permissions on every turn.

## Rationale

This completes the separation in ADR-0032 without making sales depend on product internals or adding a second resolver. Predicate compilation preserves complete membership without large id arrays, Oracle list limits or display truncation. Persisted context holds selections, not SQL. Using current registration is consistent with the verified product concepts; historical classification/responsibility needs separate evidence and is outside this request.

## Alternatives Considered

### Pass the displayed product ids

Rejected because the display is intentionally incomplete. Raising its limit would introduce expensive materialization and still require refusal above a new arbitrary cap.

### Let the sales interpreter generate joins

Rejected because it would duplicate semantic ownership and expose execution to unchecked model SQL.

## Consequences

### Positive

- Complete scoped totals, no expansion of one-to-many relations, explicit interpretation/provenance, and reusable per-ERP compiler behavior.
- No ERP grants, schema changes or new runtime credentials are required for the already enabled dimensions.

### Negative

- Semantic requests add resolver work within the existing finite turn deadline; unavailable paths or ambiguity block sales rather than produce partial totals.
- Reference semantics can exclude identified registrations with no eligible sales. Current membership cannot answer historical responsibility questions.

### Operational or Migration Impact

- Agent sales context has a versioned envelope that upgrades existing sales state; legacy sales HTTP remains literal and unchanged.
- Sales results add optional product-selection provenance; generated OpenAPI/SDK and the existing result UI consume it. Product/aggregate display bounds remain separate from total membership.
- This record remains proposed for repository review; it does not change accepted ADR history or authorize deployment.

## References

- [Semantic product resolution](../architecture/semantic-product-resolution.md#sales-integration)
- [Sales semantics and user scenarios](../domains/sales-chat.md#semantic-product-selections)
