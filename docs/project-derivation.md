# Project Derivation and Orion Upgrades

[Repository README](../README.md) · [Development setup](setup.md) · [Validation](validation.md) · [ADR-0014](adr/0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md)

This guide owns how a real project is started from Orion, how its provenance is recorded and checked, and how it adopts newer Orion revisions. [ADR-0014](adr/0014-derive-projects-from-orion-through-git-ancestry-with-recorded-provenance.md) records the decision and its rationale. The commands exist in every Orion checkout; the canonical Orion repository itself is never initialized as a project.

## Model

The canonical `GabriellMDias/Orion` repository is the upstream development foundation. A derived project is an independent Git repository with its own `origin`, branches, pull requests, CI history, human actions, product decisions, and releases. It starts from a clean clone of Orion and keeps Orion's commit history, so Git can compute what changed upstream and merge it later.

| Concern | Mechanism |
| --- | --- |
| Identity and provenance | [`.orion/project.json`](../.orion/project.json), validated by `pnpm orion:check` |
| Immutable starting point | `foundation.initializedFromCommit`: the published Orion commit the project was initialized from; never changes |
| Current foundation | `foundation.baselineCommit`: the newest Orion commit integrated and validated through a reviewed merge |
| Canonical upstream | Local remote `orion-upstream`: fetch-only (its push URL is disabled), fetches no tags, and is tracked by no local branch |
| Product repository | Recorded as `repository.url`; each clone's `origin` is that repository or a fork or mirror of it, never the foundation ([remote rules](#remote-rules)) |

In the Orion repository the manifest has `"kind": "foundation"` and only describes Orion. A derived project's manifest has `"kind": "project"` and additionally records its foundation ancestry and the [Approval Request disposition](#approval-request-reference-implementation). The Living Documentation Portal links source files to the manifest's repository.

The `@orion/*` package scope, `ORION_*` configuration names, `orion_*` token claims, and the `Orion required gate` check name are the foundation namespace, not a product brand. Initialization renames none of them: a global rename would touch most files and make every later upgrade conflict. A project may rename user-visible branding deliberately and accept that upgrade cost.

## Foundation-owned and project-owned files

Separating ownership keeps upgrades mergeable. A file changed on only one side merges cleanly; conflicts concentrate where both sides legitimately own meaning.

| Files | Owner in a derived project | Upgrade behavior |
| --- | --- | --- |
| `docs/project/implementation-plan.md`, `docs/project/human-actions.md` | Project; created by initialization and never present in Orion | No upstream changes |
| `.orion/project.json` | Project | Orion changes it only for a schema change, which requires review |
| `README.md` introduction and **Current state** | Project; replaced by initialization | Conflicts only if Orion edits the same lines; keep the project's version and port relevant facts |
| [Orion plan](implementation-plan.md), [Orion human actions](human-actions.md), [foundation acceptance](foundation-acceptance.md) | Orion; inherited foundation history | Accept upstream changes; never use them to track the project |
| Architecture, policies, ADRs, tooling, CI, applications, and the reference implementation | Shared foundation that the project extends | Normal three-way merges; product changes to the same lines need review |
| Generated references and portal data | Derived from canonical sources | Resolve source conflicts, then regenerate; never hand-merge generated output |

In a derived project, `AGENTS.md` routes implementation work to the project-owned plan and human actions. Orion's completed tasks and human actions, such as H-01 to H-03 for Renovate, branch protection, and GitHub security settings, were verified for the Orion repository only. Initialization creates pending project actions for the new repository's equivalents.

## Start a new project

Prerequisites: Git, Node.js 24.13.0, pnpm 11.25.0, and a configured Git `user.name`/`user.email`. Choose the project's repository URL; it need not exist yet. Use a fresh, full clone that contains no other work:

```sh
git clone https://github.com/GabriellMDias/Orion.git acme-ledger
cd acme-ledger
pnpm install --frozen-lockfile
pnpm orion:init-project --name "Acme Ledger" --repository git@github.com:acme/acme-ledger.git
pnpm orion:init-project --name "Acme Ledger" --repository git@github.com:acme/acme-ledger.git --apply
pnpm validate
git push -u origin main
```

