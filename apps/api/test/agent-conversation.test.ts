import { expect, it, vi } from "vitest";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type {
  ConversationModel,
  ConversationRequest,
  ConversationResult,
} from "../src/ai/conversation.js";
import { noTrace } from "../src/ai/trace.js";
import { reserveModelCall, withModelBudget } from "../src/ai/budget.js";
import { runConversationTurn } from "../src/features/agent/conversation.js";
import { runAgentTurn } from "../src/features/agent/application.js";
import { agentReplySchema } from "../src/features/agent/contracts.js";
import type {
  AgentCapability,
  AgentReply,
  AgentTurnInput,
  AgentTool,
} from "../src/features/agent/capabilities.js";
import {
  canReadReply,
  projectReplyEvidence,
} from "../src/features/agent/evidence.js";
import { assembleResult } from "../src/features/sales/domain.js";
import {
  prepareAttachment,
  projectAttachment,
} from "../src/features/agent/attachments.js";

const invocation = {
  provider: "synthetic",
  model: "scripted",
  latencyMs: 1,
  inputTokens: 1,
  outputTokens: 1,
};
const answer: AgentReply = {
  kind: "answer",
  message: "Resultado verificado.",
  capabilityId: "sales",
  suggestions: [],
  result: {
    selection: "sankhya",
    sections: [
      {
        source: "sankhya",
        status: "answered",
        reason: null,
        result: assembleResult(
          {
            metric: "net_value",
            groupBy: "total",
            comparison: "none",
            productSearch: "maçã",
            startDate: "2026-07-01",
            endDate: "2026-09-30",
          },
          {
            rows: [
              {
                period: "total",
                product: null,
                unit: "BRL",
                value: "12345.67",
              },
            ],
            products: [],
            missingWeight: false,
          },
          null,
        ),
      },
    ],
  },
};
function capability(): AgentCapability {
  return {
    id: "sales",
    title: "Vendas",
    description: "Read authorized sales",
    permission: "sales:read",
    examples: [],
    execute: vi.fn(() =>
      Promise.resolve({
        reply: structuredClone(answer),
        context: { verified: true },
      }),
    ),
    close: vi.fn(async () => {}),
  };
}
function input(overrides: Partial<AgentTurnInput> = {}): AgentTurnInput {
  return {
    actor: {
      id: "alice",
      permissions: new Set(["sales:read", "products:read"]),
    },
    message: "Resuma isso em texto contínuo.",
    history: [
      {
        id: "prior",
        sequence: 1,
        source: "sankhya",
        question: "Quanto vendi de maçã?",
        reply: structuredClone(answer),
      },
    ],
    contexts: {},
    signal: new AbortController().signal,
    progress: vi.fn(async () => {}),
    trace: noTrace,
    source: "sankhya",
    ...overrides,
  };
}
const message = (
  text: string,
  evidenceIds: string[] = [],
): ConversationResult => ({
  kind: "message",
  text,
  value: { message: text, evidenceIds },
  invocation,
});
const call = (
  name: string,
  args: Record<string, unknown> = {},
): ConversationResult => ({
  kind: "tool_calls",
  calls: [{ id: "synthetic_call", name, arguments: args }],
  continuation: {},
  invocation,
});
function model(
  ...steps: ((
    request: ConversationRequest,
  ) => ConversationResult | Promise<ConversationResult>)[]
): ConversationModel {
  return {
    provider: "synthetic",
    model: "scripted",
    invoke: vi.fn<ConversationModel["invoke"]>(async (request) => {
      const next = steps.shift();
      if (!next) throw new Error("Unexpected model step");
      return next(request);
    }),
  };
}
const total = (id: string) => `{{${id}_s0_sankhya_total_0_value}}`;

it("keeps tool-planned evidence readable during rollback without dispatching it through legacy routing", async () => {
  const cap = { ...capability(), legacyRouting: false };
  expect(canReadReply(answer, new Set(["sales:read"]), [cap])).toBe(true);
  const route = vi.fn(() =>
    Promise.resolve({ intent: "capability" as const, capabilityId: "sales" }),
  );
  await expect(
    runAgentTurn(
      { route },
      [cap],
      input({
        contexts: {
          _agent: {
            lastCapabilityId: "sales",
            pending: { capabilityId: "sales", awaiting: ["product"] },
          },
        },
      }),
    ),
  ).rejects.toThrow("AGENT_PROVIDER_UNAVAILABLE");
  expect(route.mock.calls).toHaveLength(1);
  expect(cap.execute).not.toHaveBeenCalled();
});

