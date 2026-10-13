import { loadCatalog, type SemanticCatalog } from "../catalog.js";

const integer = (name: string, nullable = false) => ({
  name,
  type: "integer",
  nullable,
});
const varchar = (name: string, length: number, nullable = false) => ({
  name,
  type: `character varying(${length})`,
  nullable,
});
const productCodes = [1, 2, 3, 4, 5].map((level) => `mercadologico${level}`);
const sameColumns = (columns: readonly string[]) =>
  columns.map((column) => ({ from: column, to: column }));
const productUsage = [
  "VRMaster sales reference SQL (PH-18): level-1 mercadológico and its cost center for every sale.",
];

/**
 * VRMaster product semantics, discovered read-only on 2026-10-11 from the
 * PostgreSQL catalogs, the data and existing application queries (see
 * docs/domains/product-resolver.md). Edit only after the sync check
 * (`pnpm -C apps/api products:catalog`) and a review; never expose a
 * relationship or dimension that has not been validated.
 */
export const vrmasterCatalog: SemanticCatalog = loadCatalog({
  id: "vrmaster_products",
  version: "vrmaster-products/2026-10-11.2",
  source: {
    id: "vrmaster",
    engine: "postgresql",
    title: "Pilar da Terra (VR Master)",
  },
  discovery: {
    verifiedOn: "2026-10-11",
    method:
      "Read-only transactions: pg_catalog constraints, indexes and privileges; bounded aggregate checks of the data; comparison with the sales reference SQL and PDT Connect queries.",
  },
  root: "product",
  entities: [
    {
      id: "product",
      table: { schema: "public", name: "produto" },
      key: ["id"],
      label: "descricaocompleta",
      meaning:
        "Product registration shared by every store. One row per product; per-store status, prices and stock live in produtocomplemento.",
      columns: [
        integer("id"),
        varchar("descricaocompleta", 60),
        ...productCodes.map((name) => integer(name)),
        integer("id_comprador"),
        integer("id_fornecedorfabricante"),
        integer("id_tipoembalagem"),
        integer("id_familiaproduto", true),
        integer("id_marca", true),
        integer("id_tipomercadoria", true),
        { name: "pesavel", type: "boolean", nullable: false },
      ],
      access: "granted",
      status: null,
      personalData: false,
    },
    {
      id: "classification_node",
      table: { schema: "public", name: "mercadologico" },
      key: ["id"],
      label: "descricao",
      meaning:
        "Mercadológico: the five-level product classification. A node of level n has its first n codes set and the remaining codes 0; the code tuple is unique.",
      columns: [
        integer("id"),
        ...productCodes.map((name) => integer(name)),
        integer("nivel"),
        varchar("descricao", 35),
        integer("id_centrocusto", true),
      ],
      access: "granted",
      status: null,
      personalData: false,
    },
    {
      id: "cost_center",
      table: { schema: "public", name: "centrocusto" },
      key: ["id"],
      label: "descricao",
      meaning:
        "Cost center tree of three levels (centrocusto1..3 with nivel). Level-1 mercadológico nodes reference level-3 cost centers.",
      columns: [
        integer("id"),
        integer("centrocusto1"),
        integer("centrocusto2"),
        integer("centrocusto3"),
        integer("nivel"),
        varchar("descricao", 40, true),
        integer("id_situacaocadastro"),
      ],
      access: "granted",
      status: {
        column: "id_situacaocadastro",
        active: 1,
        meaning: "situacaocadastro: 1 ATIVO, 0 EXCLUIDO.",
      },
      personalData: false,
    },
    {
      id: "buyer",
      table: { schema: "public", name: "comprador" },
      key: ["id"],
      label: "nome",
      meaning:
        "Buyer (comprador): the person responsible for purchasing a product. Names are personal data.",
      columns: [
        integer("id"),
        varchar("nome", 40),
        integer("id_situacaocadastro"),
      ],
      access: "granted",
      status: {
        column: "id_situacaocadastro",
        active: 1,
        meaning: "situacaocadastro: 1 ATIVO, 0 EXCLUIDO.",
      },
      personalData: true,
    },
    {
      id: "supplier_company",
      table: { schema: "public", name: "fornecedor" },
      key: ["id"],
      label: "nomefantasia",
      meaning:
        "Business partner registration (suppliers, distributors and the stores' own companies).",
      columns: [
        integer("id"),
        varchar("razaosocial", 40),
        varchar("nomefantasia", 60),
        integer("id_situacaocadastro"),
      ],
      access: "granted",
      status: {
        column: "id_situacaocadastro",
        active: 1,
        meaning: "situacaocadastro: 1 ATIVO, 0 EXCLUIDO.",
      },
      personalData: false,
    },
    {
      id: "sale",
      table: { schema: "public", name: "venda" },
      key: ["id"],
      label: null,
      meaning:
        "Sales rows (partitioned by month). Documented here only for the sale-time buyer; product identification never reads sales.",
      columns: [integer("id"), integer("id_produto"), integer("id_comprador")],
      access: "granted",
      status: null,
      personalData: false,
    },
    {
      id: "packaging_type",
      table: { schema: "public", name: "tipoembalagem" },
      key: ["id"],
      label: "descricaocompleta",
      meaning: "Packaging/sales unit type (UN, KG, CX...).",
      columns: [
        integer("id"),
        { name: "descricao", type: "character(2)", nullable: false },
        varchar("descricaocompleta", 20),
      ],
      access: "granted",
      status: null,
      personalData: false,
    },
    {
      id: "product_family",
      table: { schema: "public", name: "familiaproduto" },
      key: ["id"],
      label: "descricao",
      meaning:
        "Product family: products the ERP manages together (flavors or sizes of one item) for prices and offers.",
      columns: [
        integer("id"),
        varchar("descricao", 40),
        integer("id_situacaocadastro"),
      ],
      access: "granted",
      status: {
        column: "id_situacaocadastro",
        active: 1,
        meaning: "situacaocadastro: 1 ATIVO, 0 EXCLUIDO.",
      },
      personalData: false,
    },
    {
      id: "barcode",
      table: { schema: "public", name: "produtoautomacao" },
      key: ["id"],
      label: null,
      meaning: "Barcodes (EAN/DUN) of a product; one product has one or more.",
      columns: [
        integer("id"),
        integer("id_produto"),
        { name: "codigobarras", type: "numeric(14,0)", nullable: false },
      ],
      access: "not_granted",
      status: null,
      personalData: false,
    },
    {
      id: "store_registration",
      table: { schema: "public", name: "produtocomplemento" },
      key: ["id"],
      label: null,
      meaning:
        "Per-store product registration: one row per product and store with its status, prices, costs and stock. Only status columns are relevant to identification.",
      columns: [
        integer("id"),
        integer("id_produto"),
        integer("id_loja"),
        integer("id_situacaocadastro"),
        { name: "descontinuado", type: "boolean", nullable: false },
      ],
      access: "granted",
      status: {
        column: "id_situacaocadastro",
        active: 1,
        meaning: "situacaocadastro: 1 ATIVO, 0 EXCLUIDO, per store.",
      },
      personalData: false,
    },
    {
      id: "supplier_link",
      table: { schema: "public", name: "produtofornecedor" },
      key: ["id"],
      label: null,
      meaning:
        "Purchasing link between a product and a supplier (supplier code, packaging, cost).",
      columns: [
        integer("id"),
        integer("id_produto"),
        integer("id_fornecedor"),
        varchar("codigoexterno", 60),
      ],
      access: "not_granted",
      status: null,
      personalData: false,
    },
    {
      id: "brand",
      table: { schema: "public", name: "marca" },
      key: ["id"],
      label: "descricao",
      meaning: "Brand registration.",
      columns: [
        integer("id"),
        varchar("descricao", 80, true),
        integer("id_situacaocadastro"),
      ],
      access: "not_granted",
      status: null,
      personalData: false,
    },
    {
      id: "merchandise_type",
      table: { schema: "public", name: "tipomercadoria" },
      key: ["id"],
      label: "descricao",
      meaning: "Fiscal nature of the merchandise for PIS/COFINS.",
      columns: [integer("id"), varchar("descricao", 999)],
      access: "not_granted",
      status: null,
      personalData: false,
    },
  ],
  relationships: [
    {
      id: "product_classification",
      from: "product",
      to: "classification_node",
      join: sameColumns(productCodes),
      where: [],
      cardinality: "many_to_one",
      optional: false,
      meaning:
        "The product's deepest classification node; its ancestors are the nodes whose leading codes it shares.",
      evidence: {
        declared: { constraint: "pk_mercadologico (produto → mercadologico)" },
        validated: {
          on: "2026-10-11",
          findings: [
            "Every product's code tuple matches exactly one node (un_mercadologico); almost every product is classified at level 5, a handful at level 3.",
            "Every node of level n has its first n codes set and the rest 0, so a node's subtree is the products sharing its first n codes.",
          ],
        },
        usage: [
          ...productUsage,
          "PDT Connect curva ABC and departments join levels 1 and 2 by leading codes.",
        ],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_section",
      from: "product",
      to: "classification_node",
      join: [{ from: "mercadologico1", to: "mercadologico1" }],
      where: [{ column: "nivel", equals: 1 }],
      cardinality: "many_to_one",
      optional: false,
      meaning:
        "The product's level-1 classification node (its top-level section).",
      evidence: {
        declared: null,
        validated: {
          on: "2026-10-11",
          findings: [
            "Exactly one level-1 node exists per mercadologico1 value and every product's mercadologico1 has one.",
            "Derived from the declared product_classification constraint and the node code shape.",
          ],
        },
        usage: productUsage,
      },
      status: "validated",
      confidence: "high",
    },
    {
      id: "section_cost_center",
      from: "classification_node",
      to: "cost_center",
      join: [{ from: "id_centrocusto", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: true,
      meaning:
        "Cost center assigned to a classification node. Only level-1 nodes carry it, so a product's cost center is the one of its section.",
      evidence: {
        declared: {
          constraint: "fk_id_centrocusto (mercadologico → centrocusto)",
        },
        validated: {
          on: "2026-10-11",
          findings: [
            "id_centrocusto is set only on level-1 nodes (never on levels 2-5); 17 of the 21 level-1 nodes have one.",
            "Every assigned value references a level-3 cost center; several sections share one cost center.",
            "Products of a section without a cost center have no cost center.",
          ],
        },
        usage: [
          ...productUsage,
          "PDT Connect departments take the cost center of the level-1 node.",
        ],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_buyer",
      from: "product",
      to: "buyer",
      join: [{ from: "id_comprador", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: false,
      meaning:
        "The buyer currently responsible for the product in its registration.",
      evidence: {
        declared: { constraint: "fk_id_comprador (produto → comprador)" },
        validated: {
          on: "2026-10-11",
          findings: [
            "id_comprador is NOT NULL and every product references an existing buyer.",
            "One buyer record is a default placeholder that holds products without a specific buyer.",
          ],
        },
        usage: [],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "sale_buyer",
      from: "sale",
      to: "buyer",
      join: [{ from: "id_comprador", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: true,
      meaning:
        "The product's buyer recorded on each sale when it happened (a snapshot), not the product's current buyer.",
      evidence: {
        declared: null,
        validated: {
          on: "2026-10-11",
          findings: [
            "Equal to the product's current buyer on every sale of 2026-10; differs for a few products in 2025-10 sales after buyer reassignments.",
          ],
        },
        usage: [
          "VRMaster sales reference SQL (PH-18) left join to comprador.",
          "PDT Connect buyer OKR and curva ABC filter sales by venda.id_comprador.",
        ],
      },
      status: "validated",
      confidence: "high",
    },
    {
      id: "product_supplier_company",
      from: "product",
      to: "supplier_company",
      join: [{ from: "id_fornecedorfabricante", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: false,
      meaning:
        "Business partner in the column named 'fornecedor fabricante'. The data does not support reading it as the manufacturer.",
      evidence: {
        declared: {
          constraint: "fk_id_fornecedorfabricante (produto → fornecedor)",
        },
        validated: {
          on: "2026-10-11",
          findings: [
            "Products of one brand point to several distributors, and many point to a placeholder partner; the column is not a reliable manufacturer.",
          ],
        },
        usage: [],
      },
      status: "verified",
      confidence: "low",
    },
    {
      id: "product_packaging",
      from: "product",
      to: "packaging_type",
      join: [{ from: "id_tipoembalagem", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: false,
      meaning: "The product's sales unit (UN, KG, CX...).",
      evidence: {
        declared: {
          constraint: "fk_id_tipoembalagem (produto → tipoembalagem)",
        },
        validated: {
          on: "2026-10-11",
          findings: [
            "NOT NULL; most products are units and roughly a tenth are sold by KG. KG packaging is not the same as the weighable flag.",
          ],
        },
        usage: [
          "VRMaster sales reference SQL (PH-18) groups quantities by id_tipoembalagem.",
        ],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_family_link",
      from: "product",
      to: "product_family",
      join: [{ from: "id_familiaproduto", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: true,
      meaning: "The family the product belongs to, when any.",
      evidence: {
        declared: {
          constraint: "fk_id_familiaproduto (produto → familiaproduto)",
        },
        validated: {
          on: "2026-10-11",
          findings: ["About a quarter of the products belong to a family."],
        },
        usage: [],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_barcodes",
      from: "product",
      to: "barcode",
      join: [{ from: "id", to: "id_produto" }],
      where: [],
      cardinality: "one_to_many",
      optional: false,
      meaning: "The product's barcodes.",
      evidence: {
        declared: { constraint: "produtoautomacao.id_produto → produto" },
        validated: {
          on: "2026-10-11",
          findings: [
            "Every product has at least one barcode row; some have many, so filters must use EXISTS to avoid duplicate products.",
          ],
        },
        usage: [],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_store_registrations",
      from: "product",
      to: "store_registration",
      join: [{ from: "id", to: "id_produto" }],
      where: [],
      cardinality: "one_to_many",
      optional: false,
      meaning:
        "The product's registration in each store, with its active or excluded status.",
      evidence: {
        declared: { constraint: "produtocomplemento.id_produto → produto" },
        validated: {
          on: "2026-10-11",
          findings: [
            "One row per product and store for every product.",
            "A large share of products is active in no store; classification nodes named INATIVO do not coincide with this status.",
          ],
        },
        usage: [
          "PDT Connect buyer OKR and display listings treat id_situacaocadastro = 1 as active in the store.",
        ],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_supplier_links",
      from: "product",
      to: "supplier_link",
      join: [{ from: "id", to: "id_produto" }],
      where: [],
      cardinality: "one_to_many",
      optional: true,
      meaning: "Suppliers the product is bought from.",
      evidence: {
        declared: { constraint: "produtofornecedor.id_produto → produto" },
        validated: {
          on: "2026-10-11",
          findings: [
            "About half of the products have supplier links, several per product and state.",
          ],
        },
        usage: [],
      },
      status: "verified",
      confidence: "high",
    },
    {
      id: "product_brand",
      from: "product",
      to: "brand",
      join: [{ from: "id_marca", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: true,
      meaning:
        "Declared brand column that is not used: brands appear in descriptions and often as classification nodes.",
      evidence: {
        declared: { constraint: "fk_id_marca (produto → marca)" },
        validated: {
          on: "2026-10-11",
          findings: ["No product has id_marca set."],
        },
        usage: [],
      },
      status: "rejected",
      confidence: "high",
    },
    {
      id: "product_merchandise_type",
      from: "product",
      to: "merchandise_type",
      join: [{ from: "id_tipomercadoria", to: "id" }],
      where: [],
      cardinality: "many_to_one",
      optional: true,
      meaning:
        "Fiscal merchandise nature, not a business classification: almost every product shares one value.",
      evidence: {
        declared: {
          constraint: "fk_id_tipomercadoria (produto → tipomercadoria)",
        },
        validated: {
          on: "2026-10-11",
          findings: ["Six values in use; one covers over 90% of the products."],
        },
        usage: [],
      },
      status: "rejected",
      confidence: "high",
    },
  ],
  hierarchies: [
    {
      id: "classification",
      entity: "classification_node",
      levelColumn: "nivel",
      codeColumns: productCodes,
      meaning:
        "Five-level mercadológico; deeper levels frequently hold brands and package sizes.",
    },
    {
      id: "cost_center_tree",
      entity: "cost_center",
      levelColumn: "nivel",
      codeColumns: ["centrocusto1", "centrocusto2", "centrocusto3"],
      meaning:
        "Three-level cost centers; a level-2 node and its level-3 child often share a name.",
    },
  ],
  dimensions: [
    {
      id: "category",
      kind: "hierarchy",
      title: "classificação mercadológica",
      description:
        "Classificação mercadológica do produto em até 5 níveis (seções como hortifrúti, registrado como FLV neste cadastro, ou mercearia, depois grupos, subgrupos, marcas e tamanhos). Use para tipos ou categorias de produto (por exemplo fruta, iogurte, cerveja, banana) e para marcas quando o cadastro as classifica.",
      synonyms: [
        "categoria",
        "mercadológico",
        "seção",
        "departamento",
        "grupo",
        "subgrupo",
        "família de produtos",
        "tipo de produto",
        "marca",
      ],
      path: ["product_classification"],
      entity: "classification_node",
      hierarchy: "classification",
      columns: ["descricao"],
      interpretation:
        "Produtos classificados nos níveis do mercadológico escolhidos, incluindo os níveis abaixo deles.",
      exposure: "enabled",
      blocker: null,
    },
    {
      id: "cost_center",
      kind: "entity",
      title: "centro de custo",
      description:
        "Centro de custo ao qual a seção (nível 1 do mercadológico) do produto está vinculada. Não há centro de custo no próprio produto.",
      synonyms: ["centro de custo", "cc"],
      path: ["product_section", "section_cost_center"],
      entity: "cost_center",
      hierarchy: "cost_center_tree",
      columns: ["descricao"],
      interpretation:
        "O centro de custo não é cadastrado no produto: considera-se o centro de custo vinculado à seção (nível 1 do mercadológico) de cada produto.",
      exposure: "enabled",
      blocker: null,
    },
    {
      id: "buyer",
      kind: "entity",
      title: "comprador",
      description:
        "Comprador responsável pelo produto no cadastro atual do produto (não o comprador registrado em vendas antigas).",
      synonyms: ["comprador", "compradora", "responsável pela compra"],
      path: ["product_buyer"],
      entity: "buyer",
      hierarchy: null,
      columns: ["nome"],
      interpretation:
        "Comprador responsável indicado no cadastro atual de cada produto.",
      exposure: "enabled",
      blocker: null,
    },
    {
      id: "description",
      kind: "text",
      title: "descrição",
      description:
        "Frase literal escrita na descrição do produto, quando a pessoa pede produtos cuja descrição contém um texto.",
      synonyms: ["descrição", "nome do produto", "contém"],
      path: [],
      entity: null,
      hierarchy: null,
      columns: ["descricaocompleta"],
      interpretation:
        "Produtos cuja descrição contém a frase, sem diferenciar acentos e maiúsculas, como palavras inteiras.",
      exposure: "enabled",
      blocker: null,
    },
    {
      id: "weighable",
      kind: "flag",
      title: "pesável",
      description:
        'Indicador "pesável" do cadastro do produto, como o ERP o registra. Não significa ser vendido por quilo: muitos produtos vendidos em embalagem KG não são marcados como pesáveis.',
      synonyms: ["pesável", "pesáveis"],
      path: [],
      entity: null,
      hierarchy: null,
      columns: ["pesavel"],
      interpretation:
        'Indicador "pesável" do cadastro do produto. Não equivale a ser vendido por quilo (embalagem KG).',
      exposure: "enabled",
      blocker: null,
    },
    {
      id: "store_status",
      kind: "status",
      title: "situação nas lojas",
      description: "Produto ativo em pelo menos uma loja.",
      synonyms: ["ativo", "inativo", "excluído", "descontinuado"],
      path: ["product_store_registrations"],
      entity: "store_registration",
      hierarchy: null,
      columns: [],
      interpretation:
        "Produto com cadastro ativo em pelo menos uma loja (produtocomplemento).",
      exposure: "pending_validation",
      blocker:
        "PH-27 grants verified; PJ-36 must validate the path before exposing this dimension.",
    },
    {
      id: "packaging",
      kind: "entity",
      title: "embalagem de venda",
      description: "Unidade de venda do produto (unidade, quilo, caixa...).",
      synonyms: ["embalagem", "unidade de venda", "vendido por quilo"],
      path: ["product_packaging"],
      entity: "packaging_type",
      hierarchy: null,
      columns: ["descricaocompleta"],
      interpretation: "Tipo de embalagem de venda do cadastro do produto.",
      exposure: "pending_validation",
      blocker:
        "PH-27 grants verified; PJ-36 must validate the path before exposing this dimension.",
    },
    {
      id: "family",
      kind: "entity",
      title: "família de preço",
      description: "Família do produto usada pelo ERP para preços e ofertas.",
      synonyms: ["família"],
      path: ["product_family_link"],
      entity: "product_family",
      hierarchy: null,
      columns: ["descricao"],
      interpretation: "Família de preços indicada no cadastro do produto.",
      exposure: "pending_validation",
      blocker:
        "PH-27 grants verified; PJ-36 must validate the path before exposing this dimension.",
    },
    {
      id: "manufacturer",
      kind: "entity",
      title: "fabricante",
      description: "Fabricante do produto.",
      synonyms: ["fabricante", "indústria"],
      path: ["product_supplier_company"],
      entity: "supplier_company",
      hierarchy: null,
      columns: ["nomefantasia", "razaosocial"],
      interpretation:
        "Parceiro indicado como fornecedor fabricante no cadastro.",
      exposure: "pending_validation",
      blocker:
        "The 'fornecedor fabricante' column holds distributors and a placeholder; the owner must define what manufacturer means before use.",
    },
  ],
  conventions: [
    {
      id: "raw_material",
      entity: "classification_node",
      pattern: "^(MP|MATERIA PRIMA)( |$)",
      label: "matéria-prima",
      meaning:
        "Nodes named MP or MATERIA PRIMA hold inputs used by the stores' production (bakery, butchery, rotisserie), not products sold as such.",
      evidence:
        "2026-10-11: such level-2 and level-3 nodes exist only under production sections and hold ingredients.",
    },
    {
      id: "inactive_classification",
      entity: "classification_node",
      pattern: "INATIV",
      label: "classificação de inativos",
      meaning:
        "Nodes named INATIVO group retired registrations by cataloguing convention; this is not the per-store registration status.",
      evidence:
        "2026-10-11: about a third of the products under such nodes is still active in a store, and many products elsewhere are active in none.",
    },
  ],
});
