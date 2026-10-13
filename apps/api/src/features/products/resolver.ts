import { noTrace, type TraceRecorder } from "../../ai/trace.js";
import { groundedIn } from "../sales/analysis.js";
import {
  answerMessage,
  answerSuggestions,
  buildAnswer,
  clarificationMessages,
  describeRequest,
  unavailableMessage,
  unsupportedMessage,
  type UnsupportedReason,
} from "./answer.js";
import {
  enabledDimensions,
  relationshipOf,
  type CatalogDimension,
  type SemanticCatalog,
} from "./catalog.js";
import type { ProductAnswer, ProductOptions } from "./contracts.js";
import type { SelectionChoice } from "./interpretation.js";
import type { ProductInterpreter } from "./interpreter.js";
import {
  pathText,
  within,
  type HierarchyNode,
  type NodeChoice,
  type ProductSelection,
  type ResolvedCriterion,
} from "./selection.js";
import type {
  CategoryCandidate,
  ProductSource,
  RecordMatch,
} from "./source.js";
import {
  withExchange,
  type PendingQuestion,
  type ProductOption,
  type ProductState,
  type StoredRequest,
} from "./state.js";
import { literalPhrase, significantWords } from "./text.js";
import type { SalesProductScope } from "../sales/product-scope.js";

export type ProductReply = Readonly<{
  kind: "answer" | "clarification" | "unsupported";
  message: string;
  result: ProductAnswer | ProductOptions | null;
  suggestions: string[];
}>;
export type ProductTurn = Readonly<{
  reply: ProductReply;
  state: ProductState;
  /** What the capability waits for; routing offers the next message to it. */
  awaiting: readonly string[] | null;
}>;
export type ProductStage = "interpreting_products" | "querying_products";
export type ProductTurnInput = Readonly<{
  message: string;
  state: ProductState;
  signal: AbortSignal;
  progress: (stage: ProductStage) => Promise<void>;
  trace?: TraceRecorder;
  /** False when the person selected a source without a product catalog. */
  sourceSelected: boolean;
  /** Identify only product conditions of an already validated sales request. */
  purpose?: "lookup" | "sales";
}>;

/** The bounded number of products listed in one answer. */
export const productListLimit = 200;

type Outcome =
  | { kind: "resolved"; criterion: ResolvedCriterion }
  | {
      kind: "ask";
      message: string;
      awaiting: PendingQuestion["awaiting"];
      options: ProductOption[];
      issue: string;
    };

/**
 * Converts a Portuguese product-selection request into a validated selection
 * and its products. The model reads the request and chooses among real
 * candidates; the application grounds, resolves, merges, validates, asks
 * and executes. ERP-specific work is behind the ProductSource port.
 */
export class ProductResolver {
  readonly catalog: SemanticCatalog;
  private readonly source: ProductSource;
  private readonly interpreter: ProductInterpreter;
  constructor(source: ProductSource, interpreter: ProductInterpreter) {
    this.source = source;
    this.interpreter = interpreter;
    this.catalog = source.catalog;
  }

  close(): Promise<void> {
    return this.source.close();
  }

  salesScope(
    selection: ProductSelection,
    signal: AbortSignal,
  ): Promise<SalesProductScope> {
    if (!this.source.salesScope)
      throw new Error("Sales product scope unavailable");
    return this.source.salesScope(selection, signal);
  }

