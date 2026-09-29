# ADR-0013: Keep AGENTS.md as the Agent-Neutral Instruction Source

**Status:** accepted

**Date:** 2026-09-29

## Context

Orion is built and maintained by humans together with AI coding agents. Its foundation was developed with OpenAI Codex, and its instructions and tracking documents named Codex as the actor responsible for maintaining the plan and human actions. Orion must remain usable with other agents, including Claude Code and Gemini CLI, without becoming coupled to one model, vendor, or harness.

Each tool has its own discovery convention. Duplicating repository rules into `CLAUDE.md`, `GEMINI.md`, or similar files would create competing authorities that drift apart, contradicting the single-canonical-source principle in [contributing](../contributing.md#authored-meaning-and-generated-facts). The owner directed that `AGENTS.md` remain canonical, that tool-specific files be added only as thin compatibility layers, and that tool behavior be verified against current documentation rather than assumed.

Verification on 2026-09-29 established that Codex reads `AGENTS.md` natively from the project root down to its working directory, with a 32 KiB default combined limit; that Claude Code 2.1.277 and later reads `AGENTS.md` natively, including nested files on demand, unless a `CLAUDE.md` is present; and that Gemini CLI 0.61.0 reads `GEMINI.md` by default but loads the `AGENTS.md` hierarchy when `context.fileName` names it. [Agent instructions](../architecture/agent-instructions.md) records the detailed, reverifiable behavior.

## Decision

The root `AGENTS.md` and its nested `AGENTS.md` files are Orion's only repository instruction source for every contributor and agent. Normative repository text assigns obligations to the responsibility, such as a contributor or an authorized coding agent, and names a specific tool only to describe that tool's behavior.

A tool that cannot discover `AGENTS.md` receives a minimal committed discovery adapter that points it at `AGENTS.md` and contains no instructions. Currently only Gemini CLI needs one: `.gemini/settings.json` sets `context.fileName` to `["AGENTS.md"]`. Orion commits no `CLAUDE.md`, `GEMINI.md`, or other instruction copy.

Portability constraints are enforced mechanically where practical: validation rejects competing instruction files, restricts the Gemini adapter to discovery, and keeps each root-to-directory instruction chain within the 32 KiB limit that all verified tools load completely. The root instructions require reading applicable nested files before editing because not every tool loads them automatically.

## Rationale

`AGENTS.md` is supported natively or through configuration by all three verified tools, so one hierarchy can serve them without copies. Native discovery is preferred to import-based shims: a `CLAUDE.md` containing `@AGENTS.md` would work, but it is unnecessary on current Claude Code and would suppress direct `AGENTS.md` discovery by default. Gemini offers no native `AGENTS.md` default, and its supported project setting is the smallest configuration that loads the canonical hierarchy.

Mechanical checks make the policy durable as tools and contributors change. Executable validation, not prompting, remains the authority for architecture and behavior.

## Alternatives Considered

### Vendor-specific instruction files

Maintaining `CLAUDE.md` and `GEMINI.md` beside `AGENTS.md` would give each tool its preferred file, but the copies would drift and create ambiguity about which rule is authoritative.

### Import or symlink shims for every tool

`@AGENTS.md` imports or symlinked files keep one source, but they add files that current tools do not need. Symlinks are unreliable in Windows checkouts, and a committed `CLAUDE.md` changes Claude Code's default discovery. They remain options only for a tool that requires them.

### A tool-neutral instruction format generated into vendor files

Generating vendor files from another source would add tooling and generated artifacts without a benefit over the widely supported `AGENTS.md` convention.

## Consequences

### Positive

- One instruction hierarchy serves humans and all verified agents.
- Agent-specific wording no longer implies that only one tool may maintain the plan or human actions.
- Validation detects accidental instruction copies and oversized instruction chains.

### Negative

- Tool behavior changes over time, so the compatibility table must be reverified before changing adapters or relying on a tool.
- Gemini CLI applies the project setting only in a trusted workspace, and user or organization settings outside the repository can still change what any tool loads.
- Instructions must stay concise enough for the smallest verified combined limit.

### Operational or Migration Impact

- Contributors using an older Claude Code version or a local `CLAUDE.local.md` must update or configure their client to read `AGENTS.md`; the repository does not add a workaround file.

## References

- [Agent instructions and tool compatibility](../architecture/agent-instructions.md)
- [Repository structure: local agent instructions](../architecture/repository-structure.md#local-agent-instructions)
- [ADR-0003: repository validation and architecture enforcement](0003-establish-repository-validation-and-architecture-enforcement.md)
