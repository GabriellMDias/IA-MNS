import OpenAI from "openai";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import type { ServerConfig } from "../config.js";
import {
  ModelFailure,
  type StructuredModel,
  type StructuredRequest,
  type StructuredResult,
} from "./model.js";

/**
 * OpenAI Responses adapter: one forced strict function call, no provider-side
 * storage and no automatic retries of chargeable requests.
 */
export function createOpenAiModel(
  config: Pick<ServerConfig, "openaiApiKey" | "openaiModel">,
  options: { model?: string; timeoutMs?: number } = {},
): StructuredModel {
  const model = options.model ?? config.openaiModel;
  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    // The request budget of interactive turns; offline tooling may extend it.
    timeout: options.timeoutMs ?? 20000,
    maxRetries: 0,
  });
  return {
    provider: "openai",
    model,
    async invoke<T extends TSchema>(
      request: StructuredRequest<T>,
      signal: AbortSignal,
    ): Promise<StructuredResult<T>> {
      const started = performance.now();
      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create(
          {
            model,
            store: false,
            max_output_tokens: request.maxOutputTokens,
            instructions: request.instructions,
            input: request.messages.map(({ role, content }) => ({
              role,
              content,
            })),
            tools: [
              {
                type: "function",
                name: request.tool.name,
                description: request.tool.description,
                strict: true,
                parameters: {
                  ...(request.tool.parameters as Record<string, unknown>),
                },
              },
            ],
            tool_choice: { type: "function", name: request.tool.name },
            parallel_tool_calls: false,
          },
          { signal },
        );
      } catch (cause) {
        throw new ModelFailure("provider", cause);
      }
      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );
      if (
        response.status !== "completed" ||
        calls.length !== 1 ||
        calls[0].name !== request.tool.name
      )
        throw new ModelFailure("incomplete");
      let candidate: unknown;
      try {
        candidate = JSON.parse(calls[0].arguments);
      } catch (cause) {
        throw new ModelFailure("invalid_output", cause);
      }
      if (!Value.Check(request.tool.parameters, candidate))
        throw new ModelFailure("invalid_output");
      return {
        value: candidate,
        invocation: {
          provider: "openai",
          model,
          latencyMs: Math.round(performance.now() - started),
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
        },
      };
    },
  };
}
