import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// AGENTS.md files are the only repository instruction source (ADR-0013).
// Tool-specific files that would carry or shadow instructions are rejected;
// a tool that cannot discover AGENTS.md gets a thin discovery adapter only.
const competingInstructionFiles: readonly [RegExp, string][] = [
  [/(^|\/)CLAUDE(\.local)?\.md$/, "Claude Code reads AGENTS.md natively"],
  [/(^|\/)\.claude\/CLAUDE\.md$/, "Claude Code reads AGENTS.md natively"],
  [/(^|\/)\.claude\/rules\//, "Claude Code rules would duplicate AGENTS.md"],
  [/(^|\/)GEMINI\.md$/, "Gemini CLI discovers AGENTS.md via .gemini"],
  [/(^|\/)AGENTS\.override\.md$/, "overrides replace canonical AGENTS.md"],
  [/^\.github\/copilot-instructions\.md$/, "duplicates AGENTS.md"],
  [/^\.github\/instructions\//, "duplicates AGENTS.md"],
  [/(^|\/)\.cursorrules$/, "duplicates AGENTS.md"],
  [/(^|\/)\.cursor\/rules\//, "duplicates AGENTS.md"],
  [/(^|\/)\.windsurfrules$/, "duplicates AGENTS.md"],
  [/(^|\/)\.clinerules(\/|$)/, "duplicates AGENTS.md"],
];
const geminiSettings = ".gemini/settings.json";
const expectedGeminiSettings = { context: { fileName: ["AGENTS.md"] } };
// Codex's default project_doc_max_bytes; it stops adding files beyond it.
export const instructionChainLimitBytes = 32 * 1024;

function trackedFiles(root: string): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
}

export function checkAgentInstructions(root: string): {
  errors: string[];
  instructionFiles: string[];
  largestChainBytes: number;
} {
  const files = trackedFiles(root);
  const errors: string[] = [];
  for (const name of files) {
    for (const [pattern, reason] of competingInstructionFiles)
      if (pattern.test(name))
        errors.push(
          `${name}: competing agent instruction file (${reason}); keep instructions in AGENTS.md`,
        );
  }

  if (!files.includes(geminiSettings)) {
    errors.push(`${geminiSettings}: missing Gemini CLI AGENTS.md adapter`);
  } else {
    let settings: unknown;
    try {
      settings = JSON.parse(
        readFileSync(resolve(root, geminiSettings), "utf8"),
      );
    } catch {
      errors.push(`${geminiSettings}: invalid JSON`);
    }
    if (
      settings !== undefined &&
      JSON.stringify(settings) !== JSON.stringify(expectedGeminiSettings)
    )
      errors.push(
        `${geminiSettings}: must only set context.fileName to ["AGENTS.md"]; adapters configure discovery, not instructions`,
      );
  }

  const instructionFiles = files
    .filter((name) => posix.basename(name) === "AGENTS.md")
    .sort();
  if (!instructionFiles.includes("AGENTS.md"))
    errors.push("AGENTS.md: missing root agent instructions");
  const sizes = new Map(
    instructionFiles.map((name) => [
      name,
      Buffer.byteLength(readFileSync(resolve(root, name))),
    ]),
  );
  let largestChainBytes = 0;
  for (const name of instructionFiles) {
    // An agent working in this directory receives every AGENTS.md from the
    // repository root down to it.
    let chain = 0;
    for (const candidate of instructionFiles) {
      const directory = posix.dirname(candidate);
      if (directory === "." || name.startsWith(`${directory}/`))
        chain += sizes.get(candidate) ?? 0;
    }
    largestChainBytes = Math.max(largestChainBytes, chain);
    if (chain > instructionChainLimitBytes)
      errors.push(
        `${name}: instructions from the root to this file total ${chain} bytes, above the ${instructionChainLimitBytes}-byte portable limit`,
      );
  }
  return { errors, instructionFiles, largestChainBytes };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = checkAgentInstructions(process.cwd());
  if (result.errors.length > 0) {
    for (const error of result.errors)
      console.error(`Agent instruction validation: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Agent instruction validation passed: ${result.instructionFiles.length} AGENTS.md files, largest root-to-leaf chain ${result.largestChainBytes} bytes.`,
    );
  }
}
