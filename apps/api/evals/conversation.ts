import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type {
  ConversationModel,
  ConversationResult,
} from "../src/ai/conversation.js";
import { ModelFailure } from "../src/ai/model.js";
import { createOpenAiConversationModel } from "../src/ai/openai-conversation.js";
import { noTrace } from "../src/ai/trace.js";
import type {
  AgentCapability,
  AgentExchange,
  AgentReply,
} from "../src/features/agent/capabilities.js";
import {
  conversationVersion,
  runConversationTurn,
} from "../src/features/agent/conversation.js";
import { AgentFailure } from "../src/features/agent/errors.js";
import { prepareAttachment } from "../src/features/agent/attachments.js";
import { createSalesAnalyticsCapability } from "../src/features/products/analytics.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import {
  assembleResult,
  type SalesQuery,
} from "../src/features/sales/domain.js";

const object = { additionalProperties: false };
const stepSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("message"),
      message: Type.String(),
      evidenceIds: Type.Array(Type.String()),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("tool"),
      name: Type.String(),
      arguments: Type.Record(Type.String(), Type.Unknown()),
    },
    object,
  ),
]);
const expectationSchema = Type.Object(
  {
    kind: Type.Optional(
      Type.Union([
        Type.Literal("conversation"),
        Type.Literal("answer"),
        Type.Literal("clarification"),
        Type.Literal("unavailable"),
      ]),
    ),
    reads: Type.Integer({ minimum: 0, maximum: 6 }),
    maxModelCalls: Type.Integer({ minimum: 1, maximum: 8 }),
    contains: Type.Optional(Type.Array(Type.String())),
    absent: Type.Optional(Type.Array(Type.String())),
    withheld: Type.Optional(Type.Array(Type.String())),
    displayResult: Type.Optional(Type.Boolean()),
    error: Type.Optional(Type.String()),
    metrics: Type.Optional(Type.Array(Type.String())),
    groupBy: Type.Optional(Type.String()),
  },
  object,
);
export const conversationDatasetSchema = Type.Object(
  {
    version: Type.Literal(1),
    description: Type.String(),
    cases: Type.Array(
      Type.Object(
        {
          id: Type.String({ pattern: "^conversation/[a-z0-9-]+$" }),
          live: Type.Boolean(),
          seed: Type.Union([
            Type.Literal("none"),
            Type.Literal("sales"),
            Type.Literal("other_source"),
          ]),
          permission: Type.Boolean(),
          analytics: Type.Optional(Type.Boolean()),
          attachment: Type.Optional(
            Type.Union([Type.Literal("text"), Type.Literal("image")]),
          ),
          turns: Type.Array(
            Type.Object(
              {
                message: Type.String({ minLength: 1, maxLength: 2000 }),
                steps: Type.Array(stepSchema, { minItems: 1, maxItems: 8 }),
                expect: expectationSchema,
              },
              object,
            ),
            { minItems: 1, maxItems: 6 },
          ),
        },
        object,
      ),
      { minItems: 1, maxItems: 100 },
    ),
  },
  object,
);
export type ConversationDataset = Static<typeof conversationDatasetSchema>;
type Case = ConversationDataset["cases"][number];
type Turn = Case["turns"][number];

/** A separate corpus from interpretation/routing datasets, with its own contract. */
export async function loadConversationDataset(): Promise<ConversationDataset> {
  const value: unknown = JSON.parse(
    await readFile(
      new URL("./datasets/conversation-autonomy.json", import.meta.url),
      "utf8",
    ),
  );
  if (
    !Value.Check(conversationDatasetSchema, value) ||
    new Set(value.cases.map((item) => item.id)).size !== value.cases.length
  )
    throw new Error("Invalid synthetic conversational evaluation dataset");
  return value;
}

const invocation = {
  provider: "scripted",
  model: "curated-conversation",
  latencyMs: 0,
  inputTokens: null,
  outputTokens: null,
};
function scriptedModel(turn: Turn): ConversationModel {
  let step = 0;
  return {
    provider: invocation.provider,
    model: invocation.model,
    invoke: () => {
      const response = turn.steps[step++];
      if (!response) return Promise.reject(new ModelFailure("invalid_output"));
      if (response.kind === "message") {
        const value = {
          message: response.message,
          evidenceIds: response.evidenceIds,
        };
        return Promise.resolve({
          kind: "message",
          text: JSON.stringify(value),
          value,
          invocation,
        });
      }
      return Promise.resolve({
        kind: "tool_calls",
        calls: [
          {
            id: `call_${step}`,
            name: response.name,
            arguments: response.arguments,
          },
        ],
        continuation: {},
        invocation,
      });
    },
  };
}

