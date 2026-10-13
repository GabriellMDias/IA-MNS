/** Live read-only checks. Real record values and model traces remain in ignored local evidence. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createOpenAiModel } from "../src/ai/openai.js";
import { parseServerConfig } from "../src/config.js";
import { loadDiscoveryConfig } from "./discovery-config.js";
import {
  createProductInterpreter,
  productModelTimeoutMs,
} from "../src/features/products/interpreter.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import type {
  ProductSelection,
  ResolvedCriterion,
} from "../src/features/products/selection.js";
import { emptyProductState } from "../src/features/products/state.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { compileSelection } from "../src/features/products/sankhya/oracle.js";
import {
  createOracleProductReader,
  type OracleSession,
} from "../src/features/products/sankhya/session.js";
import {
  createOracleProductSource,
  groupTree,
} from "../src/features/products/sankhya/source.js";
import { significantWords } from "../src/features/products/text.js";
import { ProductFailure } from "../src/features/products/errors.js";

const runtimeCheck = process.argv.includes("--runtime");
const config = runtimeCheck
  ? parseServerConfig(process.env)
  : await loadDiscoveryConfig("sankhya");
if (config.environment === "production")
  throw new Error(
    "Live discovery validation must run outside production application configuration",
  );
const reader = createOracleProductReader(
  config,
  runtimeCheck ? "runtime" : "discovery",
);
const source = createOracleProductSource(sankhyaCatalog, reader);
const signal = () => AbortSignal.timeout(45000);
const findings: {
  id: string;
  status: "passed" | "failed" | "unsupported";
  ms?: number;
  total?: number;
  detail?: string;
}[] = [];
const entity = (
  dimension: string,
  id: string | number,
  label = "local record",
): ResolvedCriterion => ({
  kind: "entity",
  dimension,
  mode: "include",
  text: label,
  matched: [{ id, label, active: null }],
  values: [{ id, label, active: null }],
});
const literal = (dimension: string, phrase: string): ResolvedCriterion => ({
  kind: "text",
  dimension,
  mode: "include",
  text: phrase,
  phrase,
});
type Scenario = {
  id: string;
  criteria: ResolvedCriterion[];
  sql: string;
  binds?: Record<string, string | number>;
  message?: string;
  min?: number;
};

async function equality(
  session: OracleSession,
  selection: ProductSelection,
  sql: string,
  expected: Record<string, string | number> = {},
) {
  const compiled = compileSelection(sankhyaCatalog, selection);
  const actual = `SELECT p.CODPROD ID FROM TGFPRO p WHERE ${compiled.where}`;
  const binds = { ...compiled.binds, ...expected };
  const difference = await session.query(
    `SELECT COUNT(*) N FROM (((${actual}) MINUS (${sql})) UNION ALL ((${sql}) MINUS (${actual})))`,
    binds,
    1,
  );
  const count = await session.query(
    `SELECT COUNT(*) N FROM (${sql})`,
    expected,
    1,
  );
  return { equal: difference[0].N === 0, total: Number(count[0].N) };
}

try {
  const data = await reader.read(signal(), async (session) => ({
    groups: await session.query(
      "SELECT CODGRUPOPROD ID,CODGRUPAI PARENT,DESCRGRUPOPROD LABEL FROM TGFGRU ORDER BY CODGRUPOPROD",
      {},
      2000,
    ),
    brand: await session.query(
      "SELECT * FROM (SELECT M.CODIGO ID,M.DESCRICAO LABEL FROM TGFMAR M WHERE M.DESCRICAO IS NOT NULL AND EXISTS (SELECT 1 FROM TGFPRO P WHERE P.CODMARCA=M.CODIGO) ORDER BY M.CODIGO) WHERE ROWNUM=1",
      {},
      1,
    ),
    supplier: await session.query(
      "SELECT * FROM (SELECT S.CODPARC ID FROM TGFPAR S WHERE S.FORNECEDOR='S' AND EXISTS (SELECT 1 FROM TGFPAP A WHERE A.CODPARC=S.CODPARC) ORDER BY S.CODPARC) WHERE ROWNUM=1",
      {},
      1,
    ),
    certificate: await session.query(
      "SELECT * FROM (SELECT AD_CA VALUE FROM TGFPRO WHERE AD_CA IS NOT NULL ORDER BY CODPROD) WHERE ROWNUM=1",
      {},
      1,
    ),
    packaging: await session.query(
      "SELECT * FROM (SELECT L.CODLISTA ID,L.DESCRLISTA LABEL FROM AD_LISTADCEMB L WHERE EXISTS (SELECT 1 FROM TGFGRU G JOIN TGFPRO P ON P.CODGRUPOPROD=G.CODGRUPOPROD WHERE G.AD_CODLISTADC=L.CODLISTA) ORDER BY L.CODLISTA) WHERE ROWNUM=1",
      {},
      1,
    ),
    units: await session.query(
      "SELECT CODVOL ID,DESCRVOL LABEL FROM TGFVOL ORDER BY CODVOL",
      {},
      2000,
    ),
  }));
  const nodes = groupTree(
    data.groups.map((row) => ({
      id: Number(row.ID),
      parent: Number(row.PARENT),
      label: String(row.LABEL),
    })),
  );
  const group = [...nodes.values()].find(
    (node) => node.level === 1 && node.id > 0,
  )!;
  const category: ResolvedCriterion = {
    kind: "hierarchy",
    dimension: "category",
    mode: "include",
    text: group.path[0],
    qualifier: null,
    include: [{ node: group, scope: "subtree" }],
    exclude: [],
    anywhere: false,
    terms: [group.path[0]],
  };
  const scenarios: Scenario[] = [
    {
      id: "literal-identification",
      criteria: [literal("description", "BATATA")],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE REGEXP_LIKE(UPPER(DESCRPROD),'(^|[^[:alnum:]])BATATA([^[:alnum:]]|$)')",
      message: 'Quais produtos têm "BATATA" na descrição?',
      min: 1,
    },
    {
      id: "hierarchical-group",
      criteria: [category],
      sql: "SELECT P.CODPROD ID FROM TGFPRO P WHERE P.CODGRUPOPROD IN (SELECT G.CODGRUPOPROD FROM TGFGRU G START WITH G.CODGRUPOPROD=:expected CONNECT BY NOCYCLE PRIOR G.CODGRUPOPROD=G.CODGRUPAI)",
      binds: { expected: group.id },
      message: `Quais produtos pertencem ao grupo "${group.path[0]}", incluindo todos os subgrupos?`,
      min: 1,
    },
    {
      id: "base-unit",
      criteria: [entity("unit", "KG", "KG")],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE CODVOL='KG'",
      message: "Quais produtos têm unidade base KG?",
      min: 1,
    },
    {
      id: "alternate-unit-two-hop",
      criteria: [entity("alternate_unit", "KG", "KG")],
      sql: "SELECT DISTINCT P.CODPROD ID FROM TGFPRO P JOIN TGFVOA A ON A.CODPROD=P.CODPROD JOIN TGFVOL V ON V.CODVOL=A.CODVOL WHERE V.CODVOL='KG'",
      message: "Quais produtos possuem unidade alternativa KG?",
      min: 1,
    },
    {
      id: "combined",
      criteria: [
        entity("usage", "R", "Revenda"),
        { kind: "flag", dimension: "active", mode: "include", text: "ativos" },
        literal("description", "BATATA"),
      ],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE USOPROD='R' AND ATIVO='S' AND REGEXP_LIKE(UPPER(DESCRPROD),'(^|[^[:alnum:]])BATATA([^[:alnum:]]|$)')",
      message: 'Quais produtos de revenda ativos têm "BATATA" na descrição?',
      min: 1,
    },
    {
      id: "null-safe-exclusion",
      criteria: [{ ...entity("unit", "KG", "KG"), mode: "exclude" }],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE CODVOL<>'KG' OR CODVOL IS NULL",
      min: 1,
    },
    {
      id: "characteristics",
      criteria: [literal("characteristics", "ALGODAO")],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE REGEXP_LIKE(TRANSLATE(UPPER(CARACTERISTICAS),'ÃÁÂÀ','AAAA'),'(^|[^[:alnum:]])ALGODAO([^[:alnum:]]|$)')",
      message: 'Quais produtos têm "algodão" nas características?',
    },
  ];
  if (data.brand[0])
    scenarios.push({
      id: "registered-brand",
      criteria: [
        entity("brand", Number(data.brand[0].ID), String(data.brand[0].LABEL)),
      ],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE CODMARCA=:expected",
      binds: { expected: Number(data.brand[0].ID) },
      min: 1,
    });
  if (data.supplier[0])
    scenarios.push({
      id: "supplier-two-hop",
      criteria: [entity("supplier", Number(data.supplier[0].ID))],
      sql: "SELECT DISTINCT P.CODPROD ID FROM TGFPRO P JOIN TGFPAP A ON A.CODPROD=P.CODPROD JOIN TGFPAR S ON S.CODPARC=A.CODPARC WHERE S.FORNECEDOR='S' AND S.CODPARC=:expected",
      binds: { expected: Number(data.supplier[0].ID) },
      min: 1,
    });
  if (data.certificate[0]) {
    const value = String(data.certificate[0].VALUE);
    scenarios.push({
      id: "custom-epi-certificate",
      criteria: [literal("epi_certificate", value)],
      sql: "SELECT CODPROD ID FROM TGFPRO WHERE AD_CA=:expected",
      binds: { expected: value },
      message: `Quais produtos têm certificado EPI "${value}"?`,
      min: 1,
    });
  }
  if (data.packaging[0])
    scenarios.push({
      id: "custom-list-two-hop",
      criteria: [
        entity(
          "packaging_list",
          Number(data.packaging[0].ID),
          String(data.packaging[0].LABEL),
        ),
      ],
      sql: "SELECT P.CODPROD ID FROM TGFPRO P JOIN TGFGRU G ON G.CODGRUPOPROD=P.CODGRUPOPROD WHERE G.AD_CODLISTADC=:expected",
      binds: { expected: Number(data.packaging[0].ID) },
      min: 1,
    });
  for (const scenario of scenarios) {
    const start = performance.now();
    try {
      const selection = { criteria: scenario.criteria };
      const page = await source.find(selection, 200, signal());
      const compared = await reader.read(signal(), (session) =>
        equality(session, selection, scenario.sql, scenario.binds),
      );
      const passed =
        compared.equal &&
        page.total === compared.total &&
        page.total >= (scenario.min ?? 0) &&
        new Set(page.products.map((row) => row.code)).size ===
          page.products.length;
      findings.push({
        id: scenario.id,
        status: passed ? "passed" : "failed",
        ms: Math.round(performance.now() - start),
        total: page.total,
      });
    } catch {
      findings.push({
        id: scenario.id,
        status: "failed",
        detail: "Read-only source or independent comparison failed",
      });
    }
  }
  const unitDimension = sankhyaCatalog.dimensions.find(
    (item) => item.id === "unit",
  )!;
  const unitWords = [
    ...new Set(
      data.units.flatMap((row) => significantWords(String(row.LABEL))),
    ),
  ];
  let ambiguousWord: string | undefined;
  for (const word of unitWords) {
    if (
      data.units.filter((row) =>
        significantWords(String(row.LABEL)).includes(word),
      ).length < 2
    )
      continue;
    const matches = await source.findRecords(unitDimension, [word], signal());
    if (matches.length > 1) {
      ambiguousWord = word;
      break;
    }
  }
  findings.push({
    id: "ambiguous-unit-values",
    status: ambiguousWord ? "passed" : "unsupported",
    detail: ambiguousWord
      ? "Multiple real dictionary-unit candidates retained"
      : "No ambiguous unit label found",
  });
  const runtimeReader = createOracleProductReader(config);
  const supplierCandidates = await source.listRecords(
    sankhyaCatalog.dimensions.find((item) => item.id === "supplier")!,
    signal(),
  );
  const candidateBinds = Object.fromEntries(
    supplierCandidates.map((item, index) => [`c${index}`, item.record.id]),
  );
  const invalidCandidates = supplierCandidates.length
    ? await reader.read(signal(), (session) =>
        session.query(
          `SELECT COUNT(*) N FROM TGFPAR WHERE CODPARC IN (${Object.keys(
            candidateBinds,
          )
            .map((key) => `:${key}`)
            .join(",")}) AND (FORNECEDOR IS NULL OR FORNECEDOR<>'S')`,
          candidateBinds,
          1,
        ),
      )
    : [];
  findings.push({
    id: "supplier-candidate-role",
    status: invalidCandidates[0]?.N === 0 ? "passed" : "failed",
    detail: "Candidate lookup enforces the supplier-role predicate",
  });
  let runtimeRead = false;
  try {
    await runtimeReader.read(signal(), () => {
      runtimeRead = true;
      return Promise.resolve();
    });
    findings.push({
      id: "runtime-account",
      status: "passed",
      detail: "Configured account passed SELECT-only guard",
    });
  } catch (cause) {
    const refused =
      !runtimeRead &&
      cause instanceof ProductFailure &&
      cause.boundary.stage === "catalog" &&
      cause.cause instanceof Error &&
      cause.cause.message === "A SELECT-only non-owner ERP account is required";
    findings.push({
      id: "runtime-account",
      status: refused && !runtimeCheck ? "passed" : "failed",
      detail: refused
        ? "Privileged account refused before product execution; runtime enablement remains blocked"
        : "Runtime account verification failed unexpectedly",
    });
  } finally {
    await runtimeReader.close();
  }
  if (process.argv.includes("--model")) {
    const resolver = new ProductResolver(
      source,
      createProductInterpreter(
        createOpenAiModel(config, config.openaiModel, {
          timeoutMs: productModelTimeoutMs,
        }),
        sankhyaCatalog,
      ),
    );
    for (const scenario of scenarios.filter((item) => item.message)) {
      const start = performance.now();
      try {
        const turn = await resolver.execute({
          message: scenario.message!,
          state: structuredClone(emptyProductState),
          sourceSelected: true,
          signal: AbortSignal.timeout(90000),
          progress: () => Promise.resolve(),
        });
        const compared =
          turn.state.active && turn.reply.kind === "answer"
            ? await reader.read(signal(), (session) =>
                equality(
                  session,
                  turn.state.active!,
                  scenario.sql,
                  scenario.binds,
                ),
              )
            : null;
        findings.push({
          id: `model/${scenario.id}`,
          status: compared?.equal ? "passed" : "failed",
          ms: Math.round(performance.now() - start),
          total: compared?.total,
          detail: turn.reply.kind,
        });
      } catch {
        findings.push({
          id: `model/${scenario.id}`,
          status: "failed",
          detail: "Model or source boundary failed",
        });
      }
    }
    try {
      const turn = await resolver.execute({
        message: "Quais produtos são do comprador João?",
        state: structuredClone(emptyProductState),
        sourceSelected: true,
        signal: AbortSignal.timeout(60000),
        progress: () => Promise.resolve(),
      });
      findings.push({
        id: "model/unsupported-buyer",
        status:
          (turn.reply.kind === "unsupported" ||
            turn.reply.kind === "clarification") &&
          !turn.state.active
            ? "passed"
            : "failed",
        detail: turn.reply.kind,
      });
    } catch {
      findings.push({ id: "model/unsupported-buyer", status: "failed" });
    }
    if (ambiguousWord) {
      try {
        const turn = await resolver.execute({
          message: `Quais produtos têm unidade base "${ambiguousWord}"?`,
          state: structuredClone(emptyProductState),
          sourceSelected: true,
          signal: AbortSignal.timeout(60000),
          progress: () => Promise.resolve(),
        });
        findings.push({
          id: "model/ambiguous-unit",
          status:
            turn.reply.kind === "clarification" &&
            !turn.state.active &&
            (turn.state.pending?.options.length ?? 0) > 1
              ? "passed"
              : "failed",
          detail: turn.reply.kind,
        });
      } catch {
        findings.push({ id: "model/ambiguous-unit", status: "failed" });
      }
    }
  }
  findings.push(
    {
      id: "additional-classification",
      status: "unsupported",
      detail: "TGFCLA and TGFCLP are empty",
    },
    {
      id: "buyer",
      status: "unsupported",
      detail: "No verified product-to-buyer relationship",
    },
  );
} catch {
  findings.push({
    id: "discovery",
    status: "failed",
    detail: "Read-only scenario preparation failed",
  });
} finally {
  try {
    await source.close();
  } catch {
    findings.push({
      id: "cleanup",
      status: "failed",
      detail: "Read-only reader cleanup failed",
    });
  }
}
const destination = resolve("evals/.local/sankhya");
await mkdir(destination, { recursive: true });
await writeFile(
  resolve(
    destination,
    process.argv.includes("--model")
      ? "regression-model-report.json"
      : "regression-report.json",
  ),
  JSON.stringify(
    {
      catalog: sankhyaCatalog.version,
      model: process.argv.includes("--model") ? config.openaiModel : null,
      on: new Date().toISOString(),
      findings,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(findings, null, 2));
if (findings.some((finding) => finding.status === "failed"))
  process.exitCode = 1;