  async execute(input: ProductTurnInput): Promise<ProductTurn> {
    const trace = input.trace ?? noTrace;
    const { state, message, signal } = input;
    const issues: string[] = [];
    const finish = (
      turn: Omit<ProductTurn, "awaiting">,
      outcome: string,
    ): ProductTurn => {
      trace.note("products", {
        outcome,
        catalog: this.catalog.version,
        issues,
        criteria:
          turn.state.active?.criteria.map((item) => item.dimension) ?? [],
        pendingAwaiting: turn.state.pending?.awaiting ?? null,
      });
      return {
        ...turn,
        awaiting: turn.state.pending ? [turn.state.pending.awaiting] : null,
      };
    };
    const reply = (
      kind: ProductReply["kind"],
      text: string,
      next: Pick<ProductState, "active" | "pending">,
      result: ProductReply["result"] = null,
      suggestions: string[] = [],
      transcriptText = text,
    ) => ({
      reply: { kind, message: text, result, suggestions },
      state: {
        version: 1 as const,
        ...next,
        transcript: withExchange(state, {
          user: message,
          reply: kind,
          text: transcriptText,
        }),
      },
    });
    const keep = { active: state.active, pending: state.pending };
    const unsupported = (reason: UnsupportedReason) =>
      finish(
        reply("unsupported", unsupportedMessage(this.catalog, reason), keep),
        `unsupported_${reason}`,
      );

    if (!input.sourceSelected) return unsupported("source");

    // A pending choice answered with its number or name needs no model call.
    const direct =
      state.pending?.awaiting === "choice"
        ? directChoice(message, state.pending.options)
        : null;
    let relation: "new" | "refine" | "answer_pending" = "answer_pending";
    let choice: number | null = direct;
    let requested: StoredRequest[] = [];
    if (direct === null) {
      await input.progress("interpreting_products");
      const interpretation = await this.interpreter.interpret(
        { message, state, purpose: input.purpose },
        signal,
        trace,
      );
      trace.content("products.interpretation", { interpretation });
      trace.note("products.interpretation", {
        decision: interpretation.decision,
        relation: interpretation.relation,
        dimensions: interpretation.criteria.map((item) => item.dimension),
        unsupportedReason: interpretation.unsupportedReason,
      });
      if (interpretation.decision === "unsupported")
        return unsupported(interpretation.unsupportedReason ?? "other_data");
      relation = interpretation.relation;
      choice = interpretation.choice;
      requested = interpretation.criteria.map((item) => ({
        ...item,
        searchTerms: item.searchTerms.slice(0, 5),
      }));
      if (relation === "answer_pending" && !state.pending) {
        relation = state.active ? "refine" : "new";
        issues.push("pending_absent");
      }
      if (relation === "refine" && state.pending) {
        relation = "answer_pending";
        issues.push("refine_applied_to_pending");
      }
      if (relation === "refine" && !state.active) {
        issues.push("refine_without_context");
        return finish(
          reply("clarification", clarificationMessages.context, keep),
          "clarification_context",
        );
      }
      if (relation !== "answer_pending") choice = null;
    }

    // Dimensions the catalog does not enable are explained, never rerouted.
    const unavailable = this.dimensionsOf(requested).filter(
      (dimension) => dimension.exposure !== "enabled",
    );
    if (unavailable.length > 0) {
      issues.push("dimension_unavailable");
      return finish(
        reply("unsupported", unavailableMessage(unique(unavailable)), keep),
        "unsupported_dimension",
      );
    }
    // A value the person never wrote must not silently restrict products.
    const evidence = [...state.transcript.map((item) => item.user), message];
    requested = requested.filter((item) => {
      const grounded = groundedIn(item.text, evidence);
      if (!grounded) issues.push(`ungrounded_${item.dimension}`);
      return grounded;
    });

    let resolved: ResolvedCriterion[];
    if (relation === "answer_pending") {
      const pending = state.pending!;
      if (choice !== null) {
        if (
          pending.awaiting !== "choice" ||
          choice < 1 ||
          choice > pending.options.length
        ) {
          issues.push("choice_out_of_range");
          return finish(
            reply(
              "clarification",
              pending.options.length > 0
                ? clarificationMessages.choice(pending.options.length)
                : clarificationMessages.products,
              keep,
              optionsResult(this.catalog, pending),
            ),
            "clarification_choice",
          );
        }
        resolved = [
          ...pending.resolved,
          structuredClone(pending.options[choice - 1].criterion),
        ];
        requested = [...pending.remaining, ...requested];
      } else {
        if (requested.length === 0) {
          issues.push("pending_unanswered");
          return finish(
            reply(
              "clarification",
              pending.awaiting === "choice"
                ? clarificationMessages.repeat
                : clarificationMessages.products,
              keep,
              optionsResult(this.catalog, pending),
            ),
            "clarification_repeat",
          );
        }
        resolved = [...pending.resolved];
        requested = [...requested, ...pending.remaining];
      }
    } else if (relation === "refine") {
      resolved = state.active!.criteria.filter(
        (criterion) =>
          !requested.some(
            (item) =>
              item.dimension === criterion.dimension &&
              item.mode === criterion.mode,
          ),
      );
    } else resolved = [];

    if (resolved.length + requested.length === 0)
      return finish(
        reply("clarification", clarificationMessages.products, keep),
        "clarification_products",
      );
    if (resolved.length + requested.length > 8) {
      issues.push("too_many_criteria");
      return finish(
        reply("clarification", clarificationMessages.products, keep),
        "clarification_products",
      );
    }

    await input.progress("querying_products");
    for (let index = 0; index < requested.length; index++) {
      const request = requested[index];
      const outcome = await this.resolve(request, message, signal, trace);
      if (outcome.kind === "resolved") {
        resolved.push(outcome.criterion);
        continue;
      }
      issues.push(outcome.issue);
      const pending: PendingQuestion = {
        awaiting: outcome.awaiting,
        asked: request,
        resolved,
        remaining: requested.slice(index + 1),
        options: outcome.options,
      };
      return finish(
        reply(
          "clarification",
          outcome.message,
          { active: state.active, pending },
          optionsResult(this.catalog, pending),
        ),
        `clarification_${outcome.issue}`,
      );
    }

    const merged = mergeDisjoint(this.catalog, resolved, issues);
    const contradiction = contradictory(merged);
    if (contradiction) {
      issues.push("contradiction");
      return finish(
        reply(
          "clarification",
          clarificationMessages.contradiction(
            this.dimension(contradiction).title,
          ),
          { active: state.active, pending: null },
        ),
        "clarification_contradiction",
      );
    }
    const selection: ProductSelection = { criteria: merged };
    trace.content("products.selection", {
      selection: describeRequest(this.catalog, selection),
    });
    const page = await this.source.find(selection, productListLimit, signal);
    signal.throwIfAborted();
    const answer = buildAnswer(this.catalog, selection, page);
    trace.note("products.result", {
      total: page.total,
      listed: page.products.length,
    });
    return finish(
      reply(
        "answer",
        answerMessage(this.catalog, selection, answer),
        { active: selection, pending: null },
        answer,
        answerSuggestions(this.catalog, selection),
        describeRequest(this.catalog, selection),
      ),
      "answer",
    );
  }

