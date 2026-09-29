# ADR-0008: Select React, Vite, and TanStack for Web Applications

**Status:** accepted

**Date:** 2026-09-23

## Context

Orion requires a default web application stack before the initial web application and its integration with the backend API can be implemented consistently.

The selected stack must support projects ranging from small applications to large, long-lived business systems with complex navigation, substantial user interfaces, large datasets, many application screens, and potentially extensive client-side state.

Performance is an important requirement, but Orion must optimize for production application performance rather than framework microbenchmarks alone.

The web stack should therefore balance:

- runtime UI performance;
- build and development performance;
- code-splitting capabilities;
- bundle optimization;
- strong TypeScript integration;
- predictable routing;
- explicit URL state;
- efficient server-state management;
- compatibility with generated API clients;
- mature ecosystem support;
- maintainability in large codebases;
- accessibility tooling;
- testing ecosystem;
- observability integration;
- effective use by human contributors and AI agents;
- incremental scalability from small applications to large systems.

Orion has already established Fastify as the authoritative backend HTTP boundary and OpenAPI as the interoperable API contract.

The web application should therefore behave primarily as an API client rather than introducing a second backend architecture by default.

The intended boundary is:

```text
web application
    ↓
generated API client
    ↓
HTTP / JSON
    ↓
Fastify API
    ↓
application layer
```

The default web stack must not encourage business rules, database access, authentication authority, or backend application behavior to migrate into the web application merely because a full-stack framework makes those capabilities available.

At the same time, some future products may have legitimate requirements for server-side rendering, static generation, or other server-assisted rendering strategies.

Those capabilities should remain available when product requirements justify them without becoming baseline complexity for all Orion applications.

## Decision

Orion will use **React 19.x as its default web UI framework**.

Orion web applications will use **React Compiler** as the default React optimization strategy when compatible with the selected application toolchain.

Orion will use **Vite 8.x as its initial web development and build tooling**.

The exact React, React Compiler, Vite, and related package versions will be pinned mechanically by repository dependency management rather than permanently fixed by this ADR.

Compatible future upgrades do not require a new ADR when they preserve the architectural responsibilities established here.

### Default web architecture

Orion web applications will use a **client-first single-page application architecture by default**.

The normal architecture is:

```text
browser
    ↓
React application
    ↓
generated TypeScript API client
    ↓
HTTP / JSON
    ↓
Fastify API
```

The Fastify backend remains the authoritative application and data boundary.

Web applications must not access PostgreSQL, Prisma, or backend persistence infrastructure directly.

Business rules that must remain authoritative across clients belong behind the backend application boundary rather than exclusively in the web application.

The client-first default applies primarily to application-oriented web systems such as:

- ERP applications;
- CRM systems;
- administrative applications;
- authenticated SaaS products;
- operational dashboards;
- internal business systems;
- other interaction-heavy web applications.

### Server rendering

Server-side rendering, static-site generation, React Server Components, or other server-assisted rendering models will **not be baseline Orion requirements**.

They may be introduced when concrete product requirements justify them, including concerns such as:

- search-engine indexing;
- public content discovery;
- first-content requirements;
- marketing pages;
- content-heavy public websites;
- e-commerce discovery surfaces;
- other workloads that materially benefit from server rendering.

Introducing server rendering must not silently move authoritative backend responsibilities from the Fastify application into the web application.

A full-stack React framework is therefore not part of Orion's default web foundation.

### React Compiler

React Compiler will be enabled as the default React compile-time optimization mechanism where supported by the selected toolchain.

Orion should prefer:

```text
clear React code
    ↓
React Compiler
    ↓
automatic optimization
    ↓
profiling
    ↓
manual optimization only when demonstrated necessary
```

rather than routinely adding manual memoization throughout the codebase without performance evidence.

Manual techniques such as memoization remain available when profiling demonstrates a concrete benefit or when compiler behavior cannot represent a required optimization.

Performance-sensitive behavior should be measured rather than inferred solely from component structure.

### Build and development tooling

Vite will provide the standard development server, frontend transformation pipeline, and production build entry point for Orion web applications.

Web applications should use Vite's native capabilities and ecosystem directly where sufficient rather than introducing an additional web meta-framework solely for build orchestration.

Production builds must support code splitting and lazy loading where these provide meaningful improvements to initial loading or application navigation.

Large applications should avoid requiring the browser to download code for unrelated application areas before those areas are needed.

### Routing

Orion will use **TanStack Router as its default client-side router**.

Routing should be type-safe across:

- route paths;
- path parameters;
- search parameters;
- navigation;
- route context;
- route-level data dependencies where applicable.

