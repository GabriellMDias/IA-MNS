# Dependency Rules

[Documentation index](../README.md) · [Application boundaries](application-boundaries.md) · [Validation](../validation.md)

This page owns allowed dependency directions and their enforcement. A resolving import or passing build does not grant architectural permission. Dependencies must follow explicit ownership, public contracts, and runtime compatibility. [ADR-0003](../adr/0003-establish-repository-validation-and-architecture-enforcement.md) selects the enforcement tools; the [technology map](technology-decisions.md) routes stack-specific decisions.

## Dependency Matrix

| From | To | Default |
| --- | --- | --- |
| `apps/*` | Public APIs of compatible `packages/*` | Allowed |
| One application | Another application's implementation | Forbidden |
| `packages/*` | `apps/*` | Forbidden |
| One package | Another package | Requires aligned responsibility, public API, and no cycle |
| `tooling/*` | Application/package source | Allowed for repository tooling |
| Application/package runtime | `tooling/*` or `infra/*` | Forbidden |
| Infrastructure definitions | Application artifacts/configuration requirements | Allowed when infrastructure exists |
| Documentation | Implementation references | Allowed |
| Ordinary application behavior | Parsed human-authored policy | Forbidden by default; documentation-as-product is an intentional exception |

Distinguish compile-time imports, runtime communication, development-only dependencies, and generation inputs. An API runtime dependency does not justify importing its implementation. Test/build/generation tools must not leak into production execution. Generated artifacts depend on their canonical input; that input must not depend back on the output except in an explicitly designed pipeline. Rendering generated documentation in the portal does not make it the source of application behavior.

## Application Internal Dependency Direction

Outer delivery adapters normally depend on application behavior and stable domain concepts. Infrastructure implements capabilities needed by the application; bootstrap selects and wires concrete adapters. Stable business behavior must not become dependent on HTTP, ORM records, application bootstrap, or vendor details without architectural justification.

Direct imports are suitable for stable pure dependencies. Inject replaceable infrastructure where that clarifies ownership/testing, without introducing a framework or an interface for every class. Pass only the configuration a capability needs. Avoid ambient configuration, global registries, service locators, mutable singletons, and arbitrary initialization of unrelated infrastructure.

Client pages/features use the SDK/client boundary rather than having generic UI components issue arbitrary backend calls. Persistence interfaces protect meaningful ownership or behavior; do not introduce a repository abstraction for every table. ORM records, domain entities, wire contracts, and view models may share a representation only when their semantics actually align.

Provider SDKs belong near meaningful integration boundaries. An adapter should express an application capability, not duplicate a vendor API simply to hide its name. Domain telemetry must not unnecessarily couple business behavior to a particular telemetry vendor.

## Package and Domain Boundaries

