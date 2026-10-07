import type { SalesQuery } from "./domain.js";

/**
 * The sales sources and what each one means. The person chooses the source in
 * the interface; the application never infers it from message text. "all" is
 * an orchestration of the individual sources, never a database of its own:
 * each source answers separately and figures are never summed across sources.
 */
export const salesSources = ["sankhya", "vrmaster"] as const;
export type SalesSource = (typeof salesSources)[number];
export type SourceSelection = SalesSource | "all";
export const defaultSelection: SourceSelection = "sankhya";

type Metric = SalesQuery["metric"];
export type SourceSemantics = Readonly<{
  label: string;
  /** Measures with reviewed reference SQL in this source. */
  measures: readonly Metric[];
  /** Answer wording of each supported measure. */
  measureLabels: Readonly<Partial<Record<Metric, string>>>;
  /** What a sale is in this source; always shown with its results. */
  basis: string;
  quantityNote: string;
  weightNote?: string;
  missingWeightNote?: string;
}>;

export const sourceCatalog: Readonly<Record<SalesSource, SourceSemantics>> = {
  sankhya: {
    label: "MNS (Sankhya)",
    measures: ["net_value", "quantity", "weight"],
    measureLabels: {
      net_value: "Valor líquido vendido",
      quantity: "Quantidade vendida",
      weight: "Peso vendido",
    },
    basis:
      "Vendas confirmadas, sem devoluções e sem vendas bonificadas; data de negociação (DTNEG).",
    quantityNote:
      "Quantidades separadas por unidade do ERP; unidades diferentes não são somadas.",
    weightNote:
      "Peso calculado por QTDNEG × PESOLIQ, na unidade cadastrada no ERP.",
    missingWeightNote:
      "Há produtos sem PESOLIQ positivo; o peso pode estar incompleto.",
  },
  vrmaster: {
    label: "Pilar da Terra (VR Master)",
    measures: ["net_value", "quantity"],
    measureLabels: {
      net_value: "Valor total vendido",
      quantity: "Quantidade vendida",
    },
    basis:
      "Vendas registradas no VR Master (tabela venda, todas as lojas), pela data da venda; valor = soma de valortotal.",
    quantityNote:
      "Quantidades separadas pelo tipo de embalagem do produto; tipos diferentes não são somados.",
  },
};

export const selectionLabels: Readonly<Record<SourceSelection, string>> = {
  sankhya: sourceCatalog.sankhya.label,
  vrmaster: sourceCatalog.vrmaster.label,
  all: "Tudo",
};

/** The sources a selection queries, in fixed presentation order. */
export function sourcesOf(selection: SourceSelection): SalesSource[] {
  return selection === "all" ? [...salesSources] : [selection];
}

export function supportsMetric(source: SalesSource, metric: Metric): boolean {
  return sourceCatalog[source].measures.includes(metric);
}

// Names that designate a source. Only used to tell the person that the text
// differs from the selector; they never select, add or remove a source.
const sourceNames: Readonly<Record<SalesSource, readonly RegExp[]>> = {
  sankhya: [/\bsankhya\b/, /(?<!\bia[\s-])\bmns\b/],
  vrmaster: [/\bvr[\s-]?master\b/, /\bpilar da terra\b/],
};
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Sources named in the text, in catalog order. */
export function mentionedSources(text: string): SalesSource[] {
  const value = plain(text);
  return salesSources.filter((source) =>
    sourceNames[source].some((name) => name.test(value)),
  );
}

/** Whether a phrase is nothing but a source name, such as "Pilar da Terra". */
export function isSourceName(phrase: string): boolean {
  const value = plain(phrase).trim();
  return salesSources.some((source) =>
    sourceNames[source].some((name) => {
      const match = name.exec(value);
      return match !== null && match[0] === value;
    }),
  );
}

/**
 * A deterministic notice when the message names sources other than the
 * selection; the selection still decides what is queried.
 */
export function selectionNotice(
  message: string,
  selection: SourceSelection,
): string | null {
  const named = mentionedSources(message);
  const selected = sourcesOf(selection);
  if (
    named.length === 0 ||
    (named.length === selected.length &&
      named.every((source) => selected.includes(source)))
  )
    return null;
  const names = named.map((source) => sourceCatalog[source].label).join(" e ");
  return selection === "all"
    ? `Sua mensagem menciona ${names}, mas a fonte selecionada é Tudo: consultei as duas fontes e mostro cada uma separadamente. Para consultar somente uma, altere o seletor Fonte.`
    : `Sua mensagem menciona ${names}, mas a fonte selecionada é ${selectionLabels[selection]}. Consultei somente a fonte selecionada; para consultar outra, altere o seletor Fonte.`;
}