URL state should be treated as an explicit application-state category.

State that should survive refresh, deep linking, bookmarks, browser navigation, or sharing should normally be represented in the URL where appropriate.

Examples include:

- pagination;
- filtering;
- sorting;
- active views;
- selected tabs when navigation-significant;
- search criteria;
- other shareable navigation state.

TanStack Router's typed search-parameter model should be preferred over repeated manual parsing of `URLSearchParams`.

The exact choice between file-based and code-based route organization is an implementation decision.

Orion may establish a default repository pattern once the initial web application provides enough concrete experience to do so.

### Server state

Orion will use **TanStack Query as its default server-state management mechanism for React applications**.

Server state includes remote state obtained through application APIs whose ownership and lifecycle remain external to the React component tree.

Examples include:

- customers;
- orders;
- invoices;
- inventory;
- account data;
- backend search results;
- paginated API collections.

TanStack Query will be responsible for concerns such as:

- queries;
- mutations;
- caching;
- synchronization;
- refetching;
- invalidation;
- request lifecycle state;
- stale-data behavior;
- background data refresh where appropriate.

TanStack Query must consume the generated API client established by ADR-0007 rather than redefining transport contracts independently.

The intended dependency flow is:

```text
React component
    ↓
TanStack Query
    ↓
generated API SDK
    ↓
openapi-fetch
    ↓
HTTP / JSON
    ↓
Fastify
```

### State ownership

Orion will distinguish between different categories of frontend state.

The default model is:

```text
server state
    → TanStack Query

navigation/shareable state
    → TanStack Router / URL

local interaction state
    → React state

limited shared UI state
    → React Context where appropriate
```

Examples of local interaction state include:

- modal visibility;
- temporary selections;
- expanded sections;
- local editing state;
- transient interaction state.

A general-purpose global state library such as Redux, Zustand, MobX, or an equivalent will **not be part of the initial Orion foundation**.

Such a library may be introduced when a concrete class of client state cannot be represented cleanly through React state, context, URL state, or TanStack Query.

A global state library must solve a demonstrated state-ownership problem rather than serve as the default destination for arbitrary application data.

### API integration

Web applications will consume the generated TypeScript API integration established by ADR-0007.

The normal flow is:

```text
TypeBox contracts
    ↓
generated OpenAPI
    ↓
openapi-typescript
    ↓
openapi-fetch
    ↓
TanStack Query
    ↓
React UI
```

Web applications must not import Prisma types, Fastify transport types, database models, or other backend-internal representations.

Direct imports of authored server contract implementations should also not replace the generated OpenAPI boundary when the purpose is to consume the HTTP API.

This keeps the first-party web application subject to the same externally interoperable contract as other clients.

### Performance strategy

Orion will treat frontend performance as a system property rather than a framework benchmark.

Performance work should consider, where relevant:

- JavaScript bundle size;
- route-level code splitting;
- lazy loading;
- API latency;
- request waterfalls;
- unnecessary network requests;
- server-state caching;
- large DOM trees;
- list and table virtualization;
- expensive rendering;
- image and asset delivery;
- unnecessary component updates;
- client-side computation;
- memory usage;
- browser profiling results.

Performance optimizations that materially increase code complexity should normally be supported by profiling or other evidence.

The selected framework does not remove the need for performance budgets, profiling, observability, or careful UI architecture in large applications.

### UI libraries and design systems

This ADR does not select a component library or design system.

UI component systems, styling approaches, accessibility primitives, charting libraries, data grids, form libraries, and similar product-facing dependencies should be selected when their concrete requirements are understood.

Shared UI code should be introduced only when it represents a genuine reusable responsibility.

## Rationale

React provides the strongest overall fit for Orion when runtime performance is considered together with ecosystem maturity, TypeScript support, tooling availability, library compatibility, organizational scalability, testing support, and long-term maintainability.

Other UI frameworks can provide lower rendering overhead in specific benchmarks.

Orion does not treat framework rendering benchmarks as the sole measure of application performance.

In large business applications, user-perceived performance is also heavily influenced by network behavior, data fetching, bundle composition, large data visualizations, DOM size, rendering architecture, server latency, and application-specific computation.

React provides sufficient runtime performance while offering a particularly broad ecosystem for the kinds of capabilities large Orion applications may require.

These may include:

- complex data grids;
- virtualization;
- charts;
- rich editors;
- accessibility libraries;
- drag-and-drop interfaces;
- forms;
- testing tools;
- monitoring integrations;
- component systems;
- mobile ecosystem interoperability.

React also has a large body of conventions, documentation, examples, and production experience.

