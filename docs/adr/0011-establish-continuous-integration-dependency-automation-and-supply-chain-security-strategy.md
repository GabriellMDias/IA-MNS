# ADR-0011: Establish Continuous Integration, Dependency Automation, and Supply Chain Security Strategy

**Status:** accepted

**Date:** 2026-09-23

## Context

Orion requires a continuous-integration strategy that converts the repository validation contract established by ADR-0003 into an enforceable pull-request and primary-branch quality gate.

The CI system must support the repository as it grows from a small TypeScript monorepo into potentially large applications containing:

- backend services;
- React web applications;
- shared packages;
- database migrations;
- generated API artifacts;
- integration tests using real infrastructure;
- browser tests;
- end-to-end tests;
- architecture validation;
- security checks.

The CI strategy must preserve a fundamental Orion principle:

```text
local validation
    =
CI validation capabilities
```

CI must not become a separate implementation of repository correctness.

A contributor or AI agent should be able to reproduce a CI failure locally using repository-owned commands rather than reverse-engineering workflow YAML.

The repository has already established:

```text
pnpm validate
```

as its canonical repository validation entry point.

CI must orchestrate those capabilities without duplicating their logic.

The CI system must also address software supply-chain risks.

A modern TypeScript repository depends on:

- npm packages;
- transitive dependencies;
- GitHub Actions;
- generated lockfiles;
- browser binaries;
- container images;
- external development tools.

Dependency updates must therefore be automated enough to prevent stagnation while remaining reviewable and controlled.

GitHub is the repository platform assumed by the current Orion foundation, making GitHub Actions a natural CI candidate.

However, GitHub-specific workflow mechanics must remain an orchestration concern rather than leak into application architecture.

## Decision

Orion will use **GitHub Actions as its primary continuous-integration platform**.

CI will execute repository-owned validation commands and will not duplicate linting, formatting, type-checking, testing, architecture, generation, or build logic directly in workflow YAML.

The primary model is:

```text
developer / AI agent
        ↓
repository commands
        ↓
pnpm validate
        ↓
same capabilities
        ↓
GitHub Actions
```

### Canonical validation contract

`pnpm validate` remains the canonical repository validation contract.

CI may decompose validation capabilities into separate jobs for:

- parallel execution;
- clearer failure reporting;
- resource isolation;
- browser requirements;
- container requirements;
- future sharding.

For example, CI may conceptually execute:

```text
format / lint / architecture
typecheck
unit tests
integration tests
browser tests
E2E tests
generated-artifact validation
build validation
```

as independent jobs.

Those jobs must invoke repository scripts implementing the same capabilities available locally.

Workflow YAML must not contain an independent implementation of validation logic.

For example, this is preferred:

```text
GitHub Actions
    ↓
pnpm test:integration
```

rather than embedding database setup, test discovery, test filters, and project-specific test semantics exclusively inside the workflow.

The stable interface is the repository command.

The CI workflow is an orchestrator.

### Incremental validation capabilities

Not every validation category must exist before the repository contains the corresponding capability.

The validation system will grow with the repository.

For example:

```text
initial foundation
├── format:check
├── lint
├── typecheck
└── architecture

after application code exists
├── unit tests
├── integration tests
├── generated artifacts
├── web build
├── browser tests
└── E2E tests
```

A capability should enter required CI validation when the repository contains meaningful content that the capability protects.

### Pull-request validation

Required CI validation will run for pull requests targeting the primary protected branch.

Pull requests must pass the required validation gate before normal merge.

The primary branch should be protected so that repository correctness does not depend on contributors remembering to execute checks manually.

Direct pushes or administrative bypass mechanisms, when permitted by repository governance, must remain exceptional rather than the ordinary delivery workflow.

### Primary-branch validation

CI will also run after changes reach the primary branch.

Pull-request validation reduces risk but does not make primary-branch validation redundant.

Primary-branch execution verifies the exact merged commit and provides a stable post-merge signal for future release, deployment, packaging, or downstream automation.

### Manual execution

Important CI workflows should support manual execution where GitHub Actions provides an appropriate mechanism.

This supports:

- diagnostics;
- infrastructure investigation;
- validation after configuration changes;
- controlled reruns;
- future release workflows.

