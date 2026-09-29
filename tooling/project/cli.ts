import {
  checkProvenance,
  configureUpstream,
  formatStatus,
  initializeProject,
  projectStatus,
  recordBaseline,
} from "./derivation.ts";
import { upstreamRemote } from "./manifest.ts";

const usage = `Usage:
  pnpm orion:init-project --name <project name> --repository <git url> [--apply]
  pnpm orion:status
  pnpm orion:upstream
  pnpm orion:record-baseline <foundation commit>
  pnpm orion:check`;

function parse(args: string[]) {
  const options = new Map<string, string | true>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [key, inline] = argument.slice(2).split(/=(.*)/s, 2);
    if (key === "apply") options.set(key, true);
    else if (inline !== undefined) options.set(key, inline);
    else if (index + 1 < args.length) options.set(key, args[(index += 1)]);
    else throw new Error(`Missing value for --${key}\n\n${usage}`);
  }
  return { options, positional };
}

function text(options: Map<string, string | true>, key: string): string {
  const value = options.get(key);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`--${key} is required\n\n${usage}`);
  return value;
}

function run(command: string | undefined, args: string[]): number {
  const root = process.cwd();
  const { options, positional } = parse(args);
  switch (command) {
    case "init-project": {
      const allowed = new Set(["name", "repository", "apply"]);
      for (const key of options.keys())
        if (!allowed.has(key)) throw new Error(`Unknown option --${key}`);
      const result = initializeProject(root, {
        name: text(options, "name"),
        repository: text(options, "repository"),
        apply: options.get("apply") === true,
      });
      console.log(
        result.applied
          ? "Initialized. Performed:"
          : "Preconditions passed. Initialization would:",
      );
      for (const action of result.actions) console.log(`  - ${action}`);
      console.log(
        result.applied
          ? `\nNext: pnpm validate, then create the empty repository and git push -u origin ${result.manifest.repository.defaultBranch} (docs/project/human-actions.md PH-01). ${upstreamRemote} stays fetch-only.`
          : "\nNothing changed. Re-run with --apply to initialize this checkout.",
      );
      return 0;
    }
    case "status":
      for (const line of formatStatus(projectStatus(root))) console.log(line);
      return 0;
    case "upstream":
      for (const line of configureUpstream(root)) console.log(line);
      console.log(`Next: git fetch ${upstreamRemote} && pnpm orion:status`);
      return 0;
    case "record-baseline": {
      if (positional.length !== 1 || options.size > 0) throw new Error(usage);
      const { previous, next } = recordBaseline(root, positional[0]);
      console.log(
        `Recorded foundation baseline ${next} (was ${previous}) in .orion/project.json. Run pnpm validate and commit it with the upgrade.`,
      );
      return 0;
    }
    case "check": {
      const { errors, summary } = checkProvenance(root);
      for (const error of errors) console.error(`Project provenance: ${error}`);
      if (errors.length === 0) console.log(summary);
      return errors.length === 0 ? 0 : 1;
    }
    default:
      console.error(usage);
      return 1;
  }
}

try {
  process.exitCode = run(process.argv[2], process.argv.slice(3));
} catch (error) {
  console.error(`Orion project: ${(error as Error).message}`);
  process.exitCode = 1;
}
