import type { ServerConfig } from "../../config.js";
import { createOpenAiModel } from "../../ai/openai.js";
import type { AgentCapability } from "../agent/capabilities.js";
import { SalesChat } from "./application.js";
import { loadSalesState } from "./conversation-state.js";
import { createModelInterpreter } from "./interpreter.js";
import { createSalesReaders } from "./readers.js";
export function createSalesCapability(
  config: ServerConfig,
  injected?: SalesChat,
): AgentCapability {
  const service =
    injected ??
    new SalesChat(
      createModelInterpreter(createOpenAiModel(config)),
      createSalesReaders(config),
    );
  return {
    id: "sales",
    title: "Consultas de vendas",
    description:
      "Consulte as vendas da MNS (Sankhya) e do Pilar da Terra (VR Master), conforme a fonte escolhida no seletor: valor, quantidade e peso vendido (peso somente no Sankhya), detalhe produtos e compare períodos.",
    examples: [
      "Quanto vendi de maçã por mês nos últimos 3 meses?",
      "Qual foi o valor líquido vendido neste mês?",
      "Compare as vendas do mês passado com o mesmo período do ano anterior.",
    ],
    permission: "sales:read",
    async execute(input) {
      const state = loadSalesState(
        input.context,
        input.history
          .filter((item) => item.reply.capabilityId === "sales")
          .slice(-12),
      );
      const turn = await service.execute(
        input.message,
        "persistent",
        state,
        input.signal,
        input.progress,
        input.trace,
        { selection: input.source, report: input.report },
      );
      return {
        reply: {
          kind:
            turn.reply.kind === "unsupported" ? "unavailable" : turn.reply.kind,
          capabilityId: "sales",
          message: turn.reply.message,
          result: turn.reply.answer,
          suggestions: turn.reply.suggestions,
        },
        context: turn.state,
        awaiting: turn.state.pending?.awaiting ?? null,
      };
    },
    close: () => service.close(),
  };
}