/** Fixed synthetic rows run through the real decimal aggregation and result contract. */
function salesReply(source: "sankhya" | "vrmaster" = "sankhya"): AgentReply {
  const query: SalesQuery = {
    productSearch: "maçã",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    metric: "net_value",
    groupBy: "total",
    comparison: "none",
  };
  const result = assembleResult(
    query,
    {
      rows: [
        {
          period: "total",
          product: null,
          unit: "BRL",
          value: source === "sankhya" ? "9876.54" : "7654.32",
        },
      ],
      products: [{ code: "1", description: "MAÇÃ SINTÉTICA" }],
      missingWeight: false,
    },
    null,
    source,
  );
  return {
    kind: "answer",
    capabilityId: "sales",
    message: "Consulta sintética concluída.",
    result: {
      selection: source,
      sections: [{ source, status: "answered", reason: null, result }],
    },
    suggestions: [],
    requiredPermissions: ["sales:read"],
  };
}

export type ConversationEvalTurn = {
  turn: number;
  passed: boolean;
  reads: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
  checks: { name: string; passed: boolean }[];
};
export type ConversationEvalReport = {
  version: 1;
  subject: "scripted" | "model";
  conversationVersion: string;
  cases: {
    id: string;
    passed: boolean;
    skipped: boolean;
    turns: ConversationEvalTurn[];
  }[];
  passed: number;
  failed: number;
  skipped: number;
};

function failure(error: unknown): string {
  if (error instanceof AgentFailure) return error.code;
  if (error instanceof ModelFailure)
    return `MODEL_${error.reason.toUpperCase()}`;
  return "EVALUATION_FAILURE";
}

/**
 * Evaluates the real conversational loop, authorization and evidence rendering.
 * ERP execution is intentionally synthetic; this is no source-reconciliation
 * proof or general semantic-entailment benchmark. Reports never include text,
 * provider payloads, rows, credentials or confidential error messages.
 */
