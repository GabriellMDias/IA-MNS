import { Decimal } from "decimal.js";
import type { Static } from "typebox";
import type { TurnView } from "../agent/contracts.js";
import type { resultSchema, salesAnswerSchema } from "../sales/contracts.js";
import type { ProductAnswer, ProductOptions } from "../products/contracts.js";
import { unitText } from "../sales/domain.js";
import { sourceCatalog, type SalesSource } from "../sales/sources.js";

type SalesResult = Static<typeof resultSchema>;
type SalesAnswer = Static<typeof salesAnswerSchema>;

/** WhatsApp accepts 4096 characters per text message; parts stay below it. */
export const partLimit = 3800;
export const maxParts = 6;
const maxRows = 25;
const maxProducts = 20;

/** What a failed turn tells the person; the same meaning as the web wording. */
const failureText: Record<string, string> = {
  AGENT_ACCESS_DENIED: "Seu acesso não permite essa consulta.",
  SALES_ACCESS_DENIED: "Seu acesso não permite consultar vendas.",
  AGENT_PROVIDER_UNAVAILABLE:
    "Não consegui processar sua mensagem agora. Tente novamente em instantes.",
  SALES_PROVIDER_UNAVAILABLE:
    "Não consegui consultar as vendas agora. Tente novamente em instantes.",
  PRODUCTS_PROVIDER_UNAVAILABLE:
    "Não consegui consultar o cadastro de produtos agora. Tente novamente em instantes.",
  SALES_NOT_CONFIGURED:
    "A fonte de vendas selecionada ainda não está configurada no IA-MNS.",
  SALES_QUERY_INVALID:
    "Preciso de um período válido de até 366 dias e um filtro de produto mais específico.",
  SALES_RESULT_TOO_LARGE:
    "A consulta ficou muito ampla. Reduza o período ou especifique melhor o produto.",
  AGENT_EXECUTION_INTERRUPTED:
    "A resposta foi interrompida. Você pode enviar a mensagem novamente.",
  INTERNAL_ERROR:
    "Não consegui concluir esta resposta. Tente novamente em instantes.",
};
const unavailableText: Record<string, string> = {
  provider_unavailable:
    "Não consegui consultar esta fonte agora. Tente novamente em instantes.",
  not_configured: "Esta fonte ainda não está configurada no IA-MNS.",
  result_too_large:
    "A consulta ficou muito ampla para esta fonte. Reduza o período ou especifique melhor o produto.",
  measure: "Esta medida não está disponível nesta fonte.",
};
const productSourceLabel = {
  sankhya: "MNS (Sankhya)",
  vrmaster: "Pilar da Terra (VR Master)",
} as const;
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Decimal strings without binary floating point, as the web shows them. */
function amount(value: string, unit: string): string {
  const money = unit === "BRL" || unit === "%";
  const fixed = new Decimal(value).toFixed(money ? 2 : 9);
  const negative = fixed.startsWith("-");
  const [whole, fraction] = fixed.replace(/^-/, "").split(".");
  const decimal = money ? fraction : fraction.replace(/0+$/, "");
  const formatted = `${negative && /[1-9]/.test(fixed) ? "-" : ""}${integer.format(BigInt(whole))}${decimal ? `,${decimal}` : ""}`;
  return unit === "BRL"
    ? `R$ ${formatted}`
    : unit === "%"
      ? `${formatted}%`
      : `${formatted} ${unitText(unit)}`;
}
const day = (value: string) => value.split("-").reverse().join("/");
const period = (value: string) =>
  value === "total" ? "Total do período" : day(value);

function salesResult(result: SalesResult, source: SalesSource): string[] {
  const label =
    sourceCatalog[source].measureLabels[result.query.metric] ?? "Vendas";
  const lines = [
    `${day(result.query.startDate)} a ${day(result.query.endDate)} · ${
      result.productSelection
        ? "produtos da seleção semântica"
        : (result.query.productSearch ?? "todos os produtos")
    }`,
  ];
  if (result.productSelection) lines.push(result.productSelection.description);
  if (!result.totals.length)
    lines.push("Não encontrei vendas para os filtros e o período informados.");
  for (const total of result.totals)
    lines.push(
      `${label}: *${amount(total.value, total.unit)}*${
        total.previousValue === null
          ? ""
          : ` (período comparado: ${amount(total.previousValue, total.unit)} · ${
              total.changePercent === null
                ? "variação sem base"
                : `variação ${amount(total.changePercent, "%")}`
            })`
      }`,
    );
  const detailed = result.rows.filter(
    (row) => !(row.period === "total" && row.product === null),
  );
  if (detailed.length) {
    for (const row of detailed.slice(0, maxRows))
      lines.push(
        `• ${[period(row.period), row.product].filter(Boolean).join(" — ")}: ${amount(row.value, row.unit)}`,
      );
    if (detailed.length > maxRows)
      lines.push(
        `… e mais ${detailed.length - maxRows} linhas. Veja a tabela completa no IA-MNS.`,
      );
  }
  if (result.comparison)
    lines.push(
      `Período comparado: ${day(result.comparison.startDate)} a ${day(result.comparison.endDate)}.`,
    );
  for (const warning of result.warnings) lines.push(`_${warning}_`);
  return lines;
}

