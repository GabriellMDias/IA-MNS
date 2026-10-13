import { createHash } from "node:crypto";
import {
  loadCatalog,
  type CatalogEntity,
  type CatalogRelationship,
  type CatalogDimension,
} from "../catalog.js";
import { sankhyaMetadata } from "./snapshot.js";

function entity(
  id: string,
  table: string,
  key: string[],
  label: string | null,
  columns: string[],
  meaning: string,
  personalData = false,
): CatalogEntity {
  const metadata = sankhyaMetadata.tables.find((item) => item.name === table)!;
  return {
    id,
    table: { schema: "erp", name: table.toLowerCase() },
    key,
    label,
    meaning,
    personalData,
    access: "granted",
    status: null,
    columns: [...new Set([...key, ...(label ? [label] : []), ...columns])].map(
      (name) => {
        const column = metadata.columns.find(
          (item) => item.name === name.toUpperCase(),
        );
        if (!column) throw new Error("Missing reviewed Sankhya column");
        return { name, type: column.type, nullable: column.nullable };
      },
    ),
  };
}

function link(
  id: string,
  from: string,
  to: string,
  origin: number,
  target: number,
  constraint: string,
  cardinality: CatalogRelationship["cardinality"],
  meaning: string,
  findings: string[],
): CatalogRelationship {
  const mapping = sankhyaMetadata.links.find(
    (item) => item.origin === origin && item.target === target,
  );
  const copyAnnotation =
    ["product_alternate_units", "product_partner_links"].includes(id) &&
    mapping?.expressionSignature ===
      createHash("sha256")
        .update("@ref-param[include-in-deep-copy=true]")
        .digest("hex");
  if (
    !mapping ||
    mapping.join.length === 0 ||
    (mapping.expressionSignature && !copyAnnotation) ||
    mapping.conditionSignature ||
    mapping.targetExpressionSignature ||
    mapping.targetKeyScript
  )
    throw new Error("Sankhya mapping requires separate semantic review");
  return {
    id,
    from,
    to,
    join: mapping.join.map((pair) => ({
      from: pair.from.toLowerCase(),
      to: pair.to.toLowerCase(),
    })),
    where: [],
    cardinality,
    optional: true,
    meaning,
    dictionary: { origin, target },
    evidence: {
      declared: { constraint },
      validated: { on: "2026-10-11", findings },
      usage: [
        `TDDLIG ${origin}:${target} reconciled with TDDLGC; physical table semantics, not inherited JAPE instance filters.`,
      ],
    },
    status: "verified",
    confidence: "high",
  };
}

