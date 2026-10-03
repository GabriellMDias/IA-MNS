import {
  answerFor,
  assembleResult,
  businessToday,
  validateQuery,
  type SalesQuery,
  type SalesResult,
} from "./domain.js";
import { Conversations } from "./conversations.js";
import type { SalesPlanner } from "./planner.js";
import type { SalesReader } from "./oracle.js";
import { SalesFailure } from "./errors.js";

const clarificationQuestions = {
  period: "Qual período você quer consultar?",
  product: "Qual produto ou descrição você quer consultar?",
  metric: "Você quer consultar valor líquido, quantidade ou peso vendido?",
  comparison: "Com qual período você quer comparar as vendas?",
  context:
    "Ainda não há uma consulta anterior. Informe o produto, o período e o que deseja medir.",
  ambiguous:
    "Pode detalhar o produto, o período e o que deseja medir? Sua pergunta tem mais de uma interpretação.",
} as const;

export type SalesReply = {
  conversationId: string;
  kind: "answer" | "clarification" | "unsupported";
  message: string;
  result: SalesResult | null;
  suggestions: string[];
};
export type SalesActor = Readonly<{ id: string; canReadSales: boolean }>;
export function authorizeSales(actor: SalesActor): void {
  if (!actor.canReadSales || !actor.id)
    throw new SalesFailure("SALES_ACCESS_DENIED");
}
export class SalesChat {
  private active = 0;
  private readonly planner: SalesPlanner;
  private readonly reader: SalesReader;
  readonly conversations: Conversations;
  private readonly now: () => Date;
  constructor(
    planner: SalesPlanner,
    reader: SalesReader,
    conversations = new Conversations(),
    now: () => Date = () => new Date(),
  ) {
    this.planner = planner;
    this.reader = reader;
    this.conversations = conversations;
    this.now = now;
  }
  async ask(
    actor: SalesActor,
    message: string,
    conversationId: string | undefined,
    signal: AbortSignal,
  ): Promise<SalesReply> {
    authorizeSales(actor);
    if (!message.trim() || message.length > 2000)
      throw new SalesFailure("SALES_QUERY_INVALID");
    if (this.active >= 3) throw new SalesFailure("SALES_CONVERSATION_BUSY");
    const session = this.conversations.acquire(actor.id, conversationId);
    this.active++;
    try {
      const reply = await this.execute(
        message,
        session.id,
        {
          questions: session.questions,
          clarifications: session.clarifications,
          previousQuery: session.previousQuery,
        },
        signal,
      );
      this.conversations.release(
        session,
        message,
        reply.result?.query,
        reply.result ? "" : reply.message,
      );
      return reply;
    } finally {
      if (session.busy) this.conversations.release(session);
      this.active--;
    }
  }
  async execute(
    message: string,
    conversationId: string,
    context: {
      questions: readonly string[];
      clarifications: readonly string[];
      previousQuery: SalesQuery | null;
    },
    signal: AbortSignal,
    progress: (
      stage: "interpreting_sales" | "querying_sales" | "organizing",
    ) => Promise<void> = () => Promise.resolve(),
  ): Promise<SalesReply> {
    await progress("interpreting_sales");
    const today = businessToday(this.now());
    const plan = await this.planner.plan(
      {
        message,
        questions: [...context.questions],
        clarifications: [...context.clarifications],
        previousQuery: context.previousQuery,
        today,
      },
      signal,
    );
    signal.throwIfAborted();
    if (plan.action !== "query") {
      const kind = plan.action === "clarify" ? "clarification" : "unsupported";
      const text =
        kind === "clarification"
          ? clarificationQuestions[
              plan.clarification === "context" && context.previousQuery
                ? "ambiguous"
                : plan.clarification!
            ]
          : "Ainda não consigo atender essa consulta. Posso ajudar com valor líquido, quantidade e peso vendido, por período ou produto.";
      return {
        conversationId: conversationId,
        kind,
        message: text,
        result: null,
        suggestions: [],
      };
    }
    const query: SalesQuery = validateQuery(
      {
        productSearch: plan.productSearch,
        startDate: plan.startDate!,
        endDate: plan.endDate!,
        metric: plan.metric,
        groupBy: plan.groupBy,
        comparison: plan.comparison,
      },
      today,
    );
    await progress("querying_sales");
    const data = await this.reader.read(query, signal);
    signal.throwIfAborted();
    await progress("organizing");
    const result = assembleResult(query, data.current, data.previous);
    return {
      conversationId: conversationId,
      kind: "answer",
      message: answerFor(result),
      result,
      suggestions: [
        ...(query.comparison === "none"
          ? ["E comparado ao mesmo período do ano passado?"]
          : []),
        ...(query.metric === "net_value"
          ? [
              "Qual foi a quantidade vendida nesse período?",
              "E o peso vendido?",
            ]
          : ["Qual foi o valor líquido vendido?"]),
        ...(query.groupBy !== "product"
          ? ["Detalhe por produto nesse período."]
          : []),
      ].slice(0, 3),
    };
  }
  forget(actor: SalesActor, conversationId: string) {
    authorizeSales(actor);
    this.conversations.remove(actor.id, conversationId);
  }
  async close() {
    this.conversations.close();
    await this.reader.close();
  }
}
