# ADR-0009: Establish Testing Strategy and Tooling

**Status:** accepted

**Date:** 2026-09-23

## Context

Orion requires a concrete testing strategy that implements the testing principles already established by the architecture foundation.

The strategy must support projects ranging from small applications to large, long-lived systems while balancing:

- fast developer feedback;
- realistic verification of infrastructure behavior;
- confidence in database migrations and persistence;
- browser fidelity;
- deterministic and isolated execution;
- parallel execution;
- maintainable test suites;
- effective failure diagnostics;
- compatibility with the canonical `pnpm validate` workflow;
- reasonable CI execution cost;
- clear responsibility between different test levels.

No single test environment provides the best tradeoff for every kind of behavior.

Pure domain calculations do not require PostgreSQL or a browser.

Persistence behavior cannot be validated reliably through mocks when correctness depends on PostgreSQL, Prisma, migrations, constraints, SQL, or transaction semantics.

Browser APIs and DOM behavior cannot always be represented faithfully by simulated DOM implementations.

Complete user journeys require a real application stack but are too expensive to become the primary way to test every business rule.

Orion therefore requires multiple complementary test levels, each selected according to the behavior being verified.

The guiding principle is:

> Use the lowest-cost test level that can reliably prove the required behavior.

The strategy must also preserve previous architectural decisions:

- `tsc` remains the authority for TypeScript correctness;
- PostgreSQL is the primary database;
- Prisma is the primary persistence tooling;
- production database structure is created through versioned migrations;
- Fastify is the HTTP transport framework;
- React is the primary web UI framework;
- `pnpm validate` is the canonical repository validation entry point.

## Decision

Orion will use **Vitest as its primary test runner for TypeScript tests**.

Orion will use **Testcontainers for tests that require real infrastructure**, with PostgreSQL as the initial primary use case.

Orion will use **Vitest Browser Mode with the Playwright browser provider for browser-dependent component and feature tests**.

Orion will use **Playwright Test for full browser end-to-end testing**.

The resulting default testing model is:

```text
pure logic
    → Vitest in Node

backend integration
    → Vitest + real dependencies

database integration
    → Vitest + Testcontainers + PostgreSQL

browser component / feature behavior
    → Vitest Browser Mode + Playwright provider

complete user journeys
    → Playwright Test
```

### Type checking

Vitest is responsible for runtime test execution.

It does not replace the TypeScript compiler as Orion's type-checking authority.

The responsibility remains:

```text
type correctness
    → tsc

runtime behavior
    → Vitest / Playwright
```

Test code must therefore participate in the repository's normal TypeScript validation.

### Unit tests

Unit tests will normally run through Vitest in a Node.js environment.

They should be used for behavior that can be verified without starting infrastructure or browser environments.

Typical examples include:

- domain rules;
- calculations;
- state transitions;
- value-object behavior;
- parsers;
- deterministic transformations;
- application decisions;
- mappers;
- validation helpers;
- pure utility functions.

Unit tests should remain fast and should minimize dependencies on infrastructure that does not contribute to the behavior being tested.

A domain calculation must not require PostgreSQL, Fastify, or a browser merely because those technologies exist elsewhere in the application.

### Mocking and test doubles

Orion will avoid pervasive mocking of internal implementation details.

Mocks, fakes, stubs, and other test doubles should be used primarily at meaningful external or nondeterministic boundaries.

Appropriate examples include:

- third-party HTTP APIs;
- payment providers;
- email delivery;
- clocks;
- random-number generation;
- external object storage;
- external services unavailable or inappropriate during the test.

Internal infrastructure whose real behavior is important to correctness should generally be tested using the real implementation at the appropriate integration level.

For example, persistence tests should not attempt to prove Prisma/PostgreSQL behavior using a mocked Prisma client.

The principle is:

```text
mock external or nondeterministic boundaries
    ≠
mock every internal dependency
```

Tests should verify observable behavior rather than mirror the internal call structure of the implementation.

### Integration tests

Integration tests will use Vitest and real dependencies when the behavior under test materially depends on those dependencies.

Examples include:

- Prisma persistence adapters;
- PostgreSQL constraints;
- transaction behavior;
- custom SQL;
- database migrations;
- Fastify routes and plugins;
- serialization;
- HTTP validation;
- infrastructure adapters.

Integration tests should remain narrower than full end-to-end tests.

They may exercise multiple real application components while still avoiding unnecessary browsers, network sockets, or external services.

### PostgreSQL integration tests

Tests that verify PostgreSQL-dependent behavior will use a **real PostgreSQL instance**.