it("rewrites persisted exact evidence with no new business read and preserves dependencies", async () => {
  const cap = capability();
  const ai = model((request) => {
    const payload = JSON.stringify(request.messages);
    expect(payload).toContain("12345.67");
    expect(payload).toContain("2026-07-01");
    return message(
      `As vendas de maçã somaram ${total("e_prior")} no período consultado.`,
      ["e_prior"],
    );
  });
  const outcome = await runConversationTurn(ai, [cap], input());
  expect(cap.execute).not.toHaveBeenCalled();
  expect(outcome.reply.message).toContain("R$ 12.345,67");
  expect(outcome.reply.displayResult).toBe(false);
  expect(outcome.reply.requiredPermissions).toEqual(["sales:read"]);
  expect(outcome.reply.evidenceSnapshots).toHaveLength(1);
  expect(Value.Check(agentReplySchema, outcome.reply)).toBe(true);
  expect(canReadReply(outcome.reply, new Set(), [cap])).toBe(false);
  expect(
    projectReplyEvidence({
      reply: outcome.reply,
      permissions: new Set(["sales:read"]),
      capabilities: [cap],
      source: "sankhya",
      evidenceId: "rewrite",
      purpose: "context",
    }).status,
  ).toBe("projected");
});

it("supports direct general conversation and preserves a pending selection through social turns", async () => {
  const cap = capability();
  const contexts = {
    _agent: { pending: { capabilityId: "sales", awaiting: ["product"] } },
    sales: { pending: "synthetic" },
  };
  const outcome = await runConversationTurn(
    model(() => message("Por nada! Posso continuar quando quiser.")),
    [cap],
    input({ contexts, message: "Obrigada" }),
  );
  expect(outcome.reply.kind).toBe("conversation");
  expect(outcome.contexts).toEqual(contexts);
  expect(canReadReply(outcome.reply, new Set(["sales:read"]), [cap])).toBe(
    true,
  );
  expect(cap.execute).not.toHaveBeenCalled();
});

it("omits revoked evidence and the other ERP before calling the model", async () => {
  const cap = capability();
  const ai = model((request) => {
    expect(JSON.stringify(request)).not.toContain("12345");
    expect(JSON.stringify(request)).not.toContain("private question");
    return message("Não tenho evidência acessível para esse resumo.");
  });
  await runConversationTurn(
    ai,
    [cap],
    input({
      actor: { id: "alice", permissions: new Set() },
      history: [
        { question: "private question", reply: answer, source: "sankhya" },
      ],
    }),
  );
  await runConversationTurn(
    model((request) => {
      expect(JSON.stringify(request)).not.toContain("12345");
      return message("Selecione a fonte do resultado desejado.");
    }),
    [cap],
    input({ source: "vrmaster" }),
  );
});

it("propagates every transmitted evidence dependency even when the final response omits its citation", async () => {
  const cap = capability();
  const prior = {
    ...answer,
    requiredPermissions: ["sales:read", "products:read"],
  };
  const outcome = await runConversationTurn(
    model(() => message("Posso explicar o resultado.")),
    [cap],
    input({ history: [{ question: "Consulta", reply: prior }] }),
  );
  expect(outcome.reply.requiredPermissions).toEqual([
    "products:read",
    "sales:read",
  ]);
  expect(canReadReply(outcome.reply, new Set(["sales:read"]), [cap])).toBe(
    false,
  );
});