  private dimension(id: string): CatalogDimension {
    const dimension = this.catalog.dimensions.find((item) => item.id === id);
    if (!dimension) throw new Error("Unknown product dimension");
    return dimension;
  }

  private dimensionsOf(requested: readonly StoredRequest[]) {
    return requested.map((item) => this.dimension(item.dimension));
  }

  private async resolve(
    request: StoredRequest,
    message: string,
    signal: AbortSignal,
    trace: TraceRecorder,
  ): Promise<Outcome> {
    const dimension = this.dimension(request.dimension);
    const base = {
      dimension: dimension.id,
      mode: request.mode,
      text: request.text.slice(0, 120),
    };
    switch (dimension.kind) {
      case "hierarchy":
        return this.resolveCategory(dimension, request, message, signal, trace);
      case "entity":
        return this.resolveRecord(dimension, request, signal);
      case "text": {
        const phrase = literalPhrase(request.text);
        if (phrase.replace(/[^A-Z0-9]/g, "").length < 2)
          return ask(
            clarificationMessages.shortText,
            "product",
            [],
            "short_text",
          );
        return {
          kind: "resolved",
          criterion: { kind: "text", ...base, phrase },
        };
      }
      case "flag":
        return { kind: "resolved", criterion: { kind: "flag", ...base } };
      case "status":
        return { kind: "resolved", criterion: { kind: "status", ...base } };
    }
  }