Orion will not use SQLite, an in-memory relational substitute, or mocked database behavior as the default replacement for PostgreSQL in persistence integration tests.

The intended test path is:

```text
Vitest
    ↓
Testcontainers
    ↓
real PostgreSQL
    ↓
real Orion migrations
    ↓
Prisma
    ↓
persistence implementation
```

This provides coverage for behavior that depends on:

- PostgreSQL data types;
- constraints;
- indexes;
- transaction semantics;
- Prisma behavior;
- migration correctness;
- custom SQL;
- PostgreSQL extensions when present.

### Testcontainers

Testcontainers will be Orion's default mechanism for creating ephemeral infrastructure required by integration tests.

Its initial primary responsibility is PostgreSQL test infrastructure.

Additional supported services may use Testcontainers when a real service provides materially better confidence than a mock or local substitute.

Introducing a Testcontainers module does not mean that every individual test must start its own container.

Infrastructure lifecycle may be optimized according to test-suite size and execution environment.

Containers or infrastructure instances may be scoped to:

- a test run;
- a worker;
- a test suite;
- another isolation boundary appropriate to the implementation.

The architectural requirement is not a particular container lifecycle.

The requirement is that tests remain:

- isolated;
- deterministic;
- independently executable;
- safe for parallel execution.

Shared infrastructure must not create dependencies on test execution order.

### Database initialization

Integration-test databases must be constructed using the same migration history used for durable application databases.

The intended lifecycle is:

```text
empty PostgreSQL
    ↓
versioned production migrations
    ↓
test-specific data
    ↓
test execution
```

Orion will not maintain an independent test-only schema that bypasses the production migration path.

This allows integration tests to verify that the current database can actually be constructed from the committed migration history.

Test initialization may optimize migration application through safe implementation techniques, but the resulting schema must be equivalent to one created by the canonical migration history.

### Test database isolation

Tests must not depend on state created by unrelated tests.

State isolation may be implemented through mechanisms such as:

- independent databases;
- independent schemas where appropriate;
- transaction rollback where semantically safe;
- deterministic cleanup;
- worker-scoped database instances;
- another mechanism providing equivalent isolation.

This ADR does not mandate one universal database-reset technique.

The selected technique must preserve correctness, parallelism, and deterministic execution.

### Fastify integration testing

Backend HTTP integration tests should use Fastify's request-injection capabilities when the behavior does not require a real external network socket.

The preferred integration path is:

```text
test
    ↓
Fastify request injection
    ↓
real route
    ↓
real validation / serialization
    ↓
real application behavior
    ↓
real persistence when required
```

This enables realistic HTTP-boundary testing without paying unnecessary TCP and process-management costs.

A real listening server should be started only when the behavior under test depends on actual network behavior or is part of a full end-to-end environment.

### React logic tests

Frontend logic that does not require browser behavior should run through Vitest in Node.js.

Examples include:

- formatters;
- state transformations;
- parsing;
- query-key factories;
- deterministic helpers;
- business-independent UI calculations.

A browser must not be started merely because the code belongs to the web package.

### Browser component and feature testing

When correctness depends on actual browser behavior, Orion will use **Vitest Browser Mode**.

The default browser provider will be **Playwright**.

The preferred execution model is:

```text
Vitest
    ↓
Browser Mode
    ↓
Playwright provider
    ↓
real browser
```

Browser-mode tests are appropriate for behavior involving concerns such as:

- real DOM APIs;
- browser event behavior;
- focus management;
- keyboard interaction;
- pointer interaction;
- layout-dependent logic;
- browser-native controls;
- component integration;
- accessibility-relevant interaction behavior.

A simulated DOM implementation such as jsdom will not be Orion's default environment for tests whose purpose is browser fidelity.

Simulated DOM environments may still be used in a scoped context when their reduced startup cost materially benefits a test and the missing browser behavior is irrelevant.

### Component tests versus end-to-end tests

Browser component or feature tests and full end-to-end tests serve different purposes.

Browser-mode tests should answer questions such as:

```text
Does this component or scoped feature behave correctly in a real browser?
```

Full E2E tests should answer questions such as:

```text
Can a real user complete this critical workflow through the deployed application boundaries?
```

Component behavior should not require starting the complete application stack when a smaller browser-level test can prove the behavior reliably.

### End-to-end testing

Orion will use **Playwright Test as its default browser end-to-end testing framework**.

E2E tests should exercise the real application boundaries required by the user journey.

A representative path may include:

```text
browser
    ↓
React application
    ↓
HTTP API
    ↓
Fastify
    ↓
application
    ↓
PostgreSQL
```

E2E testing should focus primarily on critical cross-system workflows rather than exhaustively reproducing lower-level business-rule tests.