export async function runConversationEvaluation(
  options: {
    model?: ConversationModel;
    caseIds?: readonly string[];
    dataset?: ConversationDataset;
  } = {},
): Promise<ConversationEvalReport> {
  const dataset = options.dataset ?? (await loadConversationDataset());
  const report: ConversationEvalReport = {
    version: 1,
    subject: options.model ? "model" : "scripted",
    conversationVersion,
    cases: [],
    passed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const item of dataset.cases) {
    if (options.caseIds?.length && !options.caseIds.includes(item.id)) continue;
    const observed: ConversationEvalReport["cases"][number] = {
      id: item.id,
      passed: true,
      skipped: Boolean(options.model && !item.live),
      turns: [],
    };
    report.cases.push(observed);
    if (observed.skipped) {
      report.skipped++;
      continue;
    }
    const history: AgentExchange[] =
      item.seed === "none"
        ? []
        : [
            {
              id: "seed",
              sequence: 1,
              source: item.seed === "other_source" ? "vrmaster" : "sankhya",
              question: "Quanto vendi de maçã de julho a setembro?",
              reply: salesReply(
                item.seed === "other_source" ? "vrmaster" : "sankhya",
              ),
            },
          ];
    let contexts: Record<string, unknown> = item.attachment
      ? {
          _attachments: [
            prepareAttachment({
              id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
              name: item.attachment === "text" ? "note.txt" : "pixel.png",
              mediaType:
                item.attachment === "text" ? "text/plain" : "image/png",
              purpose: "Summarize synthetic operational material",
              source: "sankhya",
              contentBase64:
                item.attachment === "text"
                  ? Buffer.from(
                      "Nota operacional sintética: foram recebidas 42 caixas de maçã para conferência. O recebimento não confirma venda nem faturamento.",
                    ).toString("base64")
                  : "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3NMQ0AAAwDoPo33arYsQQMkB6LQCAQCAQCgUAg+BIMi1X0pjxKe0gAAAAASUVORK5CYII=",
              classification: "business_operational",
              containsRestrictedData: false,
            }),
          ],
        }
      : {};
    for (const [index, turn] of item.turns.entries()) {
      let reads = 0;
      let modelCalls = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let withheld = true;
      let error: string | null = null;
      let reply: AgentReply | null = null;
      const queries: SalesQuery[] = [];
      const syntheticRead = (query: SalesQuery) => ({
        current: {
          rows: [
            {
              period:
                query.groupBy === "total" || query.groupBy === "product"
                  ? "total"
                  : query.startDate.slice(0, 7),
              product:
                query.groupBy === "product" || query.groupBy === "month_product"
                  ? "SYNTHETIC APPLE"
                  : null,
              unit: query.metric === "net_value" ? "BRL" : "UN",
              value: query.metric === "net_value" ? "9876.54" : "42",
            },
          ],
          products: [],
          missingWeight: false,
        },
        previous: null,
      });
      const syntheticReader: SalesReader = {
        read: (query) => {
          reads++;
          queries.push(query);
          return Promise.resolve(syntheticRead(query));
        },
        readMany: (plans) => {
          reads++;
          queries.push(...plans);
          return Promise.resolve(plans.map(syntheticRead));
        },
        close: () => Promise.resolve(),
      };
      const capability: AgentCapability = {
        id: "sales",
        title: "Vendas",
        description:
          "Consult reviewed net sales, quantities and weights for a selected period and ERP. This evaluation supplies synthetic data.",
        examples: [],
        permission: "sales:read",
        execute: () => {
          reads++;
          return Promise.resolve({
            reply: salesReply(),
            context: { synthetic: true },
          });
        },
        close: () => Promise.resolve(),
      };
      const selectedModel = options.model ?? scriptedModel(turn);
      const measured: ConversationModel = {
        provider: selectedModel.provider,
        model: selectedModel.model,
        invoke: async (request, signal): Promise<ConversationResult> => {
          modelCalls++;
          const transmitted = JSON.stringify({
            instructions: request.instructions,
            messages: request.messages,
            tools: request.tools,
            outputs: request.continuation?.outputs,
          });
          withheld &&= !(turn.expect.withheld ?? []).some((marker) =>
            transmitted.includes(marker),
          );
          const response = await selectedModel.invoke(request, signal);
          inputTokens += response.invocation.inputTokens ?? 0;
          outputTokens += response.invocation.outputTokens ?? 0;
          return response;
        },
      };
      try {
        const capabilities = item.analytics
          ? [createSalesAnalyticsCapability({ sankhya: syntheticReader }, [])]
          : [capability];
        const outcome = await runConversationTurn(measured, capabilities, {
          actor: {
            id: "synthetic-evaluation-actor",
            permissions: new Set(item.permission ? ["sales:read"] : []),
          },
          message: turn.message,
          contexts,
          history,
          source: "sankhya",
          signal: AbortSignal.timeout(90000),
          progress: () => Promise.resolve(),
          trace: noTrace,
        });
        contexts = outcome.contexts;
        reply = outcome.reply;
        history.push({
          id: `turn_${index + 1}`,
          sequence: history.length + 1,
          source: "sankhya",
          question: turn.message,
          reply,
        });
      } catch (cause) {
        error = failure(cause);
      }
      const checks = [
        {
          name: "expected_outcome",
          passed: error === (turn.expect.error ?? null),
        },
        { name: "data_reads", passed: reads === turn.expect.reads },
        ...(turn.expect.metrics
          ? [
              {
                name: "semantic_measures",
                passed:
                  JSON.stringify(
                    queries.map((query) => query.metric).sort(),
                  ) === JSON.stringify([...turn.expect.metrics].sort()),
              },
            ]
          : []),
        ...(turn.expect.groupBy
          ? [
              {
                name: "semantic_dimensions",
                passed:
                  queries.length > 0 &&
                  queries.every(
                    (query) => query.groupBy === turn.expect.groupBy,
                  ),
              },
            ]
          : []),
        {
          name: "bounded_model_calls",
          passed: modelCalls <= turn.expect.maxModelCalls,
        },
        { name: "authorization_and_source_projection", passed: withheld },
        ...(turn.expect.kind
          ? [{ name: "reply_kind", passed: reply?.kind === turn.expect.kind }]
          : []),
        ...(turn.expect.displayResult === undefined
          ? []
          : [
              {
                name: "result_card_visibility",
                passed: reply?.displayResult === turn.expect.displayResult,
              },
            ]),
        ...(turn.expect.contains?.length
          ? [
              {
                name: "canonical_facts",
                passed: turn.expect.contains.every((text) =>
                  reply?.message.includes(text),
                ),
              },
            ]
          : []),
        ...(turn.expect.absent?.length
          ? [
              {
                name: "unsupported_content_absent",
                passed: turn.expect.absent.every(
                  (text) => !reply?.message.includes(text),
                ),
              },
            ]
          : []),
        {
          name: "no_unresolved_references",
          passed: !reply?.message.includes("{{"),
        },
        {
          name: "nonempty_response",
          passed: error !== null || Boolean(reply?.message.trim()),
        },
      ];
      const passed = checks.every((check) => check.passed);
      observed.turns.push({
        turn: index + 1,
        passed,
        reads,
        modelCalls,
        inputTokens,
        outputTokens,
        error,
        checks,
      });
      observed.passed &&= passed;
    }
    if (observed.passed) report.passed++;
    else report.failed++;
  }
  if (!report.cases.length)
    throw new Error("No conversational evaluation cases selected");
  return report;
}

async function main() {
  const { values } = parseArgs({
    options: {
      subject: { type: "string", default: "scripted" },
      model: { type: "string" },
      case: { type: "string", multiple: true },
    },
  });
  if (values.subject !== "scripted" && values.subject !== "model")
    throw new Error("Invalid evaluation subject");
  const key = process.env.OPENAI_API_KEY;
  if (values.subject === "model" && !key)
    throw new Error("Model evaluation requires the configured OpenAI key");
  const model =
    values.subject === "model"
      ? createOpenAiConversationModel(
          { openaiApiKey: key },
          values.model ?? process.env.OPENAI_MODEL ?? "gpt-6.1-sol",
          { timeoutMs: 60000 },
        )
      : undefined;
  const report = await runConversationEvaluation({
    model,
    caseIds: values.case,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main().catch(() => {
    process.stderr.write(
      "Conversational evaluation could not complete; inspect configuration and selected case ids.\n",
    );
    process.exitCode = 1;
  });
