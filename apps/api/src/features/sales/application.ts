import { noTrace, type TraceRecorder } from "../../ai/trace.js";
import {
  answerFor,
  assembleResult,
  businessToday,
  type SalesQuery,
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
import type { SalesReader } from "./reader.js";
import { SalesFailure } from "./errors.js";
import {
  defaultSelection,
  selectionNotice,
  sourceCatalog,
  sourcesOf,
  supportsMetric,
  type SalesSource,
  type SourceSelection,
} from "./sources.js";

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
const measureNames: Readonly<Record<SalesQuery["metric"], string>> = {
  net_value: "o valor vendido",
  quantity: "a quantidade vendida",
  weight: "o peso vendido",
};

/** Why a source has no result; failures never become a partial figure. */
export type SectionReason =
  "provider_unavailable" | "not_configured" | "result_too_large" | "measure";
export type SourceSection = {
  source: SalesSource;
  status: "answered" | "unavailable" | "unsupported";
  reason: SectionReason | null;
  result: SalesResult | null;
};
/** One answer per queried source, with its provenance. Never summed. */
export type SalesAnswer = {
  selection: SourceSelection;
  sections: SourceSection[];
};
export type SalesReply = {
  conversationId: string;
  kind: "answer" | "clarification" | "unsupported";
  message: string;
  result: SalesResult | null;
  suggestions: string[];
};
export type SalesTurn = {
  reply: Omit<SalesReply, "result"> & { answer: SalesAnswer | null };
  state: SalesConversationState;
};
export type SalesActor = Readonly<{ id: string; canReadSales: boolean }>;
/** The configured adapters; an absent source is reported as not configured. */
export type SourceReaders = Readonly<Partial<Record<SalesSource, SalesReader>>>;
export type ExecuteOptions = Readonly<{
  selection?: SourceSelection;
  /** Observes a source failure that the answer reports instead of failing. */
  report?: (error: unknown) => void;
}>;
export function authorizeSales(actor: SalesActor): void {
  if (!actor.canReadSales || !actor.id)
    throw new SalesFailure("SALES_ACCESS_DENIED");
}

function sectionText(section: SourceSection, metric: SalesQuery["metric"]) {
  const label = sourceCatalog[section.source].label;
  if (section.result)
    return `${label}: ${answerFor(section.result, section.source)}`;
  const reasons: Readonly<Record<SectionReason, string>> = {
    provider_unavailable:
      "não consegui consultar esta fonte agora. Tente novamente em instantes.",
    not_configured: "esta fonte ainda não está configurada no IA-MNS.",
    result_too_large:
      "a consulta ficou muito ampla para esta fonte. Reduza o período ou especifique melhor o produto.",
    measure: `${measureNames[metric]} não está disponível nesta fonte.`,
  };
  return `${label}: ${reasons[section.reason ?? "provider_unavailable"]}`;
}
const failureReasons: Readonly<
  Partial<Record<SalesFailure["code"], SectionReason>>
> = {
  SALES_PROVIDER_UNAVAILABLE: "provider_unavailable",
  SALES_NOT_CONFIGURED: "not_configured",
  SALES_RESULT_TOO_LARGE: "result_too_large",
};

export class SalesChat {
  private active = 0;
  private readonly interpreter: SalesInterpreter;
  private readonly readers: SourceReaders;
  readonly conversations: Conversations;
  private readonly now: () => Date;
  constructor(
    interpreter: SalesInterpreter,
    readers: SourceReaders,
    conversations = new Conversations(),
    now: () => Date = () => new Date(),
  ) {
    this.interpreter = interpreter;
    this.readers = readers;
    this.conversations = conversations;
    this.now = now;
  }
  /** Legacy single-source contract: always the Sankhya source. */
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
      const { answer, ...reply } = turn.reply;
      return { ...reply, result: answer?.sections[0].result ?? null };
    } finally {
      if (session.busy) this.conversations.release(session);
      this.active--;
    }
  }
  private async readSource(
    source: SalesSource,
    query: SalesQuery,
    signal: AbortSignal,
  ): Promise<SalesResult> {
    const reader = this.readers[source];
    if (!reader) throw new SalesFailure("SALES_NOT_CONFIGURED");
    const data = await reader.read(query, signal);
    return assembleResult(query, data.current, data.previous, source);
  }
  /**
   * Interprets one message against the structured conversation state, then
   * clarifies, rejects, or executes the compiled plan against the sources of
   * the person's selection. The selection, not the message, decides the
   * sources. A single source that fails fails the turn; with "all", a failed
   * source is reported beside the other source's result. Only the returned
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
    options: ExecuteOptions = {},
  ): Promise<SalesTurn> {
    const selection = options.selection ?? defaultSelection;
    await progress("interpreting_sales");
    const today = businessToday(this.now());
    trace.note("sales", { interpreter: salesInterpreterVersion, selection });
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
    const notice = selectionNotice(message, selection);
    if (notice) trace.note("sales", { sourceNotice: true });
    const withNotice = (text: string) =>
      notice ? `${notice}\n\n${text}` : text;
    const finish = (
      kind: "clarification" | "unsupported",
      text: string,
      base: SalesConversationState,
    ): SalesTurn => {
      const next = recordExchange(base, { user: message, reply: kind, text });
      trace.content("sales", { stateAfter: next });
      return {
        reply: {
          conversationId,
          kind,
          message: withNotice(text),
          answer: null,
          suggestions: [],
        },
        state: next,
      };
    };
    if (step.kind !== "execute")
      return step.kind === "clarify"
        ? finish(
            "clarification",
            clarificationQuestions[step.clarification],
            step.state,
          )
        : finish("unsupported", unsupportedMessage, step.state);
    const query = step.query;
    const selected = sourcesOf(selection);
    const queried = selected.filter((source) =>
      supportsMetric(source, query.metric),
    );
    // A measure no selected source has stays unsupported; the plan is kept so
    // a refinement such as another measure can continue from it.
    if (queried.length === 0)
      return finish(
        "unsupported",
        `${sourceCatalog[selected[0]].label}: ${measureNames[query.metric]} não está disponível nesta fonte. Posso consultar ${sourceCatalog[selected[0]].measures.map((metric) => measureNames[metric]).join(" ou ")}.`,
        step.state,
      );
    await progress("querying_sales");
    const settled = await Promise.allSettled(
      queried.map((source) => this.readSource(source, query, signal)),
    );
    signal.throwIfAborted();
    const sections: SourceSection[] = selected.map((source) => {
      const index = queried.indexOf(source);
      if (index < 0)
        return {
          source,
          status: "unsupported",
          reason: "measure",
          result: null,
        };
      const outcome = settled[index];
      if (outcome.status === "fulfilled")
        return {
          source,
          status: "answered",
          reason: null,
          result: outcome.value,
        };
      const reason =
        outcome.reason instanceof SalesFailure
          ? failureReasons[outcome.reason.code]
          : undefined;
      // One selected source, a failure that is not a source outage, or no
      // answer at all: the turn fails as before rather than answering partly.
      if (selected.length === 1 || !reason) throw outcome.reason;
      options.report?.(outcome.reason);
      return { source, status: "unavailable", reason, result: null };
    });
    if (!sections.some((section) => section.status === "answered"))
      throw (
        settled.find(
          (item) => item.status === "rejected",
        ) as PromiseRejectedResult
      ).reason;
    await progress("organizing");
    const next = recordExchange(step.state, {
      user: message,
      reply: "answer",
      text: describeAnalysis(step.spec, query),
    });
    trace.content("sales", { query, stateAfter: next });
    trace.note("sales", {
      resultRows: sections.reduce(
        (count, section) => count + (section.result?.rows.length ?? 0),
        0,
      ),
      sources: sections.map(
        (section) => `${section.source}:${section.reason ?? section.status}`,
      ),
    });
    const weightAvailable = selected.some((source) =>
      supportsMetric(source, "weight"),
    );
    return {
      reply: {
        conversationId,
        kind: "answer",
        message: withNotice(
          [
            ...sections.map((section) => sectionText(section, query.metric)),
            ...(sections.length > 1
              ? [
                  "As fontes são apresentadas separadamente; os valores não são somados.",
                ]
              : []),
          ].join("\n\n"),
        ),
        answer: { selection, sections },
        suggestions: [
          ...(query.comparison === "none"
            ? ["E comparado ao mesmo período do ano passado?"]
            : []),
          ...(query.metric === "net_value"
            ? [
                "Qual foi a quantidade vendida nesse período?",
                ...(weightAvailable ? ["E o peso vendido?"] : []),
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
    await Promise.all(
      Object.values(this.readers).map((reader) => reader.close()),
    );
  }
}