Manual execution must not require a separate validation implementation.

### Required CI gate

Orion will expose a **stable aggregate required CI gate** for branch protection.

Conceptually:

```text
static validation ──────┐
type checking ──────────┤
unit tests ─────────────┤
integration tests ──────┤
browser tests ──────────┤
E2E tests ──────────────┤
build validation ───────┤
                        ↓
                 required CI gate
```

The specific internal jobs may evolve without requiring branch-protection configuration to track every implementation change.

The aggregate gate succeeds only when all required jobs for that repository state succeed.

This creates a stable external contract between CI implementation and repository governance.

### CI execution environment

GitHub-hosted Linux runners will be Orion's default CI execution environment initially.

The foundation will not run a Windows/macOS operating-system matrix by default.

Additional operating systems should be introduced only when a product or supported runtime genuinely depends on cross-platform behavior.

The CI operating system does not imply that every Orion application must deploy on the same operating system.

### Runtime versions

CI must use repository-pinned runtime and package-manager versions.

The CI workflow must not independently choose a different Node.js or pnpm release from the versions established by repository configuration.

Conceptually:

```text
repository
├── Node version policy / pin
└── packageManager → pnpm version
        ↓
CI consumes those versions
```

This avoids situations where:

```text
local development
→ Node A / pnpm A

CI
→ Node B / pnpm B
```

silently creates environment-dependent behavior.

### Dependency installation

CI will install dependencies using the committed pnpm lockfile in frozen mode.

The intended requirement is equivalent to:

```text
pnpm install --frozen-lockfile
```

CI must fail when package manifests and the committed lockfile disagree.

CI must not automatically rewrite the lockfile to make a validation run succeed.

Dependency changes belong in the source change being reviewed.

### CI caching

Caching is an optimization, not a correctness requirement.

The initial CI strategy may cache the pnpm package store using the committed lockfile as part of the cache identity.

`node_modules` will not be treated as a portable canonical build artifact.

A cache miss must produce the same correct result as a cache hit.

CI must never depend on cached state that cannot be reconstructed from canonical repository inputs.

Task-output or build caching will not be introduced globally until repository scale demonstrates a meaningful need.

If Orion later adopts a monorepo task runner or remote cache, the existing repository commands must remain the validation interface.

### Full validation before affected-project optimization

Orion will initially favor complete required validation over sophisticated affected-project analysis.

Path-based skipping, dependency-graph selective testing, incremental CI, and remote execution may eventually reduce CI cost substantially.

They also add complexity and create the risk that an incorrect dependency graph allows a relevant validation step to be skipped.

Therefore:

```text
full deterministic validation first
    ↓
measure CI cost
    ↓
introduce selective execution when justified
```

Affected-project optimization should only be introduced when the repository is large enough for the saved execution time to justify the additional correctness machinery.

### Pull-request concurrency

Superseded validation runs for the same pull request should be cancelled when practical.

When a contributor pushes a new commit to a pull request, continuing expensive validation for an obsolete commit normally provides little value.

This is particularly relevant for:

- integration tests;
- browser tests;
- E2E tests;
- large builds.

Primary-branch validation should not be cancelled merely because another commit is pushed unless the workflow semantics explicitly make doing so safe.

### Integration-test infrastructure

CI integration tests will use the strategy established by ADR-0009.

Where tests require PostgreSQL:

```text
GitHub Actions runner
    ↓
Testcontainers
    ↓
real PostgreSQL
    ↓
committed migrations
    ↓
Vitest integration tests
```

CI must not use a simplified database substitute merely to make CI configuration easier.

Container infrastructure is a testing implementation detail and does not establish Docker or a particular container platform as Orion's application deployment strategy.

### Browser testing

Browser-dependent component tests will use the Vitest Browser Mode strategy established by ADR-0009.

Full browser E2E tests will use Playwright Test.

Chromium remains the initial routine browser.

Additional browser matrices should be introduced according to product support requirements.

CI may later shard browser or E2E suites when execution time justifies doing so.

### Test artifacts

Diagnostic test artifacts may be retained when they materially improve failure investigation.

Examples include:

- Playwright traces;
- screenshots;
- videos;
- coverage reports;
- structured test reports.

Artifact retention should remain bounded.

