import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Value } from "typebox/value";
import { createOpenAiModel } from "../src/ai/openai.js";
import { createDatabase } from "../src/database.js";
import { captureCandidate } from "./capture.js";
import {
  candidateDirectory,
  curatedDirectory,
  evalRoot,
  loadCases,
  localDirectory,
  type Dataset,
  type EvalCase,
} from "./dataset.js";
import {
  compareReports,
  formatComparison,
  formatSummary,
  runEvaluation,
  type RunReport,
} from "./report.js";
import { modelSubject, scriptedSubject } from "./subjects.js";
import {
  candidateFromSimulation,
  simulate,
  simulationGoalsSchema,
  synthesizeCandidates,
} from "./synthetic.js";

const usage = `Usage: pnpm eval <command> [options]

  run        Evaluate cases. --subject scripted|model (default scripted),
             --model <id>, --dataset <file|dir> (repeatable), --tag <tag>,
             --case <id>, --include-candidates, --concurrency <n>, --out <file>,
             --retries <n> (model subject; transient provider errors only, default 1),
             --strict (exit 1 when a gating case fails)
  compare    Compare two run reports: compare <base.json> <head.json>
  validate   Check curated and local candidate datasets
  capture    Turn a traced conversation into a candidate: --turn <uuid>
  synthesize Generate candidate cases with a model: --count <n> --focus <text>
  simulate   Play simulated employees against the model subject: --count <n>,
             --goal <id> (repeatable), --export-failures

Model commands read OPENAI_API_KEY (and OPENAI_MODEL) from the environment.
Reports and candidates are written under ${relative(process.cwd(), localDirectory)}, which is never committed.`;

function revision(): string | null {
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim();
    return dirty ? `${commit}+dirty` : commit;
  } catch {
    return null;
  }
}

function model(id?: string, timeoutMs?: number) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY is required for model-backed commands");
  // Offline evaluation names its model explicitly; it never reads the
  // operational parameter of a running installation.
  return createOpenAiModel(
    { openaiApiKey: apiKey },
    id ?? process.env.OPENAI_MODEL ?? "gpt-6.1-sol",
    { timeoutMs },
  );
}

async function write(path: string, value: unknown): Promise<string> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return relative(process.cwd(), path);
}

const stamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