  private async resolveCategory(
    dimension: CatalogDimension,
    request: StoredRequest,
    message: string,
    signal: AbortSignal,
    trace: TraceRecorder,
  ): Promise<Outcome> {
    const terms = searchTerms(request);
    if (terms.length === 0)
      return ask(
        clarificationMessages.noCategory(request.text),
        "product",
        [],
        "no_category",
      );
    const found = await this.source.categoryCandidates(
      dimension,
      terms,
      signal,
    );
    trace.note("products.candidates", {
      dimension: dimension.id,
      candidates: found.candidates.length,
      named: found.candidates.filter((item) => item.matchedBy === "name")
        .length,
      truncated: found.truncated,
    });
    const candidates = found.candidates;
    if (candidates.length === 0)
      return ask(
        clarificationMessages.noCategory(request.text),
        "product",
        [],
        "no_category",
      );
    const base = {
      kind: "hierarchy" as const,
      dimension: dimension.id,
      mode: request.mode,
      text: request.text.slice(0, 120),
      qualifier: request.qualifier,
      terms,
    };
    // One node named exactly as asked, holding every mention, needs no choice.
    const only = candidates[0];
    if (
      candidates.length === 1 &&
      only.matchedBy === "name" &&
      request.qualifier === null &&
      found.textMatches <= only.matchingProducts
    )
      return {
        kind: "resolved",
        criterion: {
          ...base,
          include: [{ node: only.node, scope: "subtree" }],
          anywhere: false,
          exclude: [],
        },
      };
    const choice = await this.interpreter.select(
      {
        message,
        dimension,
        criterion: request,
        candidates,
        textMatches: found.textMatches,
      },
      signal,
      trace,
    );
    trace.content("products.selection_choice", { choice });
    trace.note("products.selection", {
      decision: choice.decision,
      included: choice.include.length,
      excluded: choice.exclude.length,
      allText: choice.allText,
      alternatives: choice.alternatives.length,
    });
    if (choice.decision === "select") {
      const criterion = categoryCriterion(base, candidates, choice);
      if (criterion) return { kind: "resolved", criterion };
    }
    if (choice.decision === "ambiguous") {
      const options = choice.alternatives.flatMap((alternative) => {
        const criterion = categoryCriterion(base, candidates, alternative);
        return criterion
          ? [
              {
                label: categoryLabel(criterion, found.textMatches),
                personal: false,
                criterion,
              },
            ]
          : [];
      });
      if (options.length >= 2)
        return ask(
          clarificationMessages.ambiguousCategory(request.text),
          "choice",
          options.slice(0, 4),
          "ambiguous_category",
        );
    }
    return ask(
      clarificationMessages.noMatchingCategory(request.text, request.qualifier),
      "product",
      [],
      "no_matching_category",
    );
  }

  private async resolveRecord(
    dimension: CatalogDimension,
    request: StoredRequest,
    signal: AbortSignal,
  ): Promise<Outcome> {
    // The dimension's own words ("comprador") are not part of a name.
    const own = new Set(
      [dimension.title, ...dimension.synonyms].flatMap(significantWords),
    );
    // A domain synonym can itself be the value (for example a registered usage).
    const domainWords = new Set(
      dimension.domain?.flatMap((option) => significantWords(option.label)) ??
        [],
    );
    const words = significantWords(request.text).filter(
      (word) => !own.has(word) || domainWords.has(word),
    );
    if (words.length === 0)
      return ask(
        clarificationMessages.noName(dimension.title),
        "product",
        [],
        "no_name",
      );
    const entity = this.catalog.entities.find(
      (item) => item.id === dimension.entity,
    );
    const personal = entity?.personalData ?? true;
    const option = (match: RecordMatch): ProductOption => ({
      label: match.record.label,
      personal,
      criterion: recordCriterion(dimension, request, [match]),
    });
    const matches = uncovered(
      await this.source.findRecords(dimension, words.slice(0, 6), signal),
    );
    if (matches.length === 1)
      return {
        kind: "resolved",
        criterion: recordCriterion(dimension, request, matches),
      };
    if (matches.length > 1)
      return ask(
        clarificationMessages.ambiguousRecord(
          dimension.title,
          request.text,
          matches.length,
        ),
        "choice",
        matches.slice(0, 16).map(option),
        "ambiguous_record",
      );
    const listed = leaves(await this.source.listRecords(dimension, signal));
    return ask(
      clarificationMessages.noRecord(
        dimension.title,
        request.text,
        listed.length,
      ),
      listed.length > 0 ? "choice" : "product",
      listed.slice(0, 16).map(option),
      "no_record",
    );
  }
}

function ask(
  message: string,
  awaiting: PendingQuestion["awaiting"],
  options: ProductOption[],
  issue: string,
): Outcome {
  return { kind: "ask", message, awaiting, options, issue };
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** The asked words and the model's alternatives, without repetitions. */
function searchTerms(request: StoredRequest): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of [request.text, ...request.searchTerms]) {
    const words = significantWords(term);
    const key = words.join(" ");
    if (words.length === 0 || seen.has(key)) continue;
    seen.add(key);
    terms.push(term.slice(0, 120));
  }
  return terms.slice(0, 6);
}

