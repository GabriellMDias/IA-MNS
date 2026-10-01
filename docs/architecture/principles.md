# Architecture Principles

[Documentation index](../README.md) · [Living documentation](living-documentation.md) · [Validation](../validation.md)

These are durable principles for humans and AI agents. Current policies own detailed rules; [ADRs](../adr/README.md) preserve significant choices and rationale. Make a conflict explicit and use the [decision priority](#decision-priority) and [exceptions](#exceptions) below rather than silently bypassing a principle.

## Read for this change

- [Decision Priority](#decision-priority) and [Exceptions](#exceptions) govern tradeoffs.
- [6. Domain Rules Must Have a Clear Home](#6-domain-rules-must-have-a-clear-home), [8. Shared Code Must Represent Shared Meaning](#8-shared-code-must-represent-shared-meaning), and [13. Release History Must Be Intentional](#13-release-history-must-be-intentional) often determine placement and change scope.

## 1. The Repository Is the Source of Truth

The repository must contain or link the source, contracts, schemas, tests, architecture, operations, security requirements, telemetry conventions, and decisions needed to understand, build, validate, operate, and evolve the system. Important knowledge must not live only in memory, private conversations, external tools, or undocumented habits. Change the repository when that knowledge changes.

## 2. One Concept Should Have One Canonical Source

Do not maintain the same fact independently in multiple places. Derive API documentation and clients from executable contracts, database references from the migrated schema plus semantic metadata, configuration references from schemas, and component documentation from component-owned source/examples. Generated artifacts must be reproducible, never independent authorities. [Living documentation](living-documentation.md) defines the human and AI-readable representations.

## 3. Architecture Must Be Explicit

Significant applications, packages, modules, and layers need clear responsibility, dependencies, contracts, side effects, data source, and documentation. Boundaries should be understandable without reconstructing them from implementation details.

## 4. Architecture Should Be Mechanically Enforced

Enforce important boundaries with types, schemas, package/import rules, static checks, tests, builds, and CI where practical. Prose and agent instructions explain rules but should not be their only protection.

## 5. Prefer Explicit Contracts

Communication across application, package, module, client/server, and asynchronous boundaries needs contracts clear enough that consumers do not depend on internals. Type, validate, version, document, test, and expose them in machine-readable form where appropriate; avoid independent consumer copies.

## 6. Domain Rules Must Have a Clear Home

Business behavior needs an identifiable canonical implementation and documentation when meaning is not evident from code. Do not scatter rules across controllers, UI, persistence adapters, triggers, jobs, and integrations. Keep platform concerns out of domain behavior when the separation has real value.

## 7. Dependencies Must Point Toward Stable Responsibilities

Infrastructure and volatile details should depend on stable contracts and domain concepts, not define core business behavior. Protect meaningful replacement boundaries without adding abstraction for its own sake.

## 8. Shared Code Must Represent Shared Meaning

Share contracts, schemas, behavior, clients, primitives, or utilities only when consumers actually share their meaning and responsibility. Similar-looking implementations alone do not justify coupling; some duplication is cheaper than a speculative common package.

## 9. Applications Must Remain Independently Understandable

Each application's purpose, entry points, dependencies, configuration, integrations, operational behavior, and documentation should be discoverable locally. Shared packages should improve consistency without hiding ownership.

## 10. Prefer Vertical Completeness

Implement and validate a feature across every layer it actually touches—data, application/domain behavior, contract, API, client, UI, tests, telemetry, and documentation—as one coherent behavior. Not every feature needs every layer.

## 11. Documentation Is Part of the System

Document intent, business rules, rationale, invariants, constraints, side effects, failures, procedures, integrations, and security behavior that code cannot safely explain alone. Do not restate obvious code. Code and documentation evolve together; incorrect documentation makes a change incomplete.

## 12. Current Documentation Describes Current Truth

Current policy describes current behavior and direction, without obsolete development states. Git owns development history; migrations own released database transitions; a changelog owns externally relevant released changes; ADRs own significant decision history.

## 13. Release History Must Be Intentional

Unreleased experiments may be refined; released artifacts describe meaningful transitions and must not be rewritten when doing so could invalidate deployed systems or persistent environments. This applies especially to migrations, compatibility guarantees, changelogs, and generated release artifacts. Safety outranks migration-count elegance.

## 14. Make Invalid States Difficult to Represent

Use constrained types, validated schemas, explicit state machines, domain rules, and database constraints at appropriate boundaries so invalid states are prevented where practical, not merely discovered later.

## 15. External Input Is Untrusted

Validate HTTP/client input, files, webhooks, external responses, messages, environment variables, CLI arguments, and imported data at the trust boundary. Client validation improves UX but never replaces server enforcement.

## 16. Errors Are Part of the Contract

Represent expected domain, validation, authentication, and authorization failures explicitly. Keep unexpected failures observable and correlated; consumers should not parse arbitrary messages, and users must not receive internal implementation details.

## 17. Production Behavior Must Be Observable

Production-relevant operations need sufficient safe logs, traces, metrics, error reports, and correlation/release context to investigate failures without relying solely on user reports. Observability remains subject to privacy and security policy.

## 18. Logs Must Be Structured

Prefer structured operational events with stable event, request/trace, operation, result, duration, and error-code fields when relevant. Human-readable messages can supplement, not replace, useful dimensions.

## 19. Sensitive Information Must Not Become Telemetry

Never intentionally log passwords, tokens, API keys, private keys, payment credentials, or cryptographic secrets. Collect other personal or sensitive data only when justified by classification, retention, and redaction policy.

## 20. Failures Must Be Actionable

Development-tool failures should identify the violated rule, relevant location, and next step where practical. Diagnostics are part of the human and agent development interface.

## 21. Tests Protect Behavior

Protect business rules, contracts, architectural invariants, and observable behavior without excessive coupling to implementation details. Use the lowest-cost test that reliably checks a rule and broader tests for boundaries, databases, integrations, workflows, and infrastructure.

## 22. Bugs Should Improve the System

Fix the symptom and examine why existing invariants, tests, telemetry, documentation, or boundaries missed it. Add a regression test when practical and strengthen the appropriate control.

## 23. Prefer Deterministic Development Workflows

Setup, development, validation, tests, generation, database work, and builds need canonical reproducible commands. Contributors should not rely on undocumented sequences or hidden machine state; [setup](../setup.md) owns the local path.

## 24. Automation Must Be Reproducible

Make generated outputs, builds, migrations, and checks consistent across environments where practical, with explicit inputs and configuration. CI should exercise the same fundamental workflow as local development.

## 25. Defaults Should Be Safe

The ordinary path should preserve secure configuration, validated boundaries, explicit errors, safe telemetry, database integrity, and secret handling without special contributor knowledge.

## 26. Prefer Boring Solutions for Solved Problems

Use mature, maintainable, observable, documented, and automatable technology for routine infrastructure. New complexity requires a concrete engineering or product benefit.

## 27. Avoid Premature Abstraction

Add an abstraction when evidence shows a repeated concept or meaningful boundary and it reduces reasoning cost. Prefer clear concrete code over a speculative framework.

## 28. Prefer Small, Cohesive Units

Keep modules, packages, services, components, and functions focused. Split by responsibility, not arbitrary size; many tiny layers can obscure ownership as much as one oversized unit.

## 29. Optimize for Local Reasoning

Use explicit interfaces, ownership, predictable placement, limited coupling, and local documentation so a contributor can safely change one area without loading the whole repository. This also reduces agent context ambiguity.

## 30. Make Side Effects Visible

Database writes, external calls, events, notifications, file changes, cache invalidation, and jobs should be discoverable in the contract or implementation. Apparently pure operations must not hide unrelated effects.

## 31. Idempotency Should Be Deliberate

Retryable operations must not duplicate meaningful effects. Where idempotency is required, define its scope and mechanism explicitly and test repeats and conflicts.

## 32. Concurrency Must Be Considered Explicitly

Shared-state mutations must assume concurrent execution. Choose constraints, transactions, optimistic versions, locks, keys, or serialization according to domain consistency needs, and test stale/conflicting cases.

## 33. Data Integrity Belongs Close to the Data

Protect critical relational invariants with appropriate database constraints and transactions as well as application validation. Do not rely solely on application code for guarantees the database can enforce.

## 34. Database Behavior Must Be Discoverable

Document application-owned tables, columns, views, functions, triggers, constraints, and important indexes under [schema policy](../database/schema-documentation.md). Database-resident business logic needs explicit justification and visibility; generate structural references from canonical schema facts where practical.

## 35. Backward Compatibility Must Be Evaluated

Evaluate actual consumers before changing APIs, schemas, messages, configuration, stored files, or generated SDKs. Plan breaking changes, migration, and deprecation when a released or independently evolving boundary requires them.

## 36. Deployment Safety Takes Priority Over Elegance

Use temporary expand–migrate–switch–contract compatibility when a real deployment needs it; remove transitional code after migration. The cleanest final shape does not justify an unsafe rollout.

## 37. Configuration Is Part of the Contract

Configuration should be explicit, typed or validated, documented, and fail safely. Invalid required values fail early; secrets are handled separately from ordinary configuration.

## 38. Environment Differences Must Be Intentional

Document necessary development, test, staging, and production differences. Keep core behavior consistent where practical and exercise production-only behavior before production where feasible.

## 39. Security Boundaries Must Be Explicit

Authentication establishes the actor; authorization decides whether that actor may perform an operation. Enforce permissions at trusted application boundaries, never solely through client or UI visibility.

## 40. Infrastructure Should Serve the Architecture

Introduce brokers, caches, orchestration, microservices, search, or extra databases only for concrete requirements and with their operational cost understood.

## 41. Monolith First Unless Boundaries Require Otherwise

Prefer logical modularity before distribution. Separate services only for justified scaling, isolation, deployment autonomy, security, ownership, or runtime needs.

## 42. Generated Code Must Remain Replaceable

Know every generated file's canonical input and regeneration process. Do not hand-edit derived output except at an explicit extension point; keep it reproducible and replaceable.

## 43. Tooling Is Part of Developer Experience

Design commands, generators, setup, and diagnostics for deterministic behavior, clear names, actionable output, and little hidden state. Tooling is an internal product for humans and agents.

## 44. AI Agents Must Operate Through Verifiable Feedback

Pair instructions with compiler, type, lint, architecture, test, schema, generation, and build feedback that can prove important changes valid. Increase mechanical coverage as real capabilities arrive.

## 45. AI-Specific Architecture Must Also Benefit Humans

Agent-oriented structure should improve clarity, consistency, discoverability, automation, maintenance, or onboarding for people too. Do not optimize the repository for one AI tool's quirks.

## 46. Important Decisions Must Preserve Rationale

For consequential architecture, retain context, alternatives, choice, tradeoffs, and consequences in an ADR when the [authoring policy](../adr/authoring.md) calls for one. Distinguish deliberate constraints from accidents.

## 47. Prefer Reversible Decisions Early

When evidence is incomplete, preserve flexibility with clear boundaries, explicit contracts, limited coupling, and documented decisions rather than speculative abstraction. Commit to specifics when requirements justify them.

## 48. Complexity Must Pay Rent

Every layer, dependency, service, package, process, or technology adds knowledge cost. Use it only when its concrete benefit exceeds a simpler alternative.

## 49. Prefer Consistency Over Personal Preference

Follow established good patterns unless there is a concrete reason to improve them. Change an inadequate pattern deliberately rather than creating silent competing conventions.

## 50. The Architecture Must Be Able to Evolve

When evidence invalidates a fundamental choice, identify the limit, evaluate alternatives, document the new decision, migrate deliberately, remove obsolete architecture, and update validation/documentation. Do not accumulate contradictory generations of policy.

## Decision Priority

When principles conflict, consider correctness, security/privacy, data integrity, production safety, explicit contracts/boundaries, observability, maintainability, simplicity, consistency, then development convenience. This is guidance, not a substitute for explaining significant tradeoffs.

## Exceptions

An exception needs a concrete reason, understood consequences, explicit scope, documentation when significant, and no silent competing pattern. Give temporary deviations a removal path where practical.

## Relationship to Other Documentation

This page owns architectural principles, not implementation recipes. [Policies](../README.md) own current requirements, [ADRs](../adr/README.md) own decision rationale, [setup](../setup.md) owns development commands, and [AGENTS.md](../../AGENTS.md) owns global contributor/agent instructions.