Typical examples include:

- authentication flows;
- critical record creation;
- major business workflows;
- important authorization boundaries;
- representative update/delete operations;
- high-value integration paths;
- critical regression journeys.

### Browser matrix

Chromium will be the default browser for routine initial E2E execution.

Additional browsers such as Firefox and WebKit will be introduced according to the supported-browser requirements of each product.

Orion will not require every E2E test to run against every browser by default.

Cross-browser execution may be applied selectively through:

- dedicated CI jobs;
- critical workflow suites;
- scheduled test runs;
- release validation;
- another product-specific browser matrix.

Browser support is a product requirement and must not be guessed globally by the foundation.

### Test data

Tests should create the minimum data required to demonstrate the behavior under test.

Large global fixtures shared implicitly across unrelated tests should be avoided.

Reusable test builders and factories may be used to improve clarity and reduce repetitive setup.

Their purpose is to construct test scenarios, not to become an alternative application service layer.

Test data setup should make preconditions understandable from the test or nearby supporting code.

### Test isolation and ordering

Tests must be independently executable.

A test must not rely on another test running first or leaving behind required state.

The test suite should be safe to:

- reorder;
- parallelize;
- shard;
- execute selectively;
- rerun after failure.

Global mutable state should be minimized and must be reset reliably where unavoidable.

### Coverage

Vitest's **V8 coverage provider** will be the default code-coverage mechanism.

Coverage will initially be treated as a diagnostic and regression signal rather than the primary definition of test quality.

Orion will not impose a global coverage-percentage threshold at foundation level initially.

In particular, Orion will not require arbitrary targets such as 100% coverage solely as a proxy for correctness.

Coverage thresholds may be introduced later when repository experience provides meaningful evidence for appropriate targets.

Important code may require targeted coverage expectations even when a global threshold is not configured.

### Snapshot testing

Snapshot testing is permitted but should be used deliberately.

Snapshots are most appropriate for relatively small, stable representations whose exact structure is relevant.

Large snapshots that hide meaningful behavior changes behind broad snapshot updates should be avoided.

Tests should prefer explicit behavioral assertions when those assertions communicate intent more clearly.

### Flaky tests

Persistent test flakiness is considered a defect.

Flaky tests must not be normalized as an unavoidable property of the test suite.

Arbitrary delays such as fixed `sleep` calls should not be used as the normal synchronization strategy.

Browser tests should prefer deterministic readiness signals, Playwright locators, assertions, and automatic waiting behavior.

Retries may be used as a diagnostic or resilience mechanism in CI, but passing only after retries must not be treated as evidence that persistent flakiness is acceptable.

### Test execution and repository validation

Test capabilities will participate in Orion's canonical validation workflow as they become applicable.

The repository should expose independently runnable commands with responsibilities similar to:

```text
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm test:e2e
```

Exact script names and composition may be refined during implementation.

The canonical:

```text
pnpm validate
```

must remain the stable repository-level validation contract established by ADR-0003.

Not every repository or package must execute test classes that do not yet exist.

For example, browser and E2E validation should be introduced when the web application and corresponding test scenarios exist.

How the validation work is partitioned, cached, parallelized, or sharded in CI will be determined by ADR-0011.

## Rationale

Vitest is selected because it fits naturally into Orion's TypeScript, ESM, React, and Vite ecosystem while providing a fast and capable general-purpose test runner.

Using one primary runner for ordinary TypeScript tests reduces the number of test conventions contributors must understand.

Vitest does not replace TypeScript validation.

Maintaining `tsc` as the source of truth for type correctness keeps the responsibilities established by ADR-0003 intact.

Real infrastructure is selected for integration testing whenever correctness materially depends on that infrastructure.

This is particularly important for PostgreSQL.

Orion explicitly permits PostgreSQL-specific capabilities, custom migrations, constraints, explicit SQL, extensions, and transaction behavior.

Replacing PostgreSQL with SQLite or database mocks during integration testing would create a substantial semantic gap between the test system and production system.

Testcontainers provides a practical way to reduce that gap without requiring permanently shared development infrastructure.

It allows tests to construct disposable service environments that can be reproduced locally and in CI.

The decision to construct test databases from the committed production migration history provides additional confidence that Orion's canonical schema-evolution path remains executable.

Fastify request injection provides an efficient middle layer between unit testing and full network E2E testing.

It allows validation, serialization, routing, application logic, and persistence to be tested together without unnecessarily starting external listeners.

Vitest Browser Mode is selected for browser-dependent component and feature behavior because actual browser execution provides higher fidelity than simulated DOM environments.