Artifacts must follow Orion's security and data-classification policies and must not become an uncontrolled channel for exposing secrets or sensitive test data.

### GitHub Actions security

GitHub Actions workflows must follow least-privilege principles.

Workflow and job permissions must be declared explicitly when access beyond the minimal default is required.

Ordinary validation jobs should normally require no repository write permission.

The expected baseline is conceptually:

```text
repository contents
    → read

repository modification
    → none
```

unless a job has an explicit responsibility requiring greater access.

### Action pinning

External GitHub Actions will be pinned to **full-length immutable commit SHAs**.

Readable release/version information should remain present as an adjacent comment or equivalent maintainability aid where useful.

Conceptually:

```yaml
uses: actions/checkout@<full-commit-sha> # vX.Y.Z
```

rather than:

```yaml
uses: actions/checkout@vX
```

as the canonical Orion security posture.

Dependency automation will keep these action pins current.

This requirement applies to GitHub-maintained actions as well as third-party actions when they are referenced externally.

Repository-local actions remain controlled by repository history.

### Third-party Actions

Third-party GitHub Actions must not be introduced merely for convenience when a small repository-owned command provides the same capability with lower supply-chain exposure.

When a third-party action provides meaningful value, its:

- publisher;
- maintenance status;
- permissions;
- inputs;
- supply-chain exposure;

should be reviewed.

The number of privileged workflow dependencies should remain intentionally small.

### Untrusted pull requests

Untrusted pull-request code must not execute with privileged credentials.

Validation workflows triggered by pull requests should be designed so that code under review cannot obtain:

- deployment credentials;
- production secrets;
- privileged repository tokens;
- unrelated infrastructure access.

Orion will avoid using `pull_request_target` for ordinary build or validation execution of untrusted pull-request code.

If that event is ever required for a metadata-only workflow, untrusted pull-request contents must not be checked out and executed with privileged context.

### CI secrets

Ordinary validation should require as few secrets as possible.

Tests should use ephemeral test credentials and local container infrastructure instead of external production-like credentials where practical.

CI secrets must:

- follow least privilege;
- be scoped narrowly;
- not be printed;
- not be copied into artifacts;
- not be required for unrelated validation jobs.

### OIDC for future privileged workflows

Future workflows that need to authenticate to supported cloud providers or publishing systems should prefer short-lived identity federation through OpenID Connect when practical.

Long-lived cloud credentials stored as GitHub secrets should not be the preferred Orion pattern.

The intended model is:

```text
GitHub Actions identity
    ↓
OIDC
    ↓
short-lived provider credential
```

rather than:

```text
GitHub secret
    ↓
long-lived cloud access key
```

Actual deployment authentication is outside the scope of this ADR and will be decided when deployment targets exist.

### Dependency automation

Orion will use **Renovate as its primary dependency-update automation tool**.

Renovate will manage relevant repository dependencies including, where supported:

- npm/pnpm dependencies;
- development dependencies;
- runtime dependencies;
- GitHub Actions references;
- toolchain versions represented in supported files;
- other machine-readable dependency declarations introduced later.

Dependabot version-update pull requests will not be enabled alongside Renovate for the same dependency ecosystem.

Running two competing version-update systems would create redundant pull requests and overlapping configuration.

### Renovate configuration

Renovate configuration will be stored in the repository and treated as repository policy.

The configuration should begin from Renovate's recommended baseline and be customized deliberately.

A **Dependency Dashboard** will be enabled to provide a machine-maintained overview of:

- pending updates;
- deferred updates;
- major upgrades;
- deprecated dependencies;
- dependency-maintenance state.

This provides both human contributors and AI agents with an explicit view of dependency debt.

### Dependency update cadence

Routine dependency updates will be grouped and scheduled to reduce unnecessary pull-request noise.

The initial approach will favor a **weekly routine update cadence** for ordinary dependency updates.

Security remediation updates should not be intentionally delayed to the routine maintenance window when Renovate identifies them as security-related.

Update frequency may later be adjusted based on repository activity and risk.

### Dependency grouping

Related dependency families may be grouped when they are expected to evolve together.

Examples may include ecosystems such as:

