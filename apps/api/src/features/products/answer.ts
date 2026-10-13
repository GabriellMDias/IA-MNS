import type { CatalogDimension, SemanticCatalog } from "./catalog.js";
import type { ProductAnswer } from "./contracts.js";
import {
  pathText,
  type ProductPage,
  type ProductSelection,
  type ResolvedCriterion,
} from "./selection.js";

/** Every public text of product lookup is authored here, never by the model. */
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
export const count = (value: number) => integer.format(value);
const quoted = (text: string) => `“${text}”`;

export type UnsupportedReason =
  "source" | "sales_or_metrics" | "action" | "other_data";

export function unsupportedMessage(
  catalog: SemanticCatalog,
  reason: UnsupportedReason,
): string {
  switch (reason) {
    case "source":
      return `A consulta de produtos usa o cadastro do ${catalog.source.title}. Selecione “${catalog.source.title}” ou “Tudo” na fonte para consultar produtos.`;
    case "sales_or_metrics":
      return "A consulta de produtos identifica quais produtos atendem aos critérios do cadastro; ela não calcula vendas, preços, estoque ou margens.";
    case "action":
      return "Não altero cadastros: apenas consulto quais produtos atendem aos critérios.";
    case "other_data":
      return "Por enquanto consulto apenas o cadastro de produtos.";
  }
}

export function unavailableMessage(
  dimensions: readonly CatalogDimension[],
): string {
  const parts = dimensions.map((dimension) =>
    dimension.exposure === "requires_grant"
      ? `${dimension.title} (o IA-MNS ainda não tem acesso a esse dado do ERP)`
      : `${dimension.title} (o significado desse dado no ERP ainda precisa ser confirmado)`,
  );
  return `Ainda não consigo filtrar produtos por ${parts.join(" nem por ")}. Use os critérios disponíveis para o cadastro selecionado.`;
}

export const clarificationMessages = {
  products:
    "Quais produtos você quer identificar? Você pode citar uma categoria (por exemplo “banana fruta”), um centro de custo, um comprador, uma palavra da descrição ou se o produto é pesável.",
  context:
    "A qual consulta de produtos você se refere? Diga quais produtos quer identificar.",
  choice: (options: number) =>
    `Escolha uma opção de 1 a ${options}, ou escreva o nome da opção.`,
  repeat: "Não entendi qual opção você quer. Escolha uma das opções abaixo.",
  noCategory: (text: string) =>
    `Não encontrei classificações nem descrições de produtos com ${quoted(text)}. Pode descrever o produto de outra forma?`,
  noMatchingCategory: (text: string, qualifier: string | null) =>
    `Não encontrei uma classificação que corresponda a ${quoted(text)}${qualifier ? ` (${qualifier})` : ""}. Pode descrever de outra forma?`,
  ambiguousCategory: (text: string) =>
    `${quoted(text)} pode significar produtos diferentes no cadastro. Qual destas opções você quer?`,
  noName: (title: string) => `Qual ${title} você quer considerar?`,
  noRecord: (title: string, text: string, options: number) =>
    `Não encontrei ${title} com ${quoted(text)}.${options > 0 ? " Escolha uma das opções abaixo ou escreva o nome de outra forma." : " Pode escrever o nome de outra forma?"}`,
  ambiguousRecord: (title: string, text: string, options: number) =>
    `Encontrei ${options} registros de ${title} com ${quoted(text)}. Qual deles você quer?`,
  contradiction: (title: string) =>
    `Os critérios se contradizem: o mesmo ${title} foi pedido para ser incluído e excluído. Qual deles você quer manter?`,
  shortText:
    "Qual texto deve aparecer na descrição dos produtos? Use pelo menos duas letras.",
};

/** Words of the person describing each criterion; never ERP record names. */
export function describeRequest(
  catalog: SemanticCatalog,
  selection: ProductSelection,
): string {
  return selection.criteria
    .map((criterion) => {
      const title = titleOf(catalog, criterion.dimension);
      const value =
        criterion.kind === "hierarchy" && criterion.qualifier
          ? `${quoted(criterion.text)} (${criterion.qualifier})`
          : criterion.kind === "flag" || criterion.kind === "status"
            ? ""
            : quoted(criterion.text);
      return `${criterion.mode === "exclude" ? "exceto " : ""}${title}${value ? ` ${value}` : ""}`;
    })
    .join("; ");
}

function titleOf(catalog: SemanticCatalog, id: string): string {
  return catalog.dimensions.find((item) => item.id === id)?.title ?? id;
}

function criterionValues(criterion: ResolvedCriterion): {
  values: string[];
  excluded: string[];
} {
  switch (criterion.kind) {
    case "hierarchy":
      return {
        values: [
          ...criterion.include.map((choice) =>
            choice.scope === "subtree"
              ? pathText(choice.node.path)
              : `${pathText(choice.node.path)} (somente descrições com ${quoted(criterion.text)})`,
          ),
          ...(criterion.anywhere
            ? [`Qualquer produto com ${quoted(criterion.text)} na descrição`]
            : []),
        ],
        excluded: criterion.exclude.map((node) => pathText(node.path)),
      };
    case "entity":
      return {
        values: criterion.matched.map(
          (record) =>
            `${record.label}${record.active === false ? " (inativo)" : ""}`,
        ),
        excluded: [],
      };
    case "text":
      return {
        values: [`Descrição contém ${quoted(criterion.text)}`],
        excluded: [],
      };
    case "flag":
    case "status":
      return { values: [], excluded: [] };
  }
}