const entities = [
  entity(
    "product",
    "TGFPRO",
    ["codprod"],
    "descrprod",
    [
      "codgrupoprod",
      "codmarca",
      "codvol",
      "codvolcompra",
      "usoprod",
      "ativo",
      "caracteristicas",
      "ad_ca",
      "refforn",
      "codparcforn",
      "codcencus",
    ],
    "Physical product registration, including services and tariffs; no JAPE Produto instance filter is applied.",
  ),
  entity(
    "group",
    "TGFGRU",
    ["codgrupoprod"],
    "descrgrupoprod",
    ["codgrupai", "grau", "ativo", "codcencus", "ad_codlistadc"],
    "Product classification tree through explicit parent ids, not numeric code arithmetic.",
  ),
  entity(
    "brand",
    "TGFMAR",
    ["codigo"],
    "descricao",
    [],
    "Registered brand selected by CODMARCA, distinct from the free-text MARCA column.",
  ),
  entity(
    "unit",
    "TGFVOL",
    ["codvol"],
    "descrvol",
    [],
    "Registered unit of measure; its primary key is a string.",
  ),
  entity(
    "alternate_unit",
    "TGFVOA",
    ["codprod", "codvol", "controle"],
    null,
    ["ativo"],
    "Alternative unit registrations per product, unit and control. No quantity conversion is calculated.",
  ),
  entity(
    "classification_link",
    "TGFCLP",
    ["codprod", "codclassif"],
    null,
    [],
    "Optional many-valued product classifications; empty at discovery.",
  ),
  entity(
    "classification",
    "TGFCLA",
    ["codclassif"],
    "descricao",
    [],
    "Classification labels; empty at discovery.",
  ),
  entity(
    "partner_link",
    "TGFPAP",
    ["codparc", "codprod", "sequencia"],
    null,
    [],
    "Product to partner registrations; multiple sequences may exist for the same pair.",
  ),
  entity(
    "partner",
    "TGFPAR",
    ["codparc"],
    "nomeparc",
    ["fornecedor"],
    "Partner records; values may identify natural persons and are never sent to the model.",
    true,
  ),
  entity(
    "cost_center",
    "TSICUS",
    ["codcencus"],
    "descrcencus",
    ["ativo"],
    "Cost/result center; no meaningful assignment on product or group was established.",
  ),
  entity(
    "packaging_list",
    "AD_LISTADCEMB",
    ["codlista"],
    "descrlista",
    [],
    "Custom additional-packaging list assigned to the product group. No prices or discounts are read.",
  ),
];
const relationships = [
  link(
    "product_group",
    "product",
    "group",
    27,
    30,
    "FK_TGFPRO_TGFGRU",
    "many_to_one",
    "Product's registered group.",
    ["All 10,959 products reference an existing unique group."],
  ),
  link(
    "product_brand",
    "product",
    "brand",
    27,
    2002,
    "FK_TGFPRO_CODMARCA",
    "many_to_one",
    "Registered brand, when assigned.",
    [
      "Every non-null CODMARCA references a unique registered brand; 100 brand ids are used.",
    ],
  ),
  link(
    "product_unit",
    "product",
    "unit",
    27,
    19,
    "FK_TGFPRO_TGFVOL",
    "many_to_one",
    "Product's base unit.",
    ["Every product references an existing unit; unit keys are VARCHAR2(2)."],
  ),
  link(
    "product_purchase_unit",
    "product",
    "unit",
    27,
    39,
    "FK_TGFPRO_CODVOLCOMPRA_TGFVOL",
    "many_to_one",
    "Purchase unit, independently from base unit.",
    ["Physical FK is enabled and validated; the purchase unit can be absent."],
  ),
  link(
    "product_alternate_units",
    "product",
    "alternate_unit",
    27,
    244,
    "FK_TGFVOA_TGFPRO",
    "one_to_many",
    "Product's alternative unit registrations, regardless of their status.",
    [
      "18,185 registrations cover 4,909 products; multiple rows must never duplicate products.",
    ],
  ),
  link(
    "alternate_unit_unit",
    "alternate_unit",
    "unit",
    244,
    19,
    "FK_TGFVOA_TGFVOL",
    "many_to_one",
    "Unit of an alternative-unit registration.",
    [
      "Enabled validated FK and unique unit key. No control value is discarded when correlating a complete registration.",
    ],
  ),
  link(
    "product_classifications",
    "product",
    "classification_link",
    27,
    863,
    "FK_TGFCLP_TGFPRO",
    "one_to_many",
    "Product classification registrations.",
    [
      "Enabled validated FK; no rows exist at discovery, so business behavior remains unvalidated.",
    ],
  ),
  link(
    "classification_label",
    "classification_link",
    "classification",
    863,
    862,
    "FK_TGFCLP_TGFCLA",
    "many_to_one",
    "Label of a classification registration.",
    ["Physical FK and dictionary mappings agree; both tables are empty."],
  ),
  link(
    "product_partner_links",
    "product",
    "partner_link",
    27,
    619,
    "FK_TGFPAP_CODPROD_TGFPRO",
    "one_to_many",
    "Partners associated with a product.",
    [
      "8,956 rows cover 3,746 products; multiple sequences are preserved by EXISTS.",
    ],
  ),
  link(
    "linked_partner",
    "partner_link",
    "partner",
    619,
    2,
    "FK_TGFPAP_CODPARC_TGFPAR",
    "many_to_one",
    "The associated partner; supplier role is checked separately.",
    ["All 8,956 linked registrations point to a partner marked FORNECEDOR=S."],
  ),
  link(
    "group_packaging_list",
    "group",
    "packaging_list",
    30,
    9999990133,
    "AD_FK_9AB4616935D2840363BF2",
    "many_to_one",
    "Additional-packaging list of the immediate product group, without inheritance.",
    [
      "300 groups assign one of seven nonzero lists; this is a custom two-hop product filter.",
    ],
  ),
];
// A physical partner relationship alone does not establish supplier semantics.
relationships.find((item) => item.id === "linked_partner")!.where = [
  { column: "fornecedor", equals: "S" },
];