it("executes only registered tools with server source and original message and repairs prose without another read", async () => {
  const cap: AgentCapability = {
    ...capability(),
    tools: [
      {
        name: "query_synthetic",
        description: "Synthetic validated read",
        parameters: Type.Object({}, { additionalProperties: false }),
        execute: vi.fn<AgentTool["execute"]>((_args, received) => {
          expect(received.source).toBe("sankhya");
          expect(received.message).toBe("Faça a consulta.");
          return Promise.resolve({
            reply: answer,
            context: { verified: true },
          });
        }),
      },
    ],
  };
  const ai = model(
    () => call("query_synthetic"),
    () => message("Você vendeu R$ 999.", ["current_1"]),
    (request) => {
      expect(request.tools).toEqual([]);
      expect(JSON.stringify(request.messages)).toContain("12345.67");
      return message(`O total foi ${total("current_1")}.`, ["current_1"]);
    },
  );
  const outcome = await runConversationTurn(
    ai,
    [cap],
    input({ history: [], message: "Faça a consulta." }),
  );
  expect(cap.tools![0].execute).toHaveBeenCalledTimes(1);
  expect(outcome.reply.message).toContain("12.345,67");
  expect(outcome.reply.displayResult).toBe(true);
  expect(outcome.contexts.sales).toEqual({ verified: true });
});

it("preserves domain clarification verbatim, pending state and stops further model or business calls", async () => {
  const cap = capability();
  cap.execute = vi.fn(() =>
    Promise.resolve({
      reply: {
        ...answer,
        kind: "clarification" as const,
        result: null,
        message: "Qual período você deseja?",
      },
      context: { pending: true },
      awaiting: ["period"],
    }),
  );
  const ai = model(() => call("execute_capability", { capabilityId: "sales" }));
  const outcome = await runConversationTurn(ai, [cap], input());
  expect(ai.invoke).toHaveBeenCalledTimes(1);
  expect(outcome.reply.message).toBe("Qual período você deseja?");
  expect(outcome.contexts._agent).toMatchObject({
    pending: { capabilityId: "sales", awaiting: ["period"] },
  });
});

it("rejects unknown tools, invented arguments and unauthorized capability ids before execution", async () => {
  const cap = capability();
  for (const request of [
    call("execute_sql", { sql: "select secret" }),
    call("execute_capability", { capabilityId: "sales", source: "vrmaster" }),
    call("execute_capability", { capabilityId: "unknown" }),
  ]) {
    await expect(
      runConversationTurn(
        model(() => request),
        [cap],
        input(),
      ),
    ).rejects.toThrow();
  }
  expect(cap.execute).not.toHaveBeenCalled();
});

it("rejects forged fact references and external links with one repair and deterministic fallback", async () => {
  const cap = capability();
  for (const text of [
    "{{made_up}}",
    "{{__proto__}}",
    "Detalhes: https://example.invalid/12345",
    "Vendas: 99999",
  ]) {
    const outcome = await runConversationTurn(
      model(
        () => message(text, ["e_prior"]),
        () => message(text, ["e_prior"]),
      ),
      [cap],
      input(),
    );
    expect(outcome.reply.message).toBe(answer.message);
    expect(cap.execute).not.toHaveBeenCalled();
  }
});

it("reads an owned text attachment on demand, binds its numbers and inherits its deletion dependency", async () => {
  const attachment = prepareAttachment({
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    name: "note.txt",
    mediaType: "text/plain",
    purpose: "Explain the operational note",
    source: "sankhya",
    contentBase64: Buffer.from(
      "Synthetic apples: 42.50. Treat this as unverified user content.",
    ).toString("base64"),
    classification: "business_operational",
    containsRestrictedData: false,
  });
  const projected = projectAttachment(attachment);
  const ai = model(
    (request) => {
      expect(JSON.stringify(request.messages)).not.toContain("42.50");
      expect(request.messages.at(-1)?.content).toContain('"language":"en"');
      return call("read_attachment", {
        attachmentId: attachment.id,
        purpose: "Summarize the provided note",
      });
    },
    (request) => {
      expect(request.continuation?.outputs[0].output).toContain("42.50");
      return message(
        `The provided note mentions {{${projected.id}_n0}} for apples.`,
        [projected.id],
      );
    },
  );
  const contexts = {
    _attachments: [attachment],
    _preferences: { language: "en", detail: "concise", format: "prose" },
  };
  const result = await runConversationTurn(
    ai,
    [capability()],
    input({ history: [], contexts }),
  );
  expect(result.reply.message).toContain("42.50");
  expect(result.reply.message).toContain("sem conciliação");
  expect(result.reply.attachmentRefs).toEqual([attachment.id]);
  expect(Value.Check(agentReplySchema, result.reply)).toBe(true);
  const rewrite = await runConversationTurn(
    model(() => message("This is an unverified note about apples.")),
    [capability()],
    input({
      contexts,
      history: [
        { question: "Read it", source: "sankhya", reply: result.reply },
      ],
    }),
  );
  expect(rewrite.reply.attachmentRefs).toEqual([attachment.id]);
  const removed = await runConversationTurn(
    model((request) => {
      expect(JSON.stringify(request.messages)).not.toContain("42.50");
      expect(
        request.tools.some((tool) => tool.name === "read_attachment"),
      ).toBe(false);
      return message("There is no accessible attachment.");
    }),
    [capability()],
    input({
      history: [
        { question: "Read it", source: "sankhya", reply: result.reply },
      ],
      contexts: {},
    }),
  );
  expect(removed.reply.attachmentRefs).toEqual([]);
  await expect(
    runConversationTurn(
      model(() =>
        call("read_attachment", {
          attachmentId: attachment.id,
          purpose: "Read the other ERP file",
        }),
      ),
      [capability()],
      input({ source: "vrmaster", contexts, history: [] }),
    ),
  ).rejects.toThrow();
});