This avoids making jsdom semantics an implicit substitute for browser semantics when the behavior genuinely depends on the browser.

Playwright serves two related but distinct roles:

- browser provider for Vitest Browser Mode;
- standalone E2E test framework for complete user journeys.

This gives Orion a consistent browser automation foundation without requiring all browser tests to become expensive E2E scenarios.

Playwright Test is selected for E2E because it provides strong isolation, modern browser automation, automatic waiting, parallel execution, tracing, and multi-browser capabilities suitable for growing test suites.

The strategy deliberately avoids requiring every browser or every system layer for every test.

Orion instead optimizes for the cheapest environment that can prove a behavior reliably.

This produces a testing spectrum:

```text
fast feedback                                      high fidelity
←────────────────────────────────────────────────────────────→

Vitest         Vitest             Vitest Browser       Playwright
Node           integration        Mode                  E2E
 │                 │                   │                   │
pure logic     real services       real browser        full system
```

This approach allows the test suite to grow without making complete-system tests the primary source of development feedback.

## Alternatives Considered

### Jest

Jest provides a mature and widely used JavaScript testing ecosystem.

It has extensive documentation, broad library support, and substantial production adoption.

It was not selected because Vitest aligns more directly with Orion's ESM, TypeScript, Vite, and modern frontend tooling while providing the capabilities required by the foundation.

Using Vitest also reduces divergence between web tooling and test transformation behavior.

### Node.js Built-in Test Runner

Node.js provides a native test runner without requiring a third-party testing framework.

Using the built-in runner would reduce external dependencies.

It was not selected because Vitest provides a more integrated TypeScript/frontend experience, richer repository-level tooling, browser testing integration, coverage support, and consistency with the selected Vite ecosystem.

The native runner remains technically suitable for specialized isolated use, but it is not Orion's default.

### SQLite for Database Tests

SQLite can provide extremely fast and simple relational tests.

It is useful for applications whose production behavior is sufficiently database-agnostic.

It was not selected as Orion's PostgreSQL integration substitute because Orion intentionally depends on PostgreSQL capabilities and semantics.

SQLite cannot reliably prove behavior involving PostgreSQL-specific:

- types;
- constraints;
- indexes;
- extensions;
- transaction semantics;
- custom SQL;
- Prisma/PostgreSQL integration.

The difference would reduce the value of persistence integration tests.

### Mocked Prisma or Repository Implementations for Persistence Integration

Orion could mock Prisma or persistence adapters to keep tests fast.

Such tests may still be useful for isolated application logic.

They were not selected as the persistence-integration strategy because a mock cannot demonstrate that the real Prisma queries, PostgreSQL schema, migrations, constraints, and transactions behave correctly.

Mocks remain appropriate when the behavior being tested is above the persistence boundary and persistence behavior itself is intentionally outside test scope.

### Shared Permanent Test Database

Orion could maintain one long-running PostgreSQL test instance used by all developers and CI jobs.

This may reduce container startup overhead.

It was not selected as the foundation default because shared persistent test infrastructure introduces state leakage, environment drift, coordination requirements, and reduced reproducibility.

Reusable infrastructure may still exist as an optimization when it preserves deterministic test isolation, but tests must not depend on a manually maintained shared database state.

### jsdom as the Default React Test Environment

A simulated DOM environment provides fast execution and has historically been common for React component testing.

It remains useful for tests that need DOM-like APIs without requiring actual browser behavior.

It was not selected as Orion's default browser-fidelity environment because simulated DOM semantics can differ from actual browser behavior.

Vitest Browser Mode allows tests whose correctness depends on browser semantics to execute in a real browser while preserving integration with the primary test runner.

### Playwright for All Frontend Tests

Orion could use Playwright Test for both component behavior and complete user journeys.

This would reduce the number of test APIs used for browser-facing code.

It was not selected because many component and feature tests benefit from the faster, more focused lifecycle of Vitest Browser Mode.

Full Playwright E2E environments should be reserved for behavior that genuinely requires the complete application stack.

### Cypress

Cypress provides mature browser testing capabilities, developer tooling, and component/E2E support.

It would be a technically valid browser testing solution.

Playwright was selected because it provides a strong fit for modern multi-browser automation, isolated browser contexts, parallel execution, tracing, and the additional benefit of serving as the browser provider for Vitest Browser Mode.

This reduces the number of browser automation technologies in the foundation.

### Mandatory 100% Code Coverage

Orion could enforce complete code coverage as a repository rule.

This would provide a simple measurable threshold.

It was not selected because coverage measures executed code rather than test correctness or assertion quality.