function salesAnswer(answer: SalesAnswer): string[] {
  const lines: string[] = [];
  for (const section of answer.sections) {
    lines.push("", `*Fonte: ${sourceCatalog[section.source].label}*`);
    if (section.result)
      lines.push(...salesResult(section.result, section.source));
    else
      lines.push(
        unavailableText[section.reason ?? "provider_unavailable"] ??
          unavailableText.provider_unavailable,
      );
  }
  if (answer.sections.length > 1)
    lines.push(
      "",
      "_As fontes são apresentadas separadamente; os valores não são somados._",
    );
  return lines;
}

function productAnswer(answer: ProductAnswer): string[] {
  const lines = ["", `*Fonte: ${productSourceLabel[answer.source]}*`];
  for (const criterion of answer.criteria) {
    lines.push(
      `${criterion.mode === "exclude" ? "Excluir " : ""}${criterion.title}${
        criterion.values.length ? `: ${criterion.values.join("; ")}` : ""
      }${criterion.excluded.length ? ` (exceto ${criterion.excluded.join("; ")})` : ""}`,
    );
  }
  for (const section of answer.sections)
    lines.push(`• ${section.label}: ${integer.format(section.count)}`);
  for (const note of answer.notes) lines.push(`_${note}_`);
  if (answer.products.length) {
    const shown = answer.products.slice(0, maxProducts);
    lines.push(
      shown.length < answer.total
        ? `Primeiros ${integer.format(shown.length)} de ${integer.format(answer.total)} produtos:`
        : `${integer.format(answer.total)} ${answer.total === 1 ? "produto" : "produtos"}:`,
    );
    for (const product of shown)
      lines.push(`• ${product.code} — ${product.description}`);
    if (shown.length < answer.total)
      lines.push("Veja a lista completa no IA-MNS.");
  } else if (answer.total === 0) lines.push("Nenhum produto encontrado.");
  return lines;
}

function productOptions(options: ProductOptions): string[] {
  return [
    "",
    `Opções de ${options.title} para “${options.text}”:`,
    ...options.options.map((option) => `${option.number}. ${option.label}`),
    "Responda com o número ou o nome da opção.",
  ];
}

function resultLines(
  result: NonNullable<TurnView["reply"]>["result"],
): string[] {
  if (!result) return [];
  if ("kind" in result) {
    if (result.kind === "sales_analysis")
      return result.panels.flatMap(salesAnswer);
    if (result.kind === "products") return productAnswer(result);
    return productOptions(result);
  }
  return salesAnswer(result);
}

/**
 * The WhatsApp text of a finished turn: the agent's prose, then its result
 * (as the web would show it) adapted to plain text, bullets and WhatsApp's
 * bold (asterisks) and italic (underscores) markers. Long tables are bounded
 * with a pointer to the web.
 */
export function turnText(turn: TurnView): string {
  if (turn.state !== "completed" || !turn.reply)
    return (
      failureText[turn.failureCode ?? "INTERNAL_ERROR"] ??
      failureText.INTERNAL_ERROR
    );
  const reply = turn.reply;
  const lines = [reply.message.trim()];
  if (reply.displayResult !== false) lines.push(...resultLines(reply.result));
  if (reply.suggestions.length)
    lines.push(
      "",
      "Você pode perguntar, por exemplo:",
      ...reply.suggestions.map((item) => `• ${item}`),
    );
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits a text into WhatsApp messages at paragraph, line or word
 * boundaries. Beyond `maxParts` the rest is replaced by a pointer to the web,
 * where the complete answer remains in the same conversation.
 */
export function splitText(value: string): string[] {
  const parts: string[] = [];
  let rest = value.trim();
  while (rest.length > partLimit) {
    const window = rest.slice(0, partLimit);
    const cut = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    );
    const at = cut > partLimit / 2 ? cut : partLimit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  if (parts.length > maxParts)
    return [
      ...parts.slice(0, maxParts - 1),
      `${parts[maxParts - 1]}\n\n_A resposta continua no IA-MNS, na mesma conversa._`,
    ];
  return parts.length ? parts : ["Não consegui montar uma resposta."];
}
