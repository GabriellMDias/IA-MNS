import OpenAI from "openai";
import { Value } from "typebox/value";
import type { ServerConfig } from "../config.js";
import { recordModelUsage, reserveModelCall } from "./budget.js";
import type {
  ConversationContinuation,
  ConversationModel,
  ConversationRequest,
  ConversationResult,
  ConversationToolCall,
} from "./conversation.js";
import { ModelFailure } from "./model.js";
import { redactModelText } from "./transmission-text.js";

type ContinuationState = Readonly<{
  model: string;
  input: OpenAI.Responses.ResponseInputItem[];
  callId: string;
}>;

/** Provider schema subset; the untouched local schema remains authoritative. */
function providerSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const adapt = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(adapt);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        key === "uniqueItems" && typeof child === "boolean"
          ? []
          : [[key, adapt(child)]],
      ),
    );
  };
  return adapt(schema) as Record<string, unknown>;
}

/**
 * Stateless Responses conversation: no provider storage, automatic retries,
 * hosted tools or SDK payload logging. The complete output is retained only in
 * an opaque in-memory continuation until the next server-controlled step.
 */
export function createOpenAiConversationModel(
  config: Pick<ServerConfig, "openaiApiKey">,
  model: string | (() => Promise<string>),
  options: {
    timeoutMs?: number;
    maxInputBytes?: number;
    maxOutputTokens?: number;
  } = {},
): ConversationModel {
  const timeoutMs = options.timeoutMs ?? 20000;
  const maxInputBytes = options.maxInputBytes ?? 262144;
  const maxOutputTokens = options.maxOutputTokens ?? 8192;
  const continuations = new WeakMap<
    ConversationContinuation,
    ContinuationState
  >();
  let current = typeof model === "string" ? model : "";
  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: timeoutMs,
    maxRetries: 0,
    logLevel: "off",
  });

  return {
    provider: "openai",
    get model() {
      return current;
    },
    async invoke(
      request: ConversationRequest,
      signal: AbortSignal,
    ): Promise<ConversationResult> {
      const started = performance.now();
      const deadline = AbortSignal.any([
        signal,
        AbortSignal.timeout(timeoutMs),
      ]);
      if (deadline.aborted) throw new ModelFailure("provider");
      if (
        !Number.isSafeInteger(request.maxOutputTokens) ||
        request.maxOutputTokens < 1 ||
        request.maxOutputTokens > maxOutputTokens ||
        new Set(request.tools.map((tool) => tool.name)).size !==
          request.tools.length
      )
        throw new ModelFailure("invalid_output");

      let previous: ContinuationState | undefined;
      let input: OpenAI.Responses.ResponseInputItem[];
      if (request.continuation) {
        previous = continuations.get(request.continuation.state);
        const outputs = request.continuation.outputs;
        if (
          !previous ||
          outputs.length !== 1 ||
          outputs[0].callId !== previous.callId ||
          typeof outputs[0].output !== "string"
        )
          throw new ModelFailure("invalid_output");
        input = [
          ...previous.input,
          {
            type: "function_call_output",
            call_id: outputs[0].callId,
            output: outputs[0].image
              ? [
                  {
                    type: "input_text",
                    text: redactModelText(outputs[0].output),
                  },
                  {
                    type: "input_image",
                    image_url: `data:${outputs[0].image.mediaType};base64,${outputs[0].image.data}`,
                    detail: "auto",
                  },
                ]
              : redactModelText(outputs[0].output),
          },
        ];
      } else {
        input = request.messages.map(({ role, content }) => ({
          role,
          content: redactModelText(content),
        }));
      }

      let id: string;
      try {
        // Keep a single turn on the same model even if an owner changes the
        // operational parameter between its tool calls.
        id =
          previous?.model ??
          (typeof model === "string"
            ? model
            : await resolveWithinDeadline(model, deadline));
      } catch (cause) {
        throw new ModelFailure("provider", cause);
      }
      current = id;
      const body: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: id,
        store: false,
        background: false,
        truncation: "disabled",
        include: ["reasoning.encrypted_content"],
        instructions: redactModelText(request.instructions),
        input,
        tools: request.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: providerSchema(
            tool.parameters as Record<string, unknown>,
          ),
          strict: true,
        })),
        tool_choice: request.tools.length ? "auto" : "none",
        parallel_tool_calls: false,
        max_output_tokens: request.maxOutputTokens,
        ...(request.responseFormat
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: request.responseFormat.name,
                  schema: providerSchema(
                    request.responseFormat.schema as Record<string, unknown>,
                  ),
                  strict: true,
                },
              },
            }
          : {}),
      };
      const inputBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
      if (inputBytes > maxInputBytes) throw new ModelFailure("invalid_output");
      if (deadline.aborted) throw new ModelFailure("provider");
      // Inline image bytes are bounded separately; reserve a conservative vision
      // allowance per image plus text bytes, not base64 transport characters.
      const budgetText = JSON.stringify(body).replace(
        /data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+/gu,
        "[inline image]",
      );
      const imageCount = (
        JSON.stringify(body).match(/data:image\/(?:png|jpeg);base64,/gu) ?? []
      ).length;
      reserveModelCall(
        Buffer.byteLength(budgetText) +
          imageCount * 16384 +
          request.maxOutputTokens +
          1024,
      );
      if (request.continuation)
        continuations.delete(request.continuation.state);

      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create(body, { signal: deadline });
      } catch (cause) {
        throw new ModelFailure("provider", cause);
      }
      if (deadline.aborted) throw new ModelFailure("provider");
      const invocation = {
        provider: "openai",
        model: id,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      };
      recordModelUsage(invocation);
      if (response.status !== "completed") throw new ModelFailure("incomplete");
      if (
        !Array.isArray(response.output) ||
        Buffer.byteLength(JSON.stringify(response.output), "utf8") >
          maxInputBytes
      )
        throw new ModelFailure("invalid_output");

      const output: OpenAI.Responses.ResponseInputItem[] = [];
      const calls: ConversationToolCall[] = [];
      const texts: string[] = [];
      for (const item of response.output) {
        if (!item || typeof item !== "object")
          throw new ModelFailure("invalid_output");
        if ("status" in item && item.status && item.status !== "completed")
          throw new ModelFailure("incomplete");
        if (item.type === "reasoning") {
          output.push(item);
        } else if (item.type === "message") {
          if (item.role !== "assistant" || !Array.isArray(item.content))
            throw new ModelFailure("invalid_output");
          for (const part of item.content) {
            if (
              !part ||
              part.type !== "output_text" ||
              typeof part.text !== "string"
            )
              throw new ModelFailure("invalid_output");
            texts.push(part.text);
          }
          output.push(item);
        } else if (item.type === "function_call") {
          const tool = request.tools.find((tool) => tool.name === item.name);
          if (
            !tool ||
            typeof item.call_id !== "string" ||
            !item.call_id ||
            item.call_id.length > 256 ||
            typeof item.arguments !== "string"
          )
            throw new ModelFailure("invalid_output");
          const candidate = parseJson(item.arguments);
          if (
            !candidate ||
            typeof candidate !== "object" ||
            Array.isArray(candidate) ||
            !Value.Check(tool.parameters, candidate)
          )
            throw new ModelFailure("invalid_output");
          calls.push({
            id: item.call_id,
            name: tool.name,
            arguments: candidate as Record<string, unknown>,
          });
          output.push(item);
        } else {
          // Only the function tools registered for this step can run. Hosted
          // tools, unsolicited provider items and their outputs are refused.
          throw new ModelFailure("invalid_output");
        }
      }
      if (calls.length) {
        if (calls.length !== 1) throw new ModelFailure("invalid_output");
        const continuation = Object.freeze({});
        continuations.set(continuation, {
          model: id,
          input: [...input, ...output],
          callId: calls[0].id,
        });
        return { kind: "tool_calls", calls, continuation, invocation };
      }
      const text = texts.join("\n").trim();
      if (!text) throw new ModelFailure("invalid_output");
      const value: unknown = request.responseFormat ? parseJson(text) : null;
      if (
        request.responseFormat &&
        !Value.Check(request.responseFormat.schema, value)
      )
        throw new ModelFailure("invalid_output");
      return { kind: "message", text, value, invocation };
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A SyntaxError may quote confidential model output in its message.
    throw new ModelFailure("invalid_output");
  }
}

async function resolveWithinDeadline(
  resolve: () => Promise<string>,
  signal: AbortSignal,
): Promise<string> {
  let abort: () => void = () => undefined;
  const canceled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new ModelFailure("provider"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    return await Promise.race([resolve(), canceled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