This improves discoverability for both human contributors and AI agents and reduces the likelihood that Orion must build custom integrations for common application requirements.

React Compiler further improves the fit by providing a compile-time optimization path for components and hooks.

This allows Orion to begin with clear code rather than making widespread manual memoization part of its normal development style.

Vite is selected because it provides a fast and comparatively narrow development and build layer without imposing an application architecture.

This matches the same principle used when selecting Fastify:

```text
Orion
    → owns application architecture

tooling
    → implements focused infrastructure responsibilities
```

Vite therefore provides web tooling without becoming a second full-stack architecture.

TanStack Router is selected because Orion places strong value on TypeScript correctness and explicit state ownership.

Routing is not merely a mapping between strings and components in large applications.

URLs frequently encode meaningful application state such as filtering, sorting, pagination, selected views, and identifiers.

Type-safe paths, parameters, search state, and navigation reduce errors and make large route trees easier to refactor safely.

TanStack Query is selected because server state has different ownership and lifecycle semantics from local UI state.

Remote data must account for caching, synchronization, invalidation, mutations, stale data, asynchronous errors, and background updates.

Treating those concerns as ordinary React component state encourages repeated application-specific implementations.

A dedicated server-state system provides a clearer responsibility boundary.

The separation:

```text
TanStack Query
    → server state

TanStack Router
    → URL/navigation state

React
    → local UI state
```

reduces the need for a universal global state container.

This provides a smaller initial foundation while leaving specialized client-state libraries available when a real requirement appears.

The client-first SPA model is selected because Orion's expected reference applications are application-oriented and already have an explicit authoritative Fastify backend.

Introducing a full-stack React framework by default would add another server-side execution environment and create opportunities for backend responsibilities to become duplicated across the API and web applications.

Server rendering remains available when a product's actual delivery requirements justify the additional architecture.

## Alternatives Considered

### SolidJS

SolidJS provides fine-grained reactive updates and can achieve very low runtime UI overhead.

It is a strong choice when minimizing reactive and rendering overhead is a dominant requirement.

It was not selected because Orion must optimize for more than framework runtime performance.

React provides a substantially broader ecosystem, more third-party integrations, more established enterprise usage patterns, stronger availability of specialized UI libraries, and greater familiarity across developers and AI tooling.

The expected performance advantage of SolidJS does not currently outweigh those ecosystem and long-term maintenance considerations for Orion's general-purpose foundation.

SolidJS may still be appropriate for a specialized future application whose measured requirements strongly favor its rendering model.

### Svelte

Svelte provides a compiler-oriented approach to frontend development with strong runtime characteristics and concise application code.

It can produce highly performant web applications and offers an attractive development model.

It was not selected because React currently provides a broader ecosystem for the range of complex application requirements Orion is expected to support.

Adopting Svelte as the default would trade some framework simplicity and runtime characteristics for a smaller ecosystem and fewer standardized integrations in several enterprise-oriented areas.

### Next.js or Another Full-Stack React Framework

A full-stack React framework can provide server-side rendering, static generation, server components, integrated routing, and server execution capabilities.

These features are valuable for many products.

A full-stack framework was not selected as Orion's default because Orion already defines Fastify as its authoritative backend application boundary.

Introducing another server-side application layer by default would increase architectural complexity and could encourage business logic, database access, authentication authority, or application operations to become divided between two server environments.

Products that require server rendering may evaluate an appropriate framework when those requirements exist.

### React Router

React Router provides mature and widely used routing for React applications.

It is a strong general-purpose router and would be technically capable of supporting Orion applications.

TanStack Router was selected because Orion gives additional weight to end-to-end TypeScript inference for paths, navigation, path parameters, search parameters, and route context.

Typed URL state is particularly valuable for large business applications with complex filtering and navigation requirements.

### Redux or Another Global State Store as a Baseline

A centralized client-state store could provide one consistent mechanism for state shared throughout a web application.

This can be valuable in applications with complex global client-only state.

It was not selected as a baseline because much of the state commonly placed into global stores belongs to more specific categories:

```text
remote data
    → server state

filters and navigation
    → URL state

temporary interactions
    → local component state
```

Adding a general-purpose global store before these mechanisms prove insufficient would create another state model without a demonstrated responsibility.

### Framework-Native Data Loading as the Only Server-State Mechanism

Routing systems can load data as part of route transitions.

This can be effective for navigation-dependent data.

It was not selected as the complete server-state strategy because large interactive applications also require mutations, invalidation, caching, background synchronization, and data usage outside initial route loading.

TanStack Router and TanStack Query may cooperate while retaining separate responsibilities for navigation and server-state lifecycle.

