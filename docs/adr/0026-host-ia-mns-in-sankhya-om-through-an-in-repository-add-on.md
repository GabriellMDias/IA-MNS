# ADR-0026: Host IA-MNS in Sankhya Om through an In-Repository Add-on

**Status:** accepted
**Date:** 2026-10-06
**Supersedes:** [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md), only for keeping the Om host component outside this repository; the surfaces, framing policy, bridge protocol, Sankhya proof and trust gate remain accepted

## Context

[ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md) serves one frontend to the direct URL, PDT Connect and Sankhya Om, and proves a Sankhya identity with a short assertion signed by a component that runs inside the Om and reads the server-side session. It expected each host component to be deployed and maintained outside this repository and requires the signing key to stay outside sources editable by ordinary BI authors. The corresponding human action left the Om packaging open between an Add-on Studio add-on and a BI component such as a JSP page.

Sankhya distributes add-ons as Gradle projects built with its Add-on Studio plugin for the Om runtime: Java 8, a WildFly application server, Sankhya artifacts from its partner repository, and an `appKey` that binds the project to a solution registered in the Sankhya developer area. The official template generated for that solution contains an example backend module (`model`), an example screen module (`vc`), data-dictionary, database-script, dashboard and parameter examples, and a guide that recommends a dedicated Git repository per add-on.

On 2026-10-06 the owner decided the Om packaging and where its code lives. By then the owner had created the IA-MNS solution in the Sankhya developer area, prepared a development Om (Oracle database in Docker and a WildFly configured per the Sankhya developer documentation) and placed the downloaded template in `apps/sankhya-addon`. No add-on behavior had been implemented.

## Decision

- **An Add-on Studio add-on is the definitive Sankhya integration.** A BI component is not used as the definitive solution; a BI page may serve only a disposable proof of concept.
- **The add-on is a thin host.** It makes IA-MNS available as a screen in the Om menu that frames `/embed/sankhya`, answers bridge protocol v1, mints the ADR-0023 assertion from the server-side Om session, and serves the authorize page of the direct-URL "Entrar com Sankhya" flow. It renders no IA-MNS interface of its own and holds no IA-MNS business rule, conversation, permission, Person or link; it creates no ERP tables of its own and does not call the IA-MNS API on behalf of a user.
- **`apps/web` remains the only IA-MNS frontend and `apps/api` the identity of record.** Whether a person opens IA-MNS directly, from the Om or later from PDT Connect, the API verifies the proof, provisions the Person and link at a valid first access, and serves the same history, conversations, permissions and links. A person who opens IA-MNS from the Om sees no IA-MNS sign-in.
- **The add-on lives in this repository as `apps/sankhya-addon`.** It is an application with its own Gradle and Java 8 toolchain, not a pnpm workspace member and not TypeScript. It shares no code with the Node applications; their only contracts are bridge protocol v1 and the assertion contract in the [identity domain](../domains/identity.md), changed on both sides in the same change.
- **Repository Node tooling does not process the add-on.** Formatting, linting and documentation checks exclude its sources and the Sankhya-supplied template text. The add-on is verified with its Gradle build and in the Sankhya development environment; `pnpm validate` and CI do not build it until a later decision adds such a check.
- **Development precedes production.** The add-on is developed and validated in the prepared development Om with development users and keys before any publication to the production Om, which still requires the Om hardening and the `SANKHYA_SESSION_TRUST` approval of ADR-0023.

## Rationale

The add-on and the IA-MNS verifier implement two halves of one security contract. Keeping them in one repository lets one reviewed change update the nonce binding, claims, origins and both sides' tests together, and keeps the add-on visible to the same documentation, plan and review. The owner chose this despite the template's recommendation of a dedicated repository.

An add-on is packaged, versioned and installed through Sankhya's supported channel, and its Java services read the session on the server. A BI component is edited and published inside the Om by BI authors, which conflicts with ADR-0023's key-custody constraint and keeps the integration outside version control.

Keeping the add-on thin preserves ADR-0023's single frontend: every IA-MNS change reaches all surfaces at once, IA-MNS code never runs in the Om origin, and identity and authorization stay in the API whatever the surface. Java 8 and Gradle are dictated by the Om runtime; [ADR-0001](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md) makes TypeScript primary, not exclusive, for such specialized components.

## Alternatives Considered

### BI component as the definitive Om host

Rejected by the owner. It would keep the signing logic in sources editable inside the Om and outside version control, and its publication depends on Om BI administration rather than a versioned package.

### Dedicated repository for the add-on

The Sankhya template recommends it, and it would keep Sankhya tooling defaults (repository root equal to the Gradle root) unchanged. Not chosen: it separates the two halves of the identity contract and their review.

### Screens or logic re-created inside the add-on

Rejected, as in ADR-0023: a second frontend or duplicated rules would diverge from `apps/web` and `apps/api` and run with the Om's privileges.

## Consequences

### Positive

- One reviewed change can evolve both sides of the Sankhya proof; the add-on stays small and replaceable.
- IA-MNS users reach the same Person and history from the Om without a second sign-in.

### Negative

- Contributors need a second toolchain (JDK 8, Gradle with the Add-on Studio plugin, Sankhya partner artifacts, a development WildFly and database) that `pnpm validate` and CI do not exercise.
- The template brings Sankhya-authored files whose redistribution terms in a public repository are not yet confirmed, an `appKey` that Sankhya's guide says must not be committed to public repositories, example artifacts that must not reach a real Om, and a Gradle wrapper whose JAR its own ignore rules exclude.
- Repository-wide settings, such as LF line endings and dependency automation, also reach the Gradle project and may need add-on-specific rules.

### Operational or Migration Impact

The PDT host page remains a PDT change outside this repository. Development and local deployment of the add-on use only the development Om and development users and keys. Production publication remains behind the Om hardening, the review and key custody tracked as human actions.

## References

- [ADR-0023](0023-serve-one-frontend-to-three-surfaces-with-host-identity-proofs.md), [ADR-0022](0022-own-the-ia-mns-identity-with-verified-external-links.md), [ADR-0001](0001-select-typescript-and-nodejs-as-primary-language-and-runtime.md)
- [Identity domain](../domains/identity.md), [application boundaries](../architecture/application-boundaries.md#sankhya-om-add-on)
- [Sankhya add-on guide](../../apps/sankhya-addon/README.md)
- [Project plan](../project/implementation-plan.md), [project human actions](../project/human-actions.md)
- [Sankhya Developer: add-ons](https://developer.sankhya.com.br/docs/add-on)