```text
React ecosystem
TanStack ecosystem
Prisma ecosystem
OpenTelemetry ecosystem
Fastify ecosystem
Vitest ecosystem
Playwright ecosystem
```

Grouping should reduce update noise without creating large unrelated upgrade pull requests.

A generic "update every dependency" mega-group will not be the default.

The objective is:

```text
coherent upgrade units
```

rather than:

```text
minimum possible number of pull requests
```

### Major dependency upgrades

Major-version upgrades require deliberate review.

Renovate should expose pending major upgrades and may require Dependency Dashboard approval before opening selected major-upgrade pull requests when that improves signal.

A major version must not be ignored indefinitely merely to keep automation quiet.

Major upgrades should remain visible even when they are intentionally deferred.

### Dependency automerge

Automatic merging of dependency updates will be **disabled by default initially**.

Passing CI is necessary but does not prove that every dependency change is semantically harmless.

Selective automerge may later be enabled for explicitly identified low-risk dependency classes when sufficient repository experience demonstrates that doing so is safe.

Examples might eventually include narrowly scoped patch updates to development-only tooling.

There will be no blanket:

```text
patch update
    → automerge
```

rule initially.

### Lockfile maintenance

Automated dependency updates must keep the shared pnpm lockfile synchronized with package manifests.

The lockfile remains committed repository state.

Dependency automation must not create manifest changes without the corresponding deterministic lockfile update.

Periodic lockfile maintenance may be enabled if it produces concrete value.

### Dependency security alerts

Orion will enable GitHub's dependency graph and **Dependabot vulnerability alerts** where supported.

This use of Dependabot is distinct from Dependabot version-update automation.

The responsibility split is:

```text
Renovate
    → routine/version dependency updates

Dependabot alerts / GitHub advisory data
    → vulnerability visibility
```

Security findings should result in explicit remediation, acceptance, or documented exception rather than being silently ignored.

### Dependency review

Where the repository's GitHub feature entitlement supports it, Orion will enable the GitHub dependency review capability for pull requests.

Dependency review should prevent newly introduced vulnerable dependencies from entering unnoticed.

The initial enforcement threshold should block newly introduced vulnerabilities rated **high or critical**, unless an explicitly reviewed exception exists.

The policy may become stricter for applications with higher risk or regulatory requirements.

Dependency review is an additional guardrail and does not replace repository tests or dependency update automation.

### Static security analysis

Where available for the repository, Orion will enable **GitHub CodeQL for JavaScript and TypeScript security analysis**.

Code scanning should be represented by repository-visible configuration when customization is required.

The initial objective is to detect actionable security defects without making a paid GitHub security product a mandatory dependency of the Orion architecture.

If CodeQL is unavailable for a particular private repository, the absence of that GitHub entitlement does not invalidate the Orion foundation.

A different SAST implementation may be introduced when the risk profile of that application requires one.

### Secret scanning and push protection

GitHub secret scanning and push protection should be enabled where available.

These capabilities complement Orion's existing secrets-management policies by detecting common credentials committed to repository history or preventing supported secrets from being pushed.

They do not eliminate the need to:

- avoid committing secrets;
- rotate exposed credentials;
- scope credentials narrowly;
- use environment or secret-management systems appropriately.

A secret that reaches Git history must be treated as potentially exposed even if the commit is later removed.

### Dependency audit commands

Package-manager vulnerability-audit commands may be used for diagnostics or additional automation.

They will not initially serve as Orion's sole security gate.

Security decisions should combine:

- dependency advisory visibility;
- dependency review when available;
- automated remediation;
- tests;
- application-specific risk assessment.

This avoids making one advisory command the complete definition of dependency security.

### License policy

This ADR does not establish a global dependency-license allowlist or denylist.

Acceptable licensing depends on how a specific Orion-based product is:

- distributed;
- sold;
- embedded;
- hosted;
- modified.

License enforcement should be added when the product's legal/distribution model establishes the required policy.

### CI-generated modifications

Required validation workflows must not silently modify tracked source files to make CI pass.

This preserves ADR-0003's distinction between:

```text
validation
    → check

fixing
    → explicit developer action
```

CI may generate temporary artifacts for validation, but source corrections belong in a committed change.

### Reusable workflows and custom Actions