async function candidateFile(
  name: string,
  description: string,
  cases: EvalCase[],
): Promise<string> {
  const dataset: Dataset = { version: 1, description, cases };
  return write(join(candidateDirectory, `${name}.json`), dataset);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      subject: { type: "string", default: "scripted" },
      model: { type: "string" },
      dataset: { type: "string", multiple: true },
      tag: { type: "string", multiple: true },
      case: { type: "string", multiple: true },
      "include-candidates": { type: "boolean", default: false },
      concurrency: { type: "string", default: "4" },
      retries: { type: "string", default: "1" },
      out: { type: "string" },
      strict: { type: "boolean", default: false },
      turn: { type: "string" },
      count: { type: "string", default: "5" },
      focus: {
        type: "string",
        default: "multi-turn clarification and follow-ups",
      },
      "export-failures": { type: "boolean", default: false },
      goal: { type: "string", multiple: true },
    },
  });
  switch (command) {
    case "run": {
      const sources = values.dataset?.length
        ? values.dataset
        : [
            curatedDirectory,
            ...(values["include-candidates"] ? [candidateDirectory] : []),
          ];
      const { cases, files } = await loadCases(sources);
      const selected = cases.filter(
        (item) =>
          (values["include-candidates"] || item.status === "active") &&
          (!values.tag?.length ||
            values.tag.some((tag) => item.tags.includes(tag))) &&
          (!values.case?.length || values.case.includes(item.id)),
      );
      const subject =
        values.subject === "model"
          ? modelSubject(model(values.model))
          : values.subject === "scripted"
            ? scriptedSubject
            : null;
      if (!subject) throw new Error(`Unknown subject ${values.subject}`);
      let done = 0;
      const report = await runEvaluation(subject, selected, {
        datasets: files,
        revision: revision(),
        concurrency:
          subject === scriptedSubject ? 1 : Number(values.concurrency),
        retries: subject === scriptedSubject ? 0 : Number(values.retries),
        selection: {
          tags: values.tag ?? [],
          cases: values.case ?? [],
          includeCandidates: values["include-candidates"],
        },
        onCase: (result) =>
          process.stderr.write(
            `[${++done}/${selected.length}] ${result.outcome.padEnd(7)} ${result.id}\n`,
          ),
      });
      const path = await write(
        values.out
          ? resolve(values.out)
          : join(
              localDirectory,
              "runs",
              `${stamp()}-${subject.id.replace(/[^a-z0-9.-]/gi, "_")}.json`,
            ),
        report,
      );
      console.log(formatSummary(report));
      console.log(`Report: ${path}`);
      if (values.strict && report.summary.cases.failed > 0)
        process.exitCode = 1;
      return;
    }
    case "compare": {
      if (positionals.length !== 2) throw new Error(usage);
      const [base, head] = await Promise.all(
        positionals.map(
          async (path) => JSON.parse(await readFile(path, "utf8")) as RunReport,
        ),
      );
      console.log(formatComparison(compareReports(base, head)));
      return;
    }
    case "validate": {
      const curated = await loadCases([curatedDirectory]);
      const candidates = await loadCases([candidateDirectory]);
      const ids = new Set(curated.cases.map((item) => item.id));
      for (const item of candidates.cases)
        if (ids.has(item.id))
          throw new Error(`${item.id}: candidate duplicates a curated case`);
      console.log(
        `Datasets valid: ${curated.cases.length} curated cases in ${curated.files.length} files, ${candidates.cases.length} local candidates.`,
      );
      return;
    }
    case "capture": {
      if (!values.turn) throw new Error("--turn <uuid> is required");
      const url = process.env.ORION_DATABASE_URL;
      if (!url) throw new Error("ORION_DATABASE_URL is required for capture");
      const database = createDatabase(url);
      try {
        const candidate = await captureCandidate(database, values.turn);
        const path = await candidateFile(
          `trace-${values.turn}`,
          "Candidate captured from a traced conversation. CONFIDENTIAL: rewrite with synthetic wording before promotion.",
          [candidate],
        );
        console.log(
          `Candidate written to ${path}. It contains confidential conversation content: never commit it; rewrite it synthetically before promoting into ${relative(process.cwd(), curatedDirectory)}.`,
        );
      } finally {
        await database.$disconnect();
      }
      return;
    }
    case "synthesize": {
      const { cases } = await loadCases([curatedDirectory]);
      const generated = await synthesizeCandidates(
        model(values.model, 120000),
        {
          count: Math.min(10, Number(values.count)),
          focus: values.focus,
          today: new Date().toISOString().slice(0, 10),
          examples: cases,
        },
      );
      const path = await candidateFile(
        `synthetic-${stamp()}`,
        `Synthetic candidates (${values.focus}); unreviewed model proposals.`,
        generated,
      );
      console.log(
        `${generated.length} candidates written to ${path}. Run them with: pnpm eval run --subject model --dataset ${path}`,
      );
      return;
    }
    case "simulate": {
      const goals = JSON.parse(
        await readFile(
          join(evalRoot, "datasets", "simulation-goals.json"),
          "utf8",
        ),
      ) as unknown;
      if (!Value.Check(simulationGoalsSchema, goals))
        throw new Error("Invalid simulation goals");
      const provider = model(values.model);
      const subject = modelSubject(provider);
      const results = [];
      const chosen = goals.goals.filter(
        (goal) => !values.goal?.length || values.goal.includes(goal.id),
      );
      for (const goal of chosen.slice(0, Number(values.count))) {
        const result = await simulate(provider, subject, goal);
        console.log(
          `${result.passed ? "pass" : result.inconclusive ? "inconclusive" : "FAIL"} ${goal.id} (${result.turns} turns)${result.reason ? `: ${result.reason}` : ""}`,
        );
        for (const item of result.transcript)
          console.log(
            `  user: ${item.user}\n  assistant: ${item.reply ?? "(error)"}`,
          );
        results.push(result);
      }
      const passed = results.filter((item) => item.passed).length;
      console.log(
        `Simulations: ${passed}/${results.length - results.filter((item) => item.inconclusive).length} conclusive runs reached their goal; ${results.filter((item) => item.inconclusive).length} inconclusive (provider unavailable).`,
      );
      await write(join(localDirectory, "runs", `${stamp()}-simulation.json`), {
        version: 1,
        subject: { id: subject.id, metadata: subject.metadata },
        revision: revision(),
        results,
      });
      const failures = results.filter(
        (item) => !item.passed && !item.inconclusive,
      );
      if (values["export-failures"] && failures.length)
        console.log(
          `Failed simulations written to ${await candidateFile(
            `simulation-${stamp()}`,
            "Failed goal simulations; unreviewed candidates.",
            failures.map(candidateFromSimulation),
          )}`,
        );
      return;
    }
    default:
      console.log(usage);
      if (command && command !== "help") process.exitCode = 1;
  }
}

await main();