## Consequences

### Positive

- Orion receives a mature web framework suitable for both small applications and large business systems.
- React's ecosystem provides broad access to specialized UI libraries and integrations.
- React Compiler provides a standard compile-time optimization path.
- Vite provides fast development and production build tooling without imposing a full-stack application architecture.
- The authoritative backend remains clearly separated from the web application.
- TanStack Router provides strongly typed navigation and URL-state handling.
- Search parameters can become structured, validated application state rather than manually parsed strings.
- TanStack Query provides a consistent model for remote server state.
- API fetching, caching, mutation, invalidation, and synchronization behavior do not need to be reinvented by individual features.
- The generated OpenAPI SDK remains the transport boundary between web and backend applications.
- Server state, URL state, and local UI state have distinct default owners.
- Orion avoids introducing a general-purpose global state library before one is required.
- Client-first SPA architecture keeps the initial deployment and application model comparatively simple.
- Route-based lazy loading and code splitting can allow large applications to grow without requiring all application code to load initially.
- SSR and SSG remain available for applications with concrete requirements rather than becoming mandatory complexity.
- The selected stack is strongly aligned with TypeScript and Orion's existing tooling decisions.

### Negative

- React does not provide the lowest possible runtime rendering overhead among modern UI frameworks.
- React's flexibility can lead to inconsistent component and state patterns if Orion does not establish reference implementations and enforcement where appropriate.
- React Compiler adds another build-time component whose compatibility must be maintained.
- TanStack Router's advanced type inference may increase TypeScript complexity and type-checking cost in very large route trees.
- TanStack Query introduces another caching and lifecycle model that contributors must understand.
- Incorrect query-key design or invalidation behavior can create stale or unnecessarily refetched data.
- Separating server state, URL state, and local state requires contributors to decide which ownership model applies.
- Client-first applications may provide worse initial public-content rendering or search-engine discoverability than server-rendered applications.
- Products requiring SSR or SSG may eventually require an additional framework or rendering architecture.
- Avoiding a global state library does not eliminate the possibility that one will later become necessary.
- First-party API calls pass through the generated HTTP contract rather than using direct TypeScript implementation imports, which adds an intentional interoperability boundary.

### Operational or Migration Impact

Orion does not currently have an established web application stack that must be migrated.

The initial web application will therefore be implemented directly using:

```text
React 19.x
React Compiler
Vite 8.x
TanStack Router
TanStack Query
```

Repository tooling must pin compatible versions of these dependencies through the package-management strategy established by ADR-0002.

React Compiler integration must remain compatible with the selected Vite React integration and must participate in normal repository validation.

The web application must consume the generated API integration established by ADR-0007 rather than accessing backend persistence or implementation internals.

Web build, type-checking, linting, architecture validation, and eventually browser testing must participate in the canonical `pnpm validate` workflow established by ADR-0003.

Production builds must be reproducible through repository tooling.

A general-purpose global state library must not be introduced into the Orion baseline without a demonstrated state-management requirement.

Introducing SSR, SSG, or a full-stack React framework for a particular product does not necessarily supersede this ADR when that application has a documented requirement and the Fastify backend remains authoritative.

Changing Orion's default UI framework or materially replacing the client-first web architecture would require a new ADR that supersedes this decision.

Routine compatible upgrades of React, React Compiler, Vite, TanStack Router, or TanStack Query do not require a new ADR when they preserve the responsibilities established here.

## References

Related ADR: [ADR-0001: Select TypeScript and Node.js as the Primary Language and Runtime](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)

Related ADR: [ADR-0002: Select pnpm for Package and Workspace Management](0002-select-pnpm-for-package-and-workspace-management.md)

Related ADR: [ADR-0003: Establish Repository Validation and Architecture Enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)

Related ADR: [ADR-0004: Select Fastify as the Backend HTTP Framework](0004-select-fastify-as-the-backend-http-framework.md)

Related ADR: [ADR-0007: Establish API Contract, OpenAPI, SDK, and Configuration Schema Strategy](0007-establish-api-contract-openapi-sdk-and-configuration-schema-strategy.md)

Related policy: [principles](../architecture/principles.md)

Related policy: [application boundaries](../architecture/application-boundaries.md)

Related policy: [dependency rules](../architecture/dependency-rules.md)

Related policy: [testing strategy](../architecture/testing-strategy.md)

Related policy: [principles](../api/principles.md)

Related policy: [versioning](../api/versioning.md)

External reference: React documentation.

External reference: React Compiler documentation.

External reference: Vite documentation.

External reference: TanStack Router documentation.

External reference: TanStack Query documentation.