The first `orion:init-project` run is a dry run: it checks every precondition and lists the actions without changing anything. To start from an older published Orion commit, run `git reset --hard <commit>` on `main` before initializing; the commit must be on Orion's `main`. Push only after creating an empty project repository without a generated README, license, or ignore file (project human action PH-01).

Initialization refuses, without changing anything, when:

- the checkout is not the repository root, is shallow, or has uncommitted or untracked changes (ignored files such as `node_modules/` and `.env.local` are allowed);
- the manifest already describes a project, `docs/project/` exists, or an `orion-upstream` remote exists;
- `main` is not checked out, `origin` is not the canonical Orion repository, or `HEAD` has commits that are not on `origin/main`;
- the project name is invalid, the repository URL embeds credentials, uses a non-default SSH port (see [repository identities](#remote-rules)), or identifies the Orion repository;
- the migration release registry records durable releases, which would describe another deployment;
- Git has no committer identity.

With `--apply`, it writes the project manifest, replaces the README introduction and current-state section, creates the project plan and human actions, and regenerates portal data. It then commits `Initialize <name> from Orion <commit>` on top of Orion's history, renames `origin` to the protected `orion-upstream`, and adds the project repository as `origin`. It never creates remote repositories or pushes. If a step before the commit fails, it restores the clean checkout.

## Approval Request reference implementation

Orion's Approval Request slice is its executable reference implementation: it demonstrates the architecture from the database to the browser and is exercised by the validation gate. It is never a product requirement of a derived project. Initialization records `referenceImplementations.approvalRequest` as `reference` and creates plan task PJ-04 and owner decision PH-06.

| Disposition | Meaning | Checked by `pnpm orion:check` |
| --- | --- | --- |
| `reference` | Retained unchanged as an example; not product behavior | Its source exists, and no durable release is recorded |
| `adopted` | The owner decided it is product behavior; its business rules become product requirements | Its source exists |
| `removed` | Removed coherently | Its source is absent |

Keeping the reference is the default because removal must coherently change the API feature and tests, migration history, schema metadata, OpenAPI, SDK, web workflow, browser journeys, generated references, domain documentation, and portal data together. A project that removes it should do so in one reviewed change: delete the feature, regenerate every derived artifact, run `pnpm validate`, and record `removed`. A migration may be deleted only while it is unreleased under [migration policy](database/migrations.md). Upgrades then conflict wherever Orion changes those removed files; keep the deletion when resolving them.

The first durable release is the latest safe decision point. Once `apps/api/prisma/release-history.json` records a release, `pnpm orion:check` fails while the disposition is still `reference`.

## Inspect provenance

```sh
pnpm orion:status
```

It prints the project identity, the initialization and recorded baseline commits, whether `orion-upstream` is configured and fetch-only, and, after `git fetch orion-upstream`, how many upstream commits follow the baseline and whether integrated commits are not yet recorded. It does not fetch or change anything.

`pnpm orion:check` runs in `pnpm validate`. For a project, it validates the manifest, requires the project plan and human actions, requires both recorded commits to exist with the initialization commit an ancestor of the baseline and the baseline an ancestor of `HEAD`, and checks the Approval Request disposition. It needs full history; CI already uses `fetch-depth: 0`. It also applies the [remote rules](#remote-rules) to whichever of these remotes the clone has.

### Remote rules

Git remotes are local configuration, so other clones of the project do not receive `orion-upstream`. Configure it in any clone with:

```sh
pnpm orion:upstream
git fetch orion-upstream
```

| Remote | Rule | Enforced by |
| --- | --- | --- |
| `origin` | Must not identify the Orion foundation through its fetch or push URL, so product work never has the foundation as its normal push target. It need not equal the project's `repository.url`: contributors may work through a fork or mirror. | `pnpm orion:upstream` refuses; `pnpm orion:check` fails |
| `orion-upstream`, when present | Its fetch URL must identify the foundation repository recorded in the manifest. | `pnpm orion:upstream` refuses; `pnpm orion:check` fails |
| `orion-upstream`, when present | Its only push URL must be the disabled `orion-upstream-is-fetch-only`. | `pnpm orion:check` fails and directs you to rerun `pnpm orion:upstream` |
| `orion-upstream`, when absent | Valid; a normal clone has no foundation remote until a developer configures it. | — |
| Local branches | No local branch may track `orion-upstream`; an argument-free `git pull` would otherwise merge foundation changes outside a reviewed upgrade. | `pnpm orion:check` fails and directs you to rerun `pnpm orion:upstream` |

`pnpm orion:upstream` adds `orion-upstream` from the manifest when absent, replaces every push URL of it with the disabled one, disables its tags, and removes upstream tracking of it from every local branch. It is safe to rerun.

Repository identities compare as normalized HTTPS URLs, so HTTPS, SSH, and scp-like forms of the same repository match. An explicit non-default HTTPS port is part of the identity: `https://git.example.com:8443/acme/ledger` differs from `https://git.example.com/acme/ledger`, while `:443` is the same endpoint as no port. A non-default SSH port only selects the SSH transport and does not identify the HTTPS endpoint, so such a URL is refused as a project repository and never matches the foundation; supply the repository's HTTPS URL instead.

## Upgrade to a newer Orion revision

An upgrade is a normal reviewable engineering change on a branch. Nothing is applied automatically, and semantic conflicts are resolved by people or agents under review.

1. Run `git fetch orion-upstream` and `pnpm orion:status`. Review upstream changes with `git log --oneline <baseline>..orion-upstream/main` and `git diff <baseline> orion-upstream/main`, including ADRs, policies, migrations, and tooling.
2. Choose the candidate commit; it must be on `orion-upstream/main`. Create a branch, for example `git switch -c orion-upgrade/<short-commit>`, and run `git merge --no-ff <commit>`.
3. Resolve conflicts according to the [ownership table](#foundation-owned-and-project-owned-files). Resolve generated references and portal data by rerunning their generators after the canonical sources are merged. Review semantic interactions with product code even where Git reports no conflict.
4. Run `pnpm install --frozen-lockfile` if the lockfile changed, the relevant generators, and `pnpm validate`. Commit the merge.
5. Run `pnpm orion:record-baseline <commit>`. It refuses unless the worktree is clean, the commit is on `orion-upstream/main`, descends from the recorded baseline, and is already an ancestor of `HEAD`. Commit the manifest change, rerun `pnpm validate`, and open the pull request against the project's `main`.
6. Merge the pull request with a merge commit. Squash or rebase merges discard Orion's commit identities, and `pnpm orion:check` then fails because the recorded baseline is not an ancestor of `HEAD`. The project repository must therefore keep merge commits enabled (project human action PH-02). This applies only to Orion upgrade pull requests; other pull requests may use whichever merge methods the project prefers.

If the project's default branch requires pull requests, as PH-02 establishes, the merge and baseline update reach `main` together through that pull request. Record the upgrade and any project-specific follow-up in the project plan.

## Contributing improvements back to Orion

Product work never goes to `orion-upstream`; its push URL is disabled. To improve the foundation itself, make the change in a separate clone of Orion and submit it there under Orion's own review, then adopt it in projects through the upgrade workflow. Do not move product code, requirements, or history into Orion.

## Limits

- Provenance proves which Orion commits are ancestors of the project; it does not prove that the project still follows every inherited policy. Validation and review remain the enforcement.
- `pnpm orion:check` can verify that the recorded baseline is integrated, but only `pnpm orion:status` with a fetched upstream can report newer integrated commits that were not yet recorded.
- Projects that diverge heavily from foundation files, rename the foundation namespace, or remove the reference implementation should expect more upgrade conflicts in those areas.
- No release or versioning scheme exists for Orion; the immutable Git commit is the version.
