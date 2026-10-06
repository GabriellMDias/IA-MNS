import { noTrace, type TraceRecorder } from "../../ai/trace.js";
import {
  answerFor,
  assembleResult,
  businessToday,
  type SalesResult,
} from "./domain.js";
import { describeAnalysis } from "./analysis.js";
import {
  advance,
  recordExchange,
  type Clarification,
  type SalesConversationState,
} from "./conversation-state.js";
import { Conversations } from "./conversations.js";
import {
  salesInterpreterVersion,
  type SalesInterpreter,
} from "./interpreter.js";
import type { SalesReader } from "./oracle.js";
import { SalesFailure } from "./errors.js";

const clarificationQuestions: Readonly<Record<Clarification, string>> = {
  period: "Qual período você quer consultar?",
  period_limit:
    "Uma consulta pode abranger no máximo 366 dias. Qual período você quer consultar?",
  product: "Qual produto ou descrição você quer consultar?",
  measure: "Você quer consultar valor líquido, quantidade ou peso vendido?",
  comparison: "Com qual período você quer comparar as vendas?",
  context:
    "Ainda não há uma consulta anterior. Informe o produto, o período e o que deseja medir.",
  ambiguous:
    "Pode detalhar o produto, o período e o que deseja medir? Sua pergunta tem mais de uma interpretação.",
};
const unsupportedMessage =
  "Ainda não consigo atender essa consulta. Posso ajudar com valor líquido, quantidade e peso vendido, por período ou produto.";

export type SalesReply = {
  conversationId: string;
  kind: "answer" | "clarification" | "unsupported";
  message: string;
  result: SalesResult | null;
  suggestions: string[];
};
export type SalesTurn = { reply: SalesReply; state: SalesConversationState };
export type SalesActor = Readonly<{ id: string; canReadSales: boolean }>;
export function authorizeSales(actor: SalesActor): void {
  if (!actor.canReadSales || !actor.id)
    throw new SalesFailure("SALES_ACCESS_DENIED");
}
export class SalesChat {
  private active = 0;
  private readonly interpreter: SalesInterpreter;
  private readonly reader: SalesReader;
  readonly conversations: Conversations;
  private readonly now: () => Date;
  constructor(
    interpreter: SalesInterpreter,
    reader: SalesReader,
    conversations = new Conversations(),
    now: () => Date = () => new Date(),
  ) {
    this.interpreter = interpreter;
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
      const turn = await this.execute(
        message,
        session.id,
        session.state,
        signal,
      );
      this.conversations.release(session, turn.state);
      return turn.reply;
    } finally {
      if (session.busy) this.conversations.release(session);
      this.active--;
    }
  }
  /**
   * Interprets one message against the structured conversation state, then
   * clarifies, rejects, or executes the compiled plan. Only the returned
   * state may replace the caller's state; a failure leaves it unchanged.
   */
  async execute(
    message: string,
    conversationId: string,
    state: SalesConversationState,
    signal: AbortSignal,
    progress: (
      stage: "interpreting_sales" | "querying_sales" | "organizing",
    ) => Promise<void> = () => Promise.resolve(),
    trace: TraceRecorder = noTrace,
  ): Promise<SalesTurn> {
    await progress("interpreting_sales");
    const today = businessToday(this.now());
    trace.note("sales", { interpreter: salesInterpreterVersion });
    trace.content("sales", { today, stateBefore: state });
    const interpretation = await this.interpreter.interpret(
      { message, state, today },
      signal,
      trace,
    );
    signal.throwIfAborted();
    const step = advance(state, interpretation, message, today);
    trace.content("sales", { interpretation });
    trace.note("sales", {
      decision: interpretation.decision,
      relation: interpretation.relation,
      appliedRelation: step.notes.relation,
      issues: step.notes.issues,
      missing: step.notes.missing,
      periodKind: step.notes.periodKind,
      outcome: step.kind,
      clarification: step.kind === "clarify" ? step.clarification : null,
      unsupportedReason: interpretation.unsupportedReason,
    });
    if (step.kind !== "execute") {
      const kind = step.kind === "clarify" ? "clarification" : "unsupported";
      const text =
        step.kind === "clarify"
          ? clarificationQuestions[step.clarification]
          : unsupportedMessage;
      const next = recordExchange(step.state, {
        user: message,
        reply: kind,
        text,
      });
      trace.content("sales", { stateAfter: next });
      return {
        reply: {
          conversationId,
          kind,
          message: text,
          result: null,
          suggestions: [],
        },
        state: next,
      };
    }
    const query = step.query;
    await progress("querying_sales");
    const data = await this.reader.read(query, signal);
    signal.throwIfAborted();
    await progress("organizing");
    const result = assembleResult(query, data.current, data.previous);
    const next = recordExchange(step.state, {
      user: message,
      reply: "answer",
      text: describeAnalysis(step.spec, query),
    });
    trace.content("sales", { query, stateAfter: next });
    trace.note("sales", { resultRows: result.rows.length });
    return {
      reply: {
        conversationId,
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
      },
      state: next,
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