function dimension(
  id: string,
  kind: CatalogDimension["kind"],
  title: string,
  description: string,
  path: string[],
  valueEntity: string | null,
  columns: string[],
  synonyms: string[],
  interpretation: string,
  extra: Partial<CatalogDimension> = {},
): CatalogDimension {
  return {
    id,
    kind,
    title,
    description,
    path,
    entity: valueEntity,
    columns,
    synonyms,
    interpretation,
    hierarchy: null,
    exposure: "enabled",
    blocker: null,
    ...extra,
  };
}
const usage = sankhyaMetadata.tables
  .find((item) => item.name === "TGFPRO")!
  .options.filter((item) => item.field === "USOPROD")
  .map((item) => ({ value: item.value, label: item.label }));

export const sankhyaCatalog = loadCatalog({
  id: "sankhya_products",
  version: "sankhya-products/2026-10-11.1",
  source: { id: "sankhya", engine: "oracle", title: "MNS (Sankhya)" },
  discovery: {
    verifiedOn: "2026-10-11",
    method:
      "Read-only Oracle dictionary, native keys/indexes, bounded data checks, reviewed JAPE mapping differences and independent SELECT reconciliation.",
  },
  root: "product",
  entities,
  relationships,
  hierarchies: [
    {
      id: "product_groups",
      entity: "group",
      levelColumn: "grau",
      codeColumns: ["codgrupoprod"],
      parentColumn: "codgrupai",
      meaning:
        "Explicit group parent tree; depth is bounded to eight and checked without assuming code prefixes.",
    },
  ],
  dimensions: [
    dimension(
      "category",
      "hierarchy",
      "grupo de produtos",
      "Tipo ou categoria de produto na árvore de grupos; inclui todos os subgrupos. Marcas possuem dimensão própria.",
      ["product_group"],
      "group",
      ["descrgrupoprod"],
      ["categoria", "classificação", "grupo", "subgrupo", "tipo de produto"],
      "Grupo cadastrado no produto e todos os seus descendentes, conforme a relação explícita entre grupos.",
      { hierarchy: "product_groups" },
    ),
    dimension(
      "brand",
      "entity",
      "marca cadastrada",
      "Marca do cadastro de marcas selecionada no produto. Não equivale ao texto livre de marca.",
      ["product_brand"],
      "brand",
      ["descricao"],
      ["marca"],
      "Marca registrada vinculada ao produto; o campo de texto livre não substitui esse vínculo.",
    ),
    dimension(
      "unit",
      "entity",
      "unidade base",
      "Unidade de medida principal do cadastro do produto (como KG, quilo ou unidade).",
      ["product_unit"],
      "unit",
      ["codvol", "descrvol"],
      ["unidade", "unidade de medida"],
      "Unidade principal do produto; não converte quantidades nem indica pesagem.",
    ),
    dimension(
      "purchase_unit",
      "entity",
      "unidade de compra",
      "Unidade de compra cadastrada no produto, que pode diferir da unidade principal.",
      ["product_purchase_unit"],
      "unit",
      ["codvol", "descrvol"],
      ["embalagem de compra", "unidade de compra"],
      "Unidade de compra indicada no cadastro atual.",
    ),
    dimension(
      "alternate_unit",
      "entity",
      "unidade alternativa",
      "Produtos que possuem cadastro na unidade alternativa informada, incluindo cadastros ativos e inativos.",
      ["product_alternate_units", "alternate_unit_unit"],
      "unit",
      ["codvol", "descrvol"],
      ["embalagem alternativa", "unidade alternativa"],
      "Existe ao menos um cadastro da unidade alternativa, independentemente do controle e da situação; cada produto aparece uma vez.",
    ),
    dimension(
      "supplier",
      "entity",
      "fornecedor vinculado",
      "Fornecedor associado ao produto no cadastro de relacionamento com parceiros. Não é o fornecedor preferencial nem histórico de compras.",
      ["product_partner_links", "linked_partner"],
      "partner",
      ["nomeparc"],
      ["fornecedor", "fornecedores"],
      "Parceiro fornecedor do cadastro de relacionamento produto-parceiro; não representa compra realizada nem fornecedor preferencial.",
    ),
    dimension(
      "usage",
      "entity",
      "uso do produto",
      "Uso cadastral: revenda, consumo, matéria prima, embalagem ou outros valores oficialmente descritos no dicionário.",
      [],
      "product",
      ["usoprod"],
      [
        "usado como",
        "uso",
        "revenda",
        "matéria prima",
        "consumo",
        "fabricação própria",
      ],
      "Valor literal do uso do produto; valores sem descrição no dicionário não são inferidos.",
      { domain: usage },
    ),
    dimension(
      "active",
      "flag",
      "ativo",
      "Indicador de produto ativo no cadastro, sem situação por empresa ou loja.",
      [],
      null,
      ["ativo"],
      ["ativos", "inativo", "inativos"],
      "Indicador de ativo do cadastro do produto, sem interpretar disponibilidade de estoque.",
      { trueValue: "S" },
    ),
    dimension(
      "description",
      "text",
      "descrição",
      "Frase literal na descrição do produto.",
      [],
      null,
      ["descrprod"],
      ["descrição", "nome do produto", "contém"],
      "Frase da descrição, como palavras inteiras, sem distinguir acentos e maiúsculas.",
    ),
    dimension(
      "characteristics",
      "text",
      "características",
      "Texto literal no campo de características do produto; não equivale à descrição.",
      [],
      null,
      ["caracteristicas"],
      ["característica", "características"],
      "Texto literal nas características registradas; conteúdo ausente permanece ausente.",
    ),
    dimension(
      "epi_certificate",
      "text",
      "certificado EPI",
      "Texto ou número literal do certificado de aprovação de EPI no campo adicional do produto.",
      [],
      null,
      ["ad_ca"],
      ["CA", "CA EPI", "certificado EPI", "certificado de aprovação"],
      "Valor literal do campo adicional de CA E.P.I.; não certifica validade legal ou vigência.",
    ),
    dimension(
      "packaging_list",
      "entity",
      "lista de embalagem adicional",
      "Lista adicional de embalagem atribuída ao grupo imediato do produto. Não herda dos grupos superiores.",
      ["product_group", "group_packaging_list"],
      "packaging_list",
      ["descrlista"],
      ["lista de embalagem", "embalagem adicional"],
      "Lista adicional cadastrada diretamente no grupo do produto; não calcula preços nem descontos.",
    ),
    dimension(
      "classification",
      "entity",
      "classificação adicional",
      "Classificação adicional de produtos, distinta da árvore de grupos.",
      ["product_classifications", "classification_label"],
      "classification",
      ["descricao"],
      ["classificação adicional"],
      "Classificações associadas ao produto.",
      {
        exposure: "pending_validation",
        blocker:
          "The classification tables are empty; no nonempty business scenario can be validated.",
      },
    ),
    dimension(
      "buyer",
      "text",
      "comprador",
      "Comprador responsável pelo produto, quando esse vínculo estiver validado.",
      [],
      null,
      ["descrprod"],
      ["comprador", "compradora"],
      "Comprador responsável pelo cadastro.",
      {
        exposure: "pending_validation",
        blocker:
          "No product-to-buyer mapping was found; the custom last-editing user is not a buyer.",
      },
    ),
  ],
  conventions: [],
});