function categoryCriterion(
  base: Omit<
    Extract<ResolvedCriterion, { kind: "hierarchy" }>,
    "include" | "exclude" | "anywhere"
  >,
  candidates: readonly CategoryCandidate[],
  choice: Pick<SelectionChoice, "include" | "exclude" | "allText">,
): Extract<ResolvedCriterion, { kind: "hierarchy" }> | null {
  const include: NodeChoice[] = [];
  for (const reference of unique(choice.include)) {
    const candidate = candidates[reference - 1];
    if (!candidate) return null;
    const scope =
      candidate.matchedBy === "products" ? "matching_text" : "subtree";
    // A node already inside an included subtree adds nothing.
    if (
      include.some(
        (item) => item.scope === "subtree" && within(candidate.node, item.node),
      )
    )
      continue;
    include.push({ node: candidate.node, scope });
  }
  const covering = include.filter((item) => item.scope === "subtree");
  const kept = include.filter(
    (item) =>
      item.scope === "subtree" ||
      !covering.some(
        (other) => other !== item && within(item.node, other.node),
      ),
  );
  const exclude: HierarchyNode[] = [];
  for (const reference of unique(choice.exclude)) {
    const candidate = candidates[reference - 1];
    if (!candidate) return null;
    // Only exclusions inside an inclusion change the result.
    if (kept.some((item) => within(candidate.node, item.node)))
      exclude.push(candidate.node);
  }
  if (kept.length === 0 && !choice.allText) return null;
  if (
    kept.every((item) => exclude.some((node) => within(item.node, node))) &&
    !choice.allText
  )
    return null;
  return {
    ...base,
    include: kept.slice(0, 60),
    anywhere: choice.allText,
    exclude: exclude.slice(0, 60),
  };
}

function categoryLabel(
  criterion: Extract<ResolvedCriterion, { kind: "hierarchy" }>,
  textMatches: number,
): string {
  const parts = criterion.include
    .slice(0, 3)
    .map((choice) =>
      choice.scope === "subtree"
        ? pathText(choice.node.path)
        : `${pathText(choice.node.path)} (com “${criterion.text}”)`,
    );
  if (criterion.include.length > 3)
    parts.push(`mais ${criterion.include.length - 3} classificações`);
  if (criterion.anywhere)
    parts.push(
      `todos os produtos com “${criterion.text}” na descrição (${textMatches})`,
    );
  const label = parts.join(" + ");
  return (
    criterion.exclude.length > 0
      ? `${label}, exceto ${criterion.exclude.map((node) => pathText(node.path)).join("; ")}`
      : label
  ).slice(0, 600);
}

function recordCriterion(
  dimension: CatalogDimension,
  request: StoredRequest,
  matches: readonly RecordMatch[],
): ResolvedCriterion {
  const values = new Map<number | string, RecordMatch["record"]>();
  for (const match of matches)
    for (const value of match.covers) values.set(value.id, value);
  return {
    kind: "entity",
    dimension: dimension.id,
    mode: request.mode,
    text: request.text.slice(0, 120),
    matched: matches.slice(0, 20).map((match) => match.record),
    values: [...values.values()].slice(0, 200),
  };
}

/** Matches not already represented by another match's descendants. */
function uncovered(matches: readonly RecordMatch[]): RecordMatch[] {
  return matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other !== match &&
          other.covers.some((value) => value.id === match.record.id) &&
          !match.covers.some((value) => value.id === other.record.id),
      ),
  );
}

/** Listed records that stand for no other listed record: the most specific ones. */
function leaves(matches: readonly RecordMatch[]): RecordMatch[] {
  return matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other !== match &&
          match.covers.some((value) => value.id === other.record.id),
      ),
  );
}

const ordinals: Record<string, number> = {
  primeira: 1,
  primeiro: 1,
  segunda: 2,
  segundo: 2,
  terceira: 3,
  terceiro: 3,
  quarta: 4,
  quarto: 4,
  quinta: 5,
  quinto: 5,
};

/**
 * The option a reply chooses without interpretation: a number, an ordinal or
 * words that identify exactly one option label. Null when uncertain.
 */
export function directChoice(
  message: string,
  options: readonly ProductOption[],
): number | null {
  if (options.length === 0) return null;
  const trimmed = message.trim().toLowerCase();
  const numbered =
    /^(?:(?:a|o|op[cç][aã]o|n[uú]mero)\s*)?(\d{1,2})\s*[.)]?$/u.exec(trimmed);
  if (numbered) return Number(numbered[1]);
  const words = significantWords(message);
  if (words.length === 1 && ordinals[words[0]] !== undefined)
    return ordinals[words[0]];
  if (words.length === 0) return null;
  const phrase = words.join(" ");
  const matching = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => groundedIn(phrase, [option.label]));
  return matching.length === 1 ? matching[0].index + 1 : null;
}

/** Whether every relationship from the root to the dimension's values is many-to-one. */
function singleValued(
  catalog: SemanticCatalog,
  dimension: CatalogDimension,
): boolean {
  return (
    (dimension.kind === "hierarchy" || dimension.kind === "entity") &&
    dimension.path.every(
      (id) => relationshipOf(catalog, id).cardinality === "many_to_one",
    )
  );
}