export function buildAnswer(
  catalog: SemanticCatalog,
  selection: ProductSelection,
  page: ProductPage,
): ProductAnswer {
  const dimensions = new Map(catalog.dimensions.map((item) => [item.id, item]));
  const conventions = new Map(
    catalog.conventions.map((item) => [item.id, item]),
  );
  const notes: string[] = [];
  if (catalog.source.id === "sankhya")
    notes.push(
      "Consulta ao cadastro físico de produtos, que também contém serviços e tarifas. Os filtros da entidade Produto do Sankhya não são aplicados; situação e uso só filtram quando pedidos.",
    );
  const status = catalog.dimensions.find((item) => item.kind === "status");
  if (status && status.exposure !== "enabled")
    notes.push(
      "A lista inclui produtos ativos e inativos: o IA-MNS ainda não lê a situação dos produtos em cada loja.",
    );
  const inactive = conventions.get("inactive_classification");
  if (inactive) {
    const pattern = new RegExp(inactive.pattern, "u");
    const sections = page.sections.filter((section) =>
      pattern.test(plain(section.label)),
    );
    const total = sections.reduce((sum, section) => sum + section.count, 0);
    if (total > 0)
      notes.push(
        `${count(total)} ${total === 1 ? "produto está" : "produtos estão"} em seções de ${inactive.label} (${sections.map((section) => section.label).join(", ")}), uma convenção do cadastro que não equivale à situação nas lojas.`,
      );
  }
  for (const criterion of selection.criteria) {
    if (criterion.kind === "hierarchy" && criterion.mode === "include") {
      const raw = criterion.include.filter((choice) =>
        choice.node.conventions.includes("raw_material"),
      );
      if (raw.length > 0)
        notes.push(
          `Inclui itens de matéria-prima: ${raw.map((choice) => pathText(choice.node.path)).join("; ")}.`,
        );
    }
    if (criterion.kind === "entity")
      for (const record of criterion.matched)
        if (record.active === false)
          notes.push(
            `O registro ${quoted(record.label)} de ${titleOf(catalog, criterion.dimension)} está inativo no cadastro.`,
          );
  }
  return {
    kind: "products",
    source: catalog.source.id === "sankhya" ? "sankhya" : "vrmaster",
    catalogVersion: catalog.version,
    total: page.total,
    products: page.products.map((product) => ({
      code: product.code,
      description: product.description.slice(0, 200),
      classification: product.classification.slice(0, 600),
    })),
    criteria: selection.criteria.map((criterion) => {
      const dimension = dimensions.get(criterion.dimension)!;
      const { values, excluded } = criterionValues(criterion);
      return {
        dimension: criterion.dimension,
        title: dimension.title,
        mode: criterion.mode,
        text: criterion.text,
        values: values.slice(0, 61).map((value) => value.slice(0, 600)),
        excluded: excluded.slice(0, 60).map((value) => value.slice(0, 600)),
        interpretation: dimension.interpretation,
      };
    }),
    sections: page.sections.slice(0, 25).map((section) => ({
      label: (section.label || "—").slice(0, 80),
      count: section.count,
    })),
    notes: notes.slice(0, 8).map((note) => note.slice(0, 600)),
  };
}

export function answerMessage(
  catalog: SemanticCatalog,
  selection: ProductSelection,
  answer: ProductAnswer,
): string {
  const criteria = describeRequest(catalog, selection);
  if (answer.total === 0)
    return `Não encontrei produtos no cadastro do ${catalog.source.title} para: ${criteria}.`;
  const found = `Encontrei ${count(answer.total)} ${answer.total === 1 ? "produto" : "produtos"} no cadastro do ${catalog.source.title} para: ${criteria}.`;
  return answer.products.length < answer.total
    ? `${found} Mostro os primeiros ${count(answer.products.length)}, em ordem alfabética.`
    : found;
}

/** Follow-ups the capability can answer, built from unused enabled dimensions. */
export function answerSuggestions(
  catalog: SemanticCatalog,
  selection: ProductSelection,
): string[] {
  const used = new Set(selection.criteria.map((item) => item.dimension));
  const suggestions: string[] = [];
  const weighable = catalog.dimensions.find(
    (item) => item.kind === "flag" && item.exposure === "enabled",
  );
  if (weighable && !used.has(weighable.id))
    suggestions.push(`Quais desses são ${plural(weighable.title)}?`);
  const category = selection.criteria.find(
    (item) => item.kind === "hierarchy" && !item.anywhere,
  );
  if (category)
    suggestions.push(
      `Mostre todos os produtos com “${category.text}” na descrição`,
    );
  return suggestions.slice(0, 3);
}

/** Portuguese plural of a one-word adjective ("pesável" → "pesáveis"). */
function plural(word: string): string {
  if (word.endsWith("l")) return `${word.slice(0, -1)}is`;
  return word.endsWith("s") ? word : `${word}s`;
}

function plain(label: string): string {
  return label.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}
