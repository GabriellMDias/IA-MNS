import { Value } from "typebox/value";
import type { ServerConfig } from "../../config.js";
import type { AgentCapability } from "../agent/capabilities.js";
import { querySchema } from "./contracts.js";
import type { SalesQuery } from "./domain.js";
import { SalesChat } from "./application.js";
import { createOpenAiPlanner } from "./planner.js";
import { createOracleReader } from "./oracle.js";
export function createSalesCapability(
  config: ServerConfig,
  injected?: SalesChat,
): AgentCapability {
  const service =
    injected ??
    new SalesChat(createOpenAiPlanner(config), createOracleReader(config));
  return {
    id: "sales",
    title: "Consultas de vendas",
    description:
      "Consulte valor líquido, quantidade e peso vendido no Sankhya, detalhe produtos e compare períodos.",
    examples: [
      "Quanto vendi de maçã por mês nos últimos 3 meses?",
      "Qual foi o valor líquido vendido neste mês?",
      "Compare as vendas do mês passado com o mesmo período do ano anterior.",
    ],
    permission: "sales:read",
    async execute(input) {
      const saved = input.context as {
        version?: unknown;
        lastQuery?: unknown;
        questions?: unknown;
        clarifications?: unknown;
      } | null;
      if (
        saved !== null &&
        (saved.version !== 1 ||
          (saved.lastQuery !== null &&
            !Value.Check(querySchema, saved.lastQuery)))
      )
        throw new Error("Unsupported sales conversation context");
      const prior = saved?.lastQuery as SalesQuery | null | undefined;
      const history = input.history
        .filter((item) => item.reply.capabilityId === "sales")
        .slice(-12);
      const validStrings = (value: unknown): value is string[] =>
        Array.isArray(value) &&
        value.length <= 12 &&
        value.every((item) => typeof item === "string" && item.length <= 2000);
      if (
        saved &&
        ((saved.questions !== undefined && !validStrings(saved.questions)) ||
          (saved.clarifications !== undefined &&
            !validStrings(saved.clarifications)))
      )
        throw new Error("Invalid sales question context");
      const questions =
        saved && validStrings(saved.questions)
          ? saved.questions
          : history.map((item) => item.question);
      const clarifications =
        saved && validStrings(saved.clarifications)
          ? saved.clarifications
          : history.map((item) =>
              item.reply.result ? "" : item.reply.message,
            );
      const reply = await service.execute(
        input.message,
        "persistent",
        { questions, clarifications, previousQuery: prior ?? null },
        input.signal,
        input.progress,
      );
      return {
        reply: {
          kind: reply.kind === "unsupported" ? "unavailable" : reply.kind,
          capabilityId: "sales",
          message: reply.message,
          result: reply.result,
          suggestions: reply.suggestions,
        },
        context: {
          version: 1,
          lastQuery: reply.result?.query ?? prior ?? null,
          questions: [...questions, input.message].slice(-12),
          clarifications: [
            ...clarifications,
            reply.result ? "" : reply.message,
          ].slice(-12),
        },
      };
    },
    close: () => service.close(),
  };
}