Artificially maximizing coverage can create low-value tests and discourage appropriate prioritization.

Coverage remains useful as a diagnostic and regression signal, and targeted expectations may be introduced where risk justifies them.

## Consequences

### Positive

- Orion has one primary TypeScript test runner.
- Fast unit tests provide rapid feedback for pure logic.
- Real PostgreSQL integration tests verify the database actually used in production.
- Prisma persistence behavior is tested against PostgreSQL rather than mocks.
- Production migrations are exercised by integration-test database creation.
- Custom PostgreSQL SQL and extensions can be tested realistically.
- Testcontainers provides reproducible ephemeral infrastructure for local development and CI.
- Fastify request injection enables realistic backend integration tests without unnecessary network overhead.
- React component behavior can be tested in real browsers without requiring complete E2E environments.
- Playwright provides a consistent browser automation foundation.
- Full E2E tests can focus on critical user journeys rather than every rule permutation.
- Tests are expected to remain isolated and parallelizable.
- Test data remains local and explicit rather than relying on large implicit global fixtures.
- Coverage remains available without becoming an arbitrary quality metric.
- The strategy can scale from small repositories to large test suites.
- Individual test classes remain independently executable and optimizable in CI.
- Flaky tests are treated as defects rather than accepted background noise.

### Negative

- Orion introduces multiple test execution modes that contributors must understand.
- Testcontainers requires a compatible container runtime in environments executing infrastructure tests.
- Real PostgreSQL integration tests are slower than database mocks or in-memory substitutes.
- Migration-based test database initialization adds execution cost.
- Sharing infrastructure for performance requires careful state isolation.
- Browser Mode tests are slower and more resource-intensive than Node-only tests.
- Playwright requires browser binaries and corresponding CI resources.
- Maintaining separate component-browser and E2E test levels requires contributors to choose the appropriate level.
- Test isolation may require additional infrastructure code and test factories.
- Not using broad internal mocks means some integration tests will require more setup than heavily mocked alternatives.
- Absence of a global coverage threshold provides less immediately visible numerical enforcement and requires engineering judgment.
- Multi-browser execution, when introduced, can materially increase CI cost.

### Operational or Migration Impact

Orion does not currently have an established testing implementation that must be migrated.

The initial repository testing foundation will therefore be introduced directly using:

```text
Vitest
Testcontainers
Vitest Browser Mode
Playwright
Playwright Test
```

Test dependencies should only be added when the corresponding test capability exists.

Unit and integration test scripts must be integrated with repository validation as soon as meaningful test suites exist.

PostgreSQL integration-test infrastructure must use a PostgreSQL version compatible with the production baseline established by Orion's database tooling.

Test databases must be initialized from committed migration history.

Container lifecycle and database-isolation strategies should initially favor correctness and simplicity, then be optimized using measurement when test execution time becomes material.

Fastify integration tests should use request injection by default unless real network behavior is part of the requirement.

Browser-dependent React tests should use Vitest Browser Mode when real browser semantics matter.

Playwright Test should be introduced for critical end-to-end workflows once the initial web application can be exercised through a complete running stack.

Chromium will be the initial routine E2E browser.

Additional browser projects should be added according to real product browser-support requirements.

V8 coverage should be configured when coverage reporting becomes useful, without imposing an arbitrary foundation-level percentage threshold.

CI execution strategy, including parallel jobs, container caching, browser installation, test sharding, and artifact retention, will be defined by ADR-0011.

Routine compatible upgrades of Vitest, Testcontainers, or Playwright do not require a new ADR when they preserve the responsibilities established here.

Replacing the primary test runner, database integration strategy, or browser E2E framework would constitute a material testing-architecture change and should supersede this ADR.

## References

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0004: Select Fastify as the Backend HTTP Framework](0004-select-fastify-as-the-backend-http-framework.md)

Related ADR: [ADR-0005: Select PostgreSQL as the Primary Database](0005-select-postgresql-as-the-primary-database.md)

Related ADR: [ADR-0006: Select Prisma ORM for Database Access and Migrations](0006-select-prisma-orm-for-database-access-and-migrations.md)

Related ADR: [ADR-0008: Select React, Vite, and TanStack for Web Applications](0008-select-react-vite-and-tanstack-for-web-applications.md)

Related policy: [testing strategy](../architecture/testing-strategy.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [migrations](../database/migrations.md)

Related policy: [transactions and concurrency](../database/transactions-and-concurrency.md)

External reference: Vitest documentation.

External reference: Vitest Browser Mode documentation.

External reference: Testcontainers for Node.js documentation.

External reference: Fastify testing documentation.

External reference: Playwright documentation.