[Repository structure](repository-structure.md#packages) defines when a package is justified. These constraints apply when the corresponding responsibility exists:

| Responsibility | Dependency constraints |
| --- | --- |
| Domain | Stable primitives/standard-library capabilities as needed; avoid direct HTTP/UI, ORM/database, cloud/broker, filesystem infrastructure, telemetry-vendor, or application dependencies. |
| Wire contracts | Schema validation, serialization, identifiers, and stable primitives; avoid application internals, ORM models, framework request objects, UI, and deployment infrastructure. |
| Database | Drivers, ORM/migration/schema tooling, and telemetry integration; may implement stable persistence contracts, never import applications. |
| SDK | Public contracts, transport/serialization, and generated types; no backend internals, database access, private domain implementation, or secrets. |
| Configuration | Shared validation/loading primitives; keep application settings application-owned and expose narrow inputs. |
| Testing | Public APIs and test-only infrastructure; production code must not import testing code. Broader test access must not conceal an invalid runtime design. |
| UI | Explicitly compatible client runtimes; no dependency from backend/domain code onto client UI. |

Use supported package exports, including deliberate public subpaths. Do not reach into `src/internal` or use a barrel to flatten unrelated ownership. A public API provider owns its semantics and stability; the consumer owns why it needs that dependency.

Reads across domains create coupling just as writes do. Identify table/concept ownership, synchronous or asynchronous interaction, and the public capability before directly querying another domain's data. Avoid circular business ownership; canonical event contracts must not depend on producer/consumer internals. Shared identifiers require shared meaning: a database ID, provider ID, business ID, and correlation ID are not interchangeable merely because all are strings.

Public API/errors must not expose private ORM enums, internal exception classes, stack traces, driver messages, aggregates, or provider identifiers unless intentionally part of the contract. Map internal results to stable public schemas/codes. Separately released APIs, SDKs, and event schemas require an explicit [compatibility transition](versioning-and-compatibility.md) when broken.

## Client/Server Dependency Rules

Clients may consume public contracts, SDKs, and explicitly client-safe primitives. They must not import database clients, server credentials/configuration, backend internals, private adapters, filesystem APIs, or server-only SDKs. A shared package must remain safe for every runtime it supports. Secrets must never enter client bundles, generated clients, or public configuration.

The current web workflow depends on `@orion/sdk`; the API owns its executable wire contracts. Generated artifacts remain identifiable, reproducible, and unedited by hand; semantic documentation belongs to the canonical owner.

## Adding or Changing Dependencies

Before a new edge, identify its responsibility, canonical owner, public API, permitted direction, platform compatibility, cycle risk, and runtime/deployment coupling. Search existing capabilities before adding a new abstraction. If a legitimate need conflicts with the model, report and resolve that conflict explicitly.

For third-party libraries, follow [contributing guidance](../contributing.md#change-workflow) and assess maintenance, security, license, maturity, runtime/bundle cost, portability, testability, lock-in, and overlap. Declare directly used dependencies in the owning application/package; do not rely on undeclared transitives. Optional dependencies must represent genuinely optional capabilities. Dynamic imports, reflection, and plugins need real use cases and must not evade enforcement.

Cycles are forbidden by default. Resolve their ownership by moving a shared responsibility lower, merging one concept, or revising the boundary; do not hide them with lazy imports, global registration, duplicated interfaces, or initialization order. Remove intermediate layers that add no meaning. High fan-out warrants a responsibility review; high fan-in requires focused APIs, stability, careful compatibility, minimal dependencies, and strong tests. Neither metric alone decides correctness.

## Mechanical Enforcement

`pnpm architecture` runs [dependency-cruiser configuration](../../.dependency-cruiser.mjs) locally and in `pnpm validate`/CI. It rejects cycles, unresolved imports, cross-application imports, package-to-application imports, runtime-to-tooling/infra imports, known client-to-server paths, Node built-ins in browser/SDK runtime, and configured domain-to-infrastructure paths. Type-aware [ESLint restrictions](../../eslint.config.mjs) also reject direct browser/SDK imports of known server infrastructure libraries. `pnpm architecture:test` exercises representative forbidden and permitted edges, including a flat `domain.ts` module and emitted-bundle exclusion.

Enforcement is path-based, not a proof of every policy above. The domain rule covers named `domain/` directories and flat `domain.ts` modules but cannot infer all business ownership. Browser restrictions list known server libraries rather than every possible unsafe external dependency; the web build also has a [bundle check](../../apps/web/scripts/check-bundle.mjs). Public-surface restrictions, undeclared dependencies, data ownership, dynamic edges, and arbitrary platform leakage require review or additional targeted checks. Generated directories, emitted `dist/` bundles, and dependency internals are excluded from the import scan. Bundler chunk relationships are derived from the checked source graph and must not make architecture results depend on whether a build has already run.

### Dependency Enforcement

Extend checks when real boundaries appear. Failures should identify the violating edge, rule, reason, and corrective route. Keep the same core checks available locally and in CI; do not silently weaken them to pass a change. When introducing stricter rules, measure existing violations, prevent new ones, migrate deliberately, remove exceptions, and make the rule fully blocking.

## Temporary Exceptions

Document a significant temporary exception's edge, reason, scope, risk, and removal condition; track it mechanically where practical. It must not become permanent silently. A permanent exception to a major dependency rule normally needs an ADR and corresponding policy/enforcement updates.