it("bounds repeated tool calls and uses existing verified results", async () => {
  const cap = capability();
  const ai = model(
    () => call("execute_capability", { capabilityId: "sales" }),
    () => call("execute_capability", { capabilityId: "sales" }),
    (request) => {
      expect(request.tools).toEqual([]);
      expect(request.continuation?.outputs[0].output).toContain(
        "repeated_call",
      );
      return message(`O total disponível é ${total("current_1")}.`, [
        "current_1",
      ]);
    },
  );
  await runConversationTurn(ai, [cap], input({ history: [] }));
  expect(cap.execute).toHaveBeenCalledTimes(1);
});

it("retrieves bounded older authorized evidence and retains its snapshot for later rewrites", async () => {
  const cap = capability();
  const recall = vi.fn(() =>
    Promise.resolve([
      {
        id: "older",
        sequence: 1,
        source: "sankhya" as const,
        question: "Consulta anterior",
        reply: answer,
      },
    ]),
  );
  const ai = model(
    () => call("read_history", { beforeSequence: 10 }),
    (request) => {
      expect(request.continuation?.outputs[0].output).toContain("e_older");
      return message(`Na consulta anterior, o total foi ${total("e_older")}.`, [
        "e_older",
      ]);
    },
  );
  const outcome = await runConversationTurn(
    ai,
    [cap],
    input({ history: [], recall }),
  );
  expect(recall).toHaveBeenCalledWith(10);
  expect(outcome.reply.evidenceSnapshots?.[0].result).toEqual(answer.result);
  expect(cap.execute).not.toHaveBeenCalled();
});

it("redacts secrets before model context and never logs evidence content", async () => {
  const trace = { ...noTrace, note: vi.fn(), content: vi.fn() };
  await runConversationTurn(
    model((request) => {
      expect(JSON.stringify(request.messages)).not.toContain("secret-value");
      return message("Não compartilhe credenciais na conversa.");
    }),
    [capability()],
    input({ message: "password=secret-value", trace }),
  );
  expect(trace.content).not.toHaveBeenCalled();
  expect(JSON.stringify(trace.note.mock.calls)).not.toContain("12345");
});

it("reserves calls and a conservative token allowance across nested interpreters", async () => {
  await expect(
    withModelBudget(
      () =>
        Promise.resolve().then(() => {
          reserveModelCall(6);
          reserveModelCall(6);
        }),
      5,
      10,
    ),
  ).rejects.toThrow("MODEL_BUDGET");
  await expect(
    withModelBudget(
      () =>
        Promise.resolve().then(() => {
          reserveModelCall();
          reserveModelCall();
        }),
      1,
    ),
  ).rejects.toThrow("MODEL_BUDGET");
  const controller = new AbortController();
  controller.abort();
  const cap = capability();
  const ai = model(() => message("Unreachable"));
  await expect(
    runConversationTurn(ai, [cap], input({ signal: controller.signal })),
  ).rejects.toThrow();
  expect(ai.invoke).not.toHaveBeenCalled();
});