/**
 * Two inclusions of one single-valued dimension with disjoint values can only
 * mean either value (a product has one buyer or one classification), so they
 * merge; overlapping ones stay combined with AND ("mercearia" and "doces").
 */
function mergeDisjoint(
  catalog: SemanticCatalog,
  criteria: readonly ResolvedCriterion[],
  issues: string[],
): ResolvedCriterion[] {
  const result: ResolvedCriterion[] = [];
  for (const criterion of criteria) {
    const dimension = catalog.dimensions.find(
      (item) => item.id === criterion.dimension,
    )!;
    const index = result.findIndex(
      (other) =>
        other.dimension === criterion.dimension &&
        other.mode === "include" &&
        criterion.mode === "include",
    );
    const other = index >= 0 ? result[index] : undefined;
    if (other && singleValued(catalog, dimension)) {
      const merged = mergePair(other, criterion);
      if (merged) {
        result[index] = merged;
        issues.push("merged_disjoint_values");
        continue;
      }
    }
    result.push(criterion);
  }
  return result;
}

function mergePair(
  left: ResolvedCriterion,
  right: ResolvedCriterion,
): ResolvedCriterion | null {
  const text = `${left.text}, ${right.text}`.slice(0, 120);
  if (left.kind === "entity" && right.kind === "entity") {
    const ids = new Set(left.values.map((value) => value.id));
    if (right.values.some((value) => ids.has(value.id))) return null;
    return {
      ...left,
      text,
      matched: [...left.matched, ...right.matched].slice(0, 20),
      values: [...left.values, ...right.values].slice(0, 200),
    };
  }
  if (left.kind === "hierarchy" && right.kind === "hierarchy") {
    const simple = (item: typeof left) =>
      !item.anywhere &&
      item.include.every((choice) => choice.scope === "subtree");
    if (!simple(left) || !simple(right)) return null;
    const overlaps = left.include.some((a) =>
      right.include.some(
        (b) => within(a.node, b.node) || within(b.node, a.node),
      ),
    );
    if (overlaps) return null;
    return {
      ...left,
      text,
      qualifier: left.qualifier ?? right.qualifier,
      include: [...left.include, ...right.include].slice(0, 60),
      exclude: [...left.exclude, ...right.exclude].slice(0, 60),
      terms: unique([...left.terms, ...right.terms]).slice(0, 6),
    };
  }
  return null;
}

/** A dimension whose inclusions are all excluded again, or null. */
function contradictory(criteria: readonly ResolvedCriterion[]): string | null {
  for (const included of criteria) {
    if (included.mode !== "include") continue;
    for (const excluded of criteria) {
      if (
        excluded.mode !== "exclude" ||
        excluded.dimension !== included.dimension
      )
        continue;
      if (included.kind === "entity" && excluded.kind === "entity") {
        const removed = new Set(excluded.values.map((value) => value.id));
        if (included.values.every((value) => removed.has(value.id)))
          return included.dimension;
      }
      if (
        included.kind === "hierarchy" &&
        excluded.kind === "hierarchy" &&
        !included.anywhere &&
        !excluded.anywhere &&
        excluded.exclude.length === 0 &&
        included.include.every((choice) =>
          excluded.include.some(
            (other) =>
              other.scope === "subtree" && within(choice.node, other.node),
          ),
        )
      )
        return included.dimension;
      if (
        (included.kind === "flag" || included.kind === "status") &&
        excluded.kind === included.kind
      )
        return included.dimension;
    }
  }
  return null;
}

function optionsResult(
  catalog: SemanticCatalog,
  pending: PendingQuestion,
): ProductOptions | null {
  if (pending.options.length === 0) return null;
  const dimension = catalog.dimensions.find(
    (item) => item.id === pending.asked.dimension,
  );
  return {
    kind: "product_options",
    source: catalog.source.id === "sankhya" ? "sankhya" : "vrmaster",
    title: dimension?.title ?? pending.asked.dimension,
    text: pending.asked.text,
    options: pending.options.map((option, index) => ({
      number: index + 1,
      label: option.label,
    })),
  };
}

/** Enabled dimensions, in catalog order, for help texts and tests. */
export function availableDimensions(catalog: SemanticCatalog) {
  return enabledDimensions(catalog).map((dimension) => dimension.title);
}