Orion will not introduce reusable workflows, custom Actions, or a CI abstraction framework merely to make the initial workflow appear generic.

The initial workflow should remain understandable directly from the repository.

Reusable CI abstractions may be introduced when genuine duplication exists across:

- multiple workflows;
- multiple repositories;
- multiple release pipelines.

Complexity must provide measurable maintenance value.

### Continuous delivery

This ADR establishes **continuous integration**, not a global continuous-delivery strategy.

Successful CI means:

```text
the repository revision satisfies required validation
```

It does not imply:

```text
automatically deploy revision to production
```

Deployment targets, environments, release policies, approvals, rollbacks, and CD architecture remain deferred until an Orion application has concrete deployment requirements.

## Rationale

GitHub Actions is selected because the repository already uses GitHub as its collaboration and source-management platform and Actions provides direct integration with pull requests, protected branches, repository permissions, artifacts, security capabilities, and repository automation.

More importantly, Orion does not make GitHub Actions the owner of validation semantics.

The repository remains authoritative.

This gives:

```text
local environment
CI
AI coding environment
future alternative CI
```

a common validation interface.

If Orion later needs to move a project to another CI provider, repository commands such as:

```text
pnpm validate
pnpm test:integration
pnpm test:e2e
```

remain usable.

GitHub-specific orchestration can therefore be replaced without redesigning the application's quality model.

A stable aggregate CI gate prevents branch-protection configuration from becoming coupled to the current internal job topology.

Jobs can later be:

- split;
- combined;
- sharded;
- cached;
- migrated to another runner class;

while the repository still exposes one stable required result.

Frozen lockfile installation ensures CI evaluates the dependency graph actually committed to the repository instead of resolving a subtly different graph during validation.

Caching only reconstructible package-manager state preserves deterministic behavior and avoids making mutable CI cache content part of correctness.

Full validation is preferred initially because selective monorepo validation requires a sufficiently reliable dependency graph.

Orion already permits adding a dedicated task runner later if repository scale justifies affected-project analysis and advanced caching.

Introducing these mechanisms only after measurement avoids increasing CI complexity before it provides meaningful value.

Renovate is selected for dependency automation because Orion requires more than simple individual package bumping.

A large monorepo benefits from configurable:

- grouping;
- schedules;
- dependency dashboards;
- major-upgrade policies;
- GitHub Actions updates;
- lockfile maintenance;
- future custom dependency sources.

The Dependency Dashboard also improves discoverability of dependency maintenance work and makes intentionally deferred upgrades visible instead of silently forgotten.

Automerge remains disabled initially because dependency correctness cannot be inferred from semantic-version classification alone.

A successful test suite is an important signal, but dependency changes can modify behavior outside the currently exercised test surface.

Orion prefers deliberate automation over unconditional automation.

Pinning external GitHub Actions to immutable commit SHAs reduces dependency on mutable tags.

Combining SHA pins with Renovate allows Orion to preserve both:

```text
immutable execution
```

and:

```text
maintainable upgrades
```

without manually monitoring every action repository.

Explicit minimal `GITHUB_TOKEN` permissions reduce the blast radius of a compromised workflow dependency.

This becomes increasingly important as CI gains access to:

- artifacts;
- packages;
- deployment systems;
- security reports;
- cloud environments.

Separating ordinary validation from privileged workflows also makes pull requests from untrusted sources safer.

OIDC is preferred for future deployment authentication because short-lived identity federation reduces dependence on long-lived cloud credentials stored in repository automation.

Dependency vulnerability alerts, dependency review, CodeQL, and secret scanning provide complementary security capabilities.

No single mechanism is treated as sufficient.

Availability-based GitHub security features remain optional capabilities because Orion must remain usable across repositories with different GitHub plans and hosting arrangements.

Finally, CD is deliberately excluded.

Deployment architecture depends heavily on the target environment, and Orion has explicitly chosen not to select a global cloud or deployment platform.

CI can therefore become mature without prematurely deciding where applications must run.

## Alternatives Considered

### GitLab CI

GitLab CI provides a mature repository-integrated CI/CD platform and would be technically capable of implementing Orion's validation requirements.

It was not selected because Orion's current source-management and collaboration environment is GitHub.

Selecting GitLab CI would introduce a second primary platform without a concrete benefit.

