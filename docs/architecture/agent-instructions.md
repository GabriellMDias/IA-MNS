# Agent Instructions and Tool Compatibility

[Documentation index](../README.md) · [Repository structure](repository-structure.md#local-agent-instructions) · [ADR-0013](../adr/0013-keep-agents-md-as-the-agent-neutral-instruction-source.md)

This page owns how repository instructions reach human contributors and AI coding agents. [ADR-0013](../adr/0013-keep-agents-md-as-the-agent-neutral-instruction-source.md) records the decision. Orion is not coupled to a particular model, agent harness, or vendor.

## Canonical instruction source

The root [AGENTS.md](../../AGENTS.md) and its nested `AGENTS.md` files are the only repository instruction source. They apply equally to every contributor, whether human or agent, and whatever tool is used. Nested files add local obligations for their directory and never remove global invariants; [repository structure](repository-structure.md#local-agent-instructions) owns their scope.

Instructions route to canonical policy rather than restating it. Machine-enforced architecture, schemas, tests, generated artifacts, and `pnpm validate` are more authoritative than any prompt: an instruction cannot make a failing check acceptable, and a behavior that matters should be enforced mechanically where practical.

Obligations belong to the responsibility, not to a product. Write "an agent", "a contributor", or "an authorized coding agent" in normative text. Name a specific tool only when describing that tool's actual behavior, as below.

## Tool-specific compatibility

Tool-specific files are thin discovery adapters. They may tell a tool to read `AGENTS.md`; they must not contain, summarize, or override repository instructions, and they are never an architectural authority. Add one only when a tool used with Orion cannot discover `AGENTS.md` otherwise, and verify the tool's current documented behavior first.

| Tool | Verified behavior (2026-09-29) | Repository adapter |
| --- | --- | --- |
| OpenAI Codex | Reads `AGENTS.md` natively. It combines one file per directory from the project root down to the current working directory and stops at a 32 KiB default combined limit (`project_doc_max_bytes`); nested files below the working directory are not loaded automatically. `AGENTS.override.md` replaces a directory's `AGENTS.md`. | None |
| Claude Code | Reads `AGENTS.md` natively since v2.1.277 (all session types since v2.1.281): the root and ancestor files at start, and a subdirectory's file when it reads files there. A `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` on the path replaces `AGENTS.md` by default. Verified with Claude Code 2.1.284, whose sessions in this repository load root and nested files without any `CLAUDE.md`. | None |
| Gemini CLI | Loads `GEMINI.md` by default. Setting `context.fileName` to `AGENTS.md` makes it load the root/ancestor `AGENTS.md` files and, just in time, those of subdirectories it accesses. Project settings apply only in a trusted workspace. Verified by executing Gemini CLI 0.61.0's own discovery functions against a disposable repository. | [`.gemini/settings.json`](../../.gemini/settings.json) sets only `context.fileName` |

Tool behavior changes over time. Reverify it against current official documentation or the installed tool before changing adapters; do not copy instructions to work around an unverified limitation.

## Portable instruction rules

- Keep each root-to-directory chain of `AGENTS.md` files under 32 KiB so Codex loads it completely. The root file stays concise and links to policy.
- Because some agents load only the files between the repository root and their working directory, the root file requires reading every applicable nested `AGENTS.md` before editing a directory. Nested files must not assume they were loaded automatically.
- Do not commit `CLAUDE.md`, `GEMINI.md`, `AGENTS.override.md`, `.claude/rules/`, `.github/copilot-instructions.md`, `.cursor/rules/`, or similar instruction copies. Personal, uncommitted variants also change what a tool reads: a local `CLAUDE.local.md` stops Claude Code from reading `AGENTS.md` unless its **Project instructions** setting is `claude-md-and-agents-md`, and a local `AGENTS.override.md` replaces Codex's view of that directory.
- A tool that reads `AGENTS.md` can still be misconfigured by user or organization settings outside the repository. Report such limits instead of adding repository copies.

## Enforcement

`pnpm agents:check`, part of `pnpm validate`, rejects competing instruction files, requires the Gemini adapter to set exactly `context.fileName: ["AGENTS.md"]`, and fails when a root-to-directory instruction chain exceeds 32 KiB. `pnpm agents:test` exercises those rules against disposable Git repositories. The check cannot prove that a tool follows the instructions; review and the repository's executable validation remain the controls.