Repository-owned validation commands preserve the possibility of using GitLab CI for a future project when necessary.

### Buildkite, CircleCI, or Similar External CI Platforms

Dedicated CI platforms may provide advanced scaling, execution, or enterprise capabilities.

They were not selected as the foundation default because GitHub Actions is sufficient for Orion's current requirements and requires less platform integration.

A future repository may adopt another CI provider if scale, compliance, runner requirements, or economics justify the change.

### Dedicated Monorepo Task Runner for CI

Orion could introduce Nx, Turborepo, or another task-graph system specifically to optimize CI from the beginning.

This could provide affected-project detection, task caching, and remote execution.

It was not selected because ADR-0002 already established that such tooling should enter only when real repository scale makes it valuable.

CI will initially execute the complete validation capabilities directly through pnpm workspace commands.

### Dependabot Version Updates

Dependabot can create dependency-update pull requests and integrates directly with GitHub.

It was not selected as Orion's primary version-update system because Renovate provides a broader and more configurable dependency-maintenance model suited to a growing monorepo.

Dependabot vulnerability alerts may still be used as a security signal.

Dependabot version-update automation and Renovate should not manage the same dependencies simultaneously.

### Automatic Merge for All Patch Updates

Orion could automatically merge every dependency patch update that passes CI.

This would minimize maintenance effort.

It was not selected because semantic-version classification does not guarantee operational safety, and the initial foundation does not yet have enough production history to justify blanket dependency automerge.

Selective automerge may be introduced later.

### Mutable GitHub Action Tags

GitHub Actions could be referenced through convenient tags such as:

```text
actions/checkout@vX
```

This is easy to read and update manually.

It was not selected as the Orion security baseline because a mutable reference allows workflow execution to change without a repository commit changing the reference.

Full commit SHA pinning provides a stronger reproducibility boundary.

Readable version comments preserve maintainability.

### Long-Lived Cloud Credentials in Repository Secrets

Future deployment workflows could store permanent cloud credentials in GitHub secrets.

This is broadly supported and straightforward.

It is not Orion's preferred future authentication model because long-lived credentials create greater rotation and exposure risk.

OIDC-based short-lived federation should be preferred where supported.

### Mandatory Paid GitHub Security Features

Orion could require dependency review, private-repository CodeQL, secret scanning, and push protection as mandatory capabilities for every repository.

This would provide a stronger uniform security baseline.

It was not selected because feature availability depends on repository visibility and GitHub plan.

Orion should take advantage of those capabilities when available without making a commercial GitHub product a prerequisite for adopting the foundation.

### Package Manager Audit as the Sole Vulnerability Gate

Orion could fail every pull request solely based on `pnpm audit` or an equivalent package-manager command.

This would provide a simple portable rule.

It was not selected because dependency-security assessment benefits from context including whether a vulnerability is newly introduced, its severity, available remediation, runtime exposure, and advisory quality.

Package-manager auditing remains useful but is not the complete supply-chain security strategy.

### CI-Specific Validation Scripts

GitHub workflow steps could independently run tools with CI-specific arguments and configuration.

This might make workflow files self-contained.

It was not selected because it would make CI behavior harder to reproduce locally and risk divergence from `pnpm validate`.

Repository scripts remain the authoritative interface.

## Consequences

### Positive

- Orion has a concrete CI platform integrated with the repository host.
- Local development and CI use the same validation capabilities.
- AI agents can reproduce CI failures through repository commands.
- `pnpm validate` remains the stable validation contract.
- CI jobs can evolve independently behind a stable aggregate required check.
- Pull requests receive mechanical validation before merge.
- The exact merged primary-branch revision is validated again.
- Dependency installation is deterministic through the committed frozen lockfile.
- CI caching cannot become an implicit source of correctness.
- Real PostgreSQL and browser testing remain supported in CI.
- Superseded pull-request runs can be cancelled to control resource usage.
- Renovate provides one explicit dependency-update automation system.
- Dependency Dashboard makes pending dependency maintenance visible.
- Related technology ecosystems can be updated coherently.
- Major upgrades remain visible and deliberate.
- GitHub Actions dependencies are immutable at the referenced commit.
- Renovate can maintain action pins without sacrificing reproducibility.
- Explicit workflow permissions reduce CI blast radius.
- Untrusted pull-request code remains separated from privileged credentials.
- Future deployment workflows can use OIDC rather than long-lived credentials.
- GitHub dependency/security capabilities can be adopted without coupling application code to them.
- CI remains separate from deployment architecture.
- Orion does not require a specific paid GitHub security tier.

### Negative

- GitHub Actions becomes the default CI orchestration platform.
- Full SHA action pins are less readable without accompanying version comments.
- Renovate introduces another repository automation configuration surface.
- Weekly dependency grouping may delay routine non-security upgrades compared with immediate per-release pull requests.
- Manual dependency review creates some ongoing maintenance work because broad automerge is disabled.
- Full repository validation may become increasingly expensive as the monorepo grows.
- GitHub-hosted runner performance and cost may eventually require optimization.
- Testcontainers and Playwright increase CI resource requirements.
- Security capabilities may differ between public and private repositories depending on GitHub feature availability.
- A conditional security baseline provides less uniform enforcement than mandating one paid toolset.
- Branch-protection and repository-security settings exist partly outside version-controlled source and therefore require administrative configuration.
- CI hardening adds maintenance work when GitHub Actions dependencies release new versions.

### Operational or Migration Impact

The repository will introduce GitHub Actions workflows under:

```text
.github/workflows/
```

when implementation begins.

Initial CI should include pull-request and primary-branch validation.

The workflow must install the repository-pinned Node.js and pnpm versions and perform a frozen-lockfile dependency installation.

External GitHub Actions must be referenced by full commit SHA.

The repository should enable a protected primary branch with the aggregate Orion CI gate configured as a required status check.

Renovate configuration must be committed to the repository.

Initial Renovate behavior should include:

```text
recommended baseline
Dependency Dashboard
weekly routine updates
security updates without routine delay
coherent dependency grouping
major upgrades requiring deliberate review
automerge disabled by default
GitHub Actions update management
```

Dependabot version-update configuration should not be enabled for ecosystems already managed by Renovate.

GitHub dependency vulnerability alerts should be enabled.

Dependency review, CodeQL, secret scanning, and push protection should be enabled where repository visibility, product entitlement, and platform capabilities permit.

Required validation jobs should use minimal `GITHUB_TOKEN` permissions.

Pull-request validation must not receive production deployment credentials.

Future privileged workflows should prefer OIDC-based authentication when the destination platform supports it.

CI diagnostic artifacts must use bounded retention and must not contain secrets or sensitive production data.

Repository validation should initially favor complete execution.

CI optimization through:

```text
affected-project detection
remote task caching
advanced path filtering
large test matrices
test sharding
self-hosted runners
```

should be introduced only when measured CI performance or cost demonstrates the need.

No deployment workflow is required by this ADR.

Selecting a deployment target or establishing CD should occur only when a concrete application provides the necessary operational requirements.

Routine compatible GitHub Actions, Renovate, or CI configuration updates do not require a new ADR when they preserve the responsibilities defined here.

Changing Orion's default CI platform, replacing Renovate as the primary dependency automation strategy, or materially changing the local-versus-CI validation contract should be documented by an ADR that supersedes this decision.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0009: Establish Testing Strategy and Tooling](0009-establish-testing-strategy-and-tooling.md)

Related ADR: [ADR-0010: Establish Observability, Logging, Tracing, Metrics, and Error Reporting Strategy](0010-establish-observability-logging-tracing-metrics-and-error-reporting-strategy.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [testing strategy](../architecture/testing-strategy.md)

Related policy: [versioning and compatibility](../architecture/versioning-and-compatibility.md)

Related policy: [secrets management](../security/secrets-management.md)

Related policy: [continuous integration](../architecture/continuous-integration.md)

Related policy: [contributing](../contributing.md)

External reference: GitHub Actions documentation.

External reference: GitHub Actions secure-use guidance.

External reference: GitHub `GITHUB_TOKEN` permission documentation.

External reference: GitHub OpenID Connect documentation.

External reference: GitHub Dependency Review documentation.

External reference: GitHub CodeQL documentation.

External reference: GitHub Secret Scanning and Push Protection documentation.

External reference: Renovate documentation.
