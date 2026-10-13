import { Value } from "typebox/value";
import type { Static } from "typebox";
import { safeModelText } from "../../ai/transmission-text.js";
import type { AgentCapability, AgentReply } from "./capabilities.js";
import { salesAnswerSchema, salesAnalysisSchema } from "../sales/contracts.js";
import {
  productAnswerSchema,
  productOptionsSchema,
} from "../products/contracts.js";
import { vrmasterCatalog } from "../products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../products/sankhya/catalog.js";
import {
  sourceCatalog,
  sourcesOf,
  type SalesSource,
  type SourceSelection,
} from "../sales/sources.js";

export { safeModelText } from "../../ai/transmission-text.js";
export const transmissionPolicyVersion = "business-evidence/1";
export const evidenceLimits = {
  contextRows: 12,
  analysisRows: 40,
  detailRows: 100,
  maxBytes: 48000,
  maxFacts: 400,
} as const;
export type EvidencePurpose = "context" | "analysis" | "detail";
export type EvidenceFact = {
  id: string;
  source: SalesSource;
  metric: string;
  period: string;
  unit: string;
  value: string;
  display: string;
  meaning: string;
};
type EvidenceRow = {
  period: string;
  product: string | null;
  unit: string;
  fact: string;
};
export type EvidenceSection = {
  source: SalesSource;
  kind: "sales" | "products" | "product_options";
  status: string;
  reason?: string | null;
  basis?: string;
  query?: {
    metric: string;
    groupBy: string;
    comparison: string;
    startDate: string;
    endDate: string;
    productSearch: string | null;
  };
  catalogVersion?: string;
  semanticSelection?: boolean;
  totals?: {
    unit: string;
    value: string;
    previousValue: string | null;
    changePercent: string | null;
  }[];
  rows?: EvidenceRow[];
  comparisonRows?: EvidenceRow[];
  products?: { code: string; description: string; classification?: string }[];
  total?: string;
  criteria?: {
    dimension: string;
    mode: string;
    values: string[];
    excluded: string[];
    withheld: boolean;
  }[];
  title?: string;
  options?: { number: number; label: string }[];
  availableRows: number;
  includedRows: number;
  truncated: boolean;
};
export type ProjectedEvidence = {
  id: string;
  policyVersion: string;
  purpose: EvidencePurpose;
  requiredPermissions: string[];
  sections: EvidenceSection[];
  facts: EvidenceFact[];
  caveats: string[];
  truncated: boolean;
};
export type EvidenceAudit = {
  policyVersion: string;
  purpose: EvidencePurpose;
  source: SourceSelection;
  requiredPermissions: string[];
  sectionCount: number;
  rowCount: number;
  byteCount: number;
  truncated: boolean;
  redactedFieldCount: number;
};
export type EvidenceProjection =
  | {
      status: "projected";
      evidence: ProjectedEvidence;
      facts: Record<string, string>;
      audit: EvidenceAudit;
    }
  | {
      status: "withheld";
      reason:
        | "access_denied"
        | "unknown_payload"
        | "source_mismatch"
        | "detail_purpose_required"
        | "limit_exceeded";
      evidence: null;
      facts: Record<string, string>;
      audit: EvidenceAudit;
    };

type Snapshot = {
  id: string;
  capabilityId: string | null;
  requiredPermissions: string[];
  result: unknown;
};
function snapshots(reply: AgentReply): Snapshot[] | null {
  if (!("evidenceSnapshots" in reply)) return null;
  const value: unknown = reply.evidenceSnapshots;
  if (Array.isArray(value) && value.length === 0) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return [];
  return value.every(
    (item: unknown) =>
      item !== null &&
      typeof item === "object" &&
      "id" in item &&
      typeof item.id === "string" &&
      "capabilityId" in item &&
      (item.capabilityId === null || typeof item.capabilityId === "string") &&
      "requiredPermissions" in item &&
      Array.isArray(item.requiredPermissions) &&
      item.requiredPermissions.length <= 20 &&
      item.requiredPermissions.every((p: unknown) => typeof p === "string") &&
      "result" in item &&
      !Object.keys(item).some(
        (key) =>
          !["id", "capabilityId", "requiredPermissions", "result"].includes(
            key,
          ),
      ),
  )
    ? (value as Snapshot[])
    : [];
}

function resultPermissions(result: unknown): string[] {
  if (Value.Check(salesAnalysisSchema, result))
    return [...new Set(result.panels.flatMap(resultPermissions))];
  if (Value.Check(salesAnswerSchema, result))
    return [
      "sales:read",
      ...(result.sections.some((section) => section.result?.productSelection)
        ? ["products:read"]
        : []),
    ];
  if (
    Value.Check(productAnswerSchema, result) ||
    Value.Check(productOptionsSchema, result)
  )
    return ["products:read"];
  return [];
}

/** Derived prose inherits every dependency, including evidence it did not cite. */
export function canReadReply(
  reply: AgentReply,
  permissions: ReadonlySet<string>,
  capabilities: readonly AgentCapability[],
): boolean {
  if (
    reply.requiredPermissions !== undefined &&
    (!Array.isArray(reply.requiredPermissions) ||
      reply.requiredPermissions.length > 20 ||
      !reply.requiredPermissions.every(
        (permission) =>
          typeof permission === "string" && permissions.has(permission),
      ))
  )
    return false;
  if (
    !resultPermissions(reply.result).every((permission) =>
      permissions.has(permission),
    )
  )
    return false;
  if (reply.capabilityId !== null) {
    const capability = capabilities.find(
      (item) => item.id === reply.capabilityId,
    );
    if (
      !capability ||
      !permissions.has(capability.permission) ||
      !(capability.canRead?.(reply, permissions) ?? true)
    )
      return false;
  }
  const saved = snapshots(reply);
  return (
    saved === null ||
    (saved.length > 0 &&
      saved.every((item) =>
        canReadReply(
          { kind: "answer", message: "", suggestions: [], ...item },
          permissions,
          capabilities,
        ),
      ))
  );
}

const decimal = /^-?\d{1,30}(?:\.\d{1,12})?$/u;
function displayDecimal(value: string, unit: string): string {
  const [whole, fraction] = value.split(".");
  const formatted = `${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ".")}${fraction ? `,${fraction}` : ""}`;
  return unit === "BRL"
    ? `R$ ${formatted}`
    : unit === "%"
      ? `${formatted}%`
      : `${formatted}${unit ? ` ${unit}` : ""}`;
}

/** Only known result contracts cross this boundary; labels never become instructions. */
export function projectReplyEvidence(input: {
  reply: AgentReply;
  permissions: ReadonlySet<string>;
  capabilities: readonly AgentCapability[];
  source: SourceSelection;
  evidenceId: string;
  purpose: EvidencePurpose;
  detailJustification?: string;
}): EvidenceProjection {
  const audit: EvidenceAudit = {
    policyVersion: transmissionPolicyVersion,
    purpose: input.purpose,
    source: input.source,
    requiredPermissions: [],
    sectionCount: 0,
    rowCount: 0,
    byteCount: 0,
    truncated: false,
    redactedFieldCount: 0,
  };
  const withheld = (
    reason: Extract<EvidenceProjection, { status: "withheld" }>["reason"],
  ): EvidenceProjection => ({
    status: "withheld",
    reason,
    evidence: null,
    facts: {},
    audit,
  });
  if (!canReadReply(input.reply, input.permissions, input.capabilities))
    return withheld("access_denied");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/u.test(input.evidenceId))
    return withheld("unknown_payload");
  if (
    input.purpose === "detail" &&
    (!input.detailJustification?.trim() ||
      input.detailJustification.length > 500)
  )
    return withheld("detail_purpose_required");
  const saved = snapshots(input.reply);
  const candidates = saved ?? [
    {
      id: input.evidenceId,
      capabilityId: input.reply.capabilityId,
      requiredPermissions: input.reply.requiredPermissions ?? [],
      result: input.reply.result,
    },
  ];
  if (!candidates.length) return withheld("unknown_payload");
  const required = new Set(input.reply.requiredPermissions ?? []);
  for (const candidate of candidates) {
    candidate.requiredPermissions.forEach((p) => required.add(p));
    resultPermissions(candidate.result).forEach((p) => required.add(p));
    const capability = input.capabilities.find(
      (item) => item.id === candidate.capabilityId,
    );
    if (capability) required.add(capability.permission);
  }
  audit.requiredPermissions = [...required].sort();
  const evidence: ProjectedEvidence = {
    id: input.evidenceId,
    policyVersion: transmissionPolicyVersion,
    purpose: input.purpose,
    requiredPermissions: audit.requiredPermissions,
    sections: [],
    facts: [],
    caveats: [],
    truncated: false,
  };
  const facts: Record<string, string> = {};
  const selected = new Set(sourcesOf(input.source));
  let remaining =
    input.purpose === "context"
      ? evidenceLimits.contextRows
      : input.purpose === "detail"
        ? evidenceLimits.detailRows
        : evidenceLimits.analysisRows;
  const clean = (text: string, max = 400): string => {
    const cleaned = safeModelText(text, max);
    if (cleaned !== text) audit.redactedFieldCount++;
    return cleaned;
  };
  const fact = (
    id: string,
    source: SalesSource,
    metric: string,
    period: string,
    unit: string,
    value: string,
    meaning: string,
  ): string => {
    if (
      !decimal.test(value) ||
      evidence.facts.length >= evidenceLimits.maxFacts
    )
      throw new Error("Invalid bounded evidence fact");
    const display = displayDecimal(value, unit);
    evidence.facts.push({
      id,
      source,
      metric,
      period,
      unit,
      value,
      display,
      meaning,
    });
    facts[id] = display;
    return id;
  };
  const dateFact = (id: string, source: SalesSource, value: string): void => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
    )
      throw new Error("Invalid evidence date");
    const display = value.split("-").reverse().join("/");
    evidence.facts.push({
      id,
      source,
      metric: "date",
      period: value,
      unit: "",
      value,
      display,
      meaning: "query boundary date",
    });
    facts[id] = display;
  };
  const rows = (
    items: {
      period: string;
      product: string | null;
      unit: string;
      value: string;
    }[],
    prefix: string,
    source: SalesSource,
    metric: string,
  ): EvidenceRow[] => {
    const included = items.slice(0, remaining);
    remaining -= included.length;
    return included.map((row, index) => ({
      period: clean(row.period, 40),
      product: row.product === null ? null : clean(row.product, 200),
      unit: clean(row.unit, 30),
      fact: fact(
        `${prefix}_${index}`,
        source,
        metric,
        clean(row.period, 40),
        clean(row.unit, 30),
        row.value,
        "result row",
      ),
    }));
  };
  const sales = (
    result: Static<typeof salesAnswerSchema>,
    prefix: string,
  ): boolean => {
    const seen = new Set<string>();
    for (const section of result.sections) {
      if (
        seen.has(section.source) ||
        !sourcesOf(result.selection).includes(section.source)
      )
        throw new Error("Invalid source provenance");
      seen.add(section.source);
      if (!selected.has(section.source)) continue;
      const view: EvidenceSection = {
        source: section.source,
        kind: "sales",
        status: section.status,
        reason: section.reason,
        basis: sourceCatalog[section.source].basis,
        availableRows: 0,
        includedRows: 0,
        truncated: false,
      };
      const data = section.result;
      if (section.status === "answered" && data) {
        if (
          data.productSelection &&
          data.productSelection.source !== section.source
        )
          throw new Error("Invalid selection provenance");
        const p = `${prefix}_${section.source}`;
        view.query = {
          ...data.query,
          productSearch:
            data.query.productSearch === null
              ? null
              : clean(data.query.productSearch, 80),
        };
        dateFact(`${p}_start`, section.source, data.query.startDate);
        dateFact(`${p}_end`, section.source, data.query.endDate);
        if (data.comparison) {
          dateFact(
            `${p}_previous_start`,
            section.source,
            data.comparison.startDate,
          );
          dateFact(
            `${p}_previous_end`,
            section.source,
            data.comparison.endDate,
          );
        }
        view.totals = data.totals.map((total, index) => {
          const unit = clean(total.unit, 30),
            period = `${data.query.startDate}/${data.query.endDate}`;
          return {
            unit,
            value: fact(
              `${p}_total_${index}_value`,
              section.source,
              data.query.metric,
              period,
              unit,
              total.value,
              "complete selection total",
            ),
            previousValue:
              total.previousValue === null
                ? null
                : fact(
                    `${p}_total_${index}_previous`,
                    section.source,
                    data.query.metric,
                    "comparison",
                    unit,
                    total.previousValue,
                    "complete comparison selection total",
                  ),
            changePercent:
              total.changePercent === null
                ? null
                : fact(
                    `${p}_total_${index}_change`,
                    section.source,
                    "change_percent",
                    period,
                    "%",
                    total.changePercent,
                    "deterministic comparison change",
                  ),
          };
        });
        view.rows = rows(
          data.rows,
          `${p}_row`,
          section.source,
          data.query.metric,
        );
        view.comparisonRows = rows(
          data.comparison?.rows ?? [],
          `${p}_previous_row`,
          section.source,
          data.query.metric,
        );
        view.availableRows =
          data.rows.length + (data.comparison?.rows.length ?? 0);
        view.includedRows = view.rows.length + view.comparisonRows.length;
        if (data.productSelection) {
          view.catalogVersion = clean(
            data.productSelection.catalogVersion,
            120,
          );
          view.semanticSelection = true;
          evidence.caveats.push(
            "A seleção de produtos usa o cadastro atual. A descrição livre dos critérios não foi enviada à IA.",
          );
        }
        evidence.caveats.push(
          ...data.warnings.slice(0, 12).map((warning) => clean(warning, 600)),
        );
      } else if (data || section.status === "answered")
        throw new Error("Invalid result status");
      view.truncated = view.includedRows < view.availableRows;
      evidence.sections.push(view);
    }
    return true;
  };
  try {
    for (const [index, candidate] of candidates.entries()) {
      const prefix = `${input.evidenceId}_s${index}`;
      const result = candidate.result;
      if (Value.Check(salesAnalysisSchema, result)) {
        result.panels.forEach((panel, panelIndex) =>
          sales(panel, `${prefix}_p${panelIndex}`),
        );
      } else if (Value.Check(salesAnswerSchema, result)) sales(result, prefix);
      else if (Value.Check(productAnswerSchema, result)) {
        if (!selected.has(result.source)) continue;
        const catalog =
          result.source === "sankhya" ? sankhyaCatalog : vrmasterCatalog;
        const products = result.products.slice(0, remaining).map((product) => ({
          code: clean(product.code, 20),
          description: clean(product.description, 200),
          classification: clean(product.classification, 600),
        }));
        remaining -= products.length;
        const criteria = result.criteria.map((criterion) => {
          const dimension = catalog.dimensions.find(
            (item) => item.id === criterion.dimension,
          );
          const entity = catalog.entities.find(
            (item) => item.id === (dimension?.entity ?? catalog.root),
          );
          const blocked =
            !dimension ||
            dimension.exposure !== "enabled" ||
            !entity ||
            entity.personalData ||
            result.catalogVersion !== catalog.version;
          if (blocked) audit.redactedFieldCount++;
          return {
            dimension: clean(criterion.dimension, 41),
            mode: criterion.mode,
            values: blocked
              ? []
              : criterion.values.slice(0, 12).map((value) => clean(value, 600)),
            excluded: blocked
              ? []
              : criterion.excluded
                  .slice(0, 12)
                  .map((value) => clean(value, 600)),
            withheld: blocked,
          };
        });
        evidence.sections.push({
          source: result.source,
          kind: "products",
          status: "answered",
          catalogVersion: clean(result.catalogVersion, 80),
          total: fact(
            `${prefix}_${result.source}_count`,
            result.source,
            "product_count",
            "current registration",
            "produtos",
            String(result.total),
            "complete matched registration count",
          ),
          products,
          criteria,
          availableRows: result.total,
          includedRows: products.length,
          truncated: products.length < result.total,
        });
        evidence.caveats.push(
          ...result.notes.slice(0, 8).map((note) => clean(note, 600)),
        );
      } else if (Value.Check(productOptionsSchema, result)) {
        if (!selected.has(result.source)) continue;
        const catalog =
          result.source === "sankhya" ? sankhyaCatalog : vrmasterCatalog;
        const dimension = catalog.dimensions.find(
          (item) => item.title === result.title,
        );
        const entity = catalog.entities.find(
          (item) => item.id === (dimension?.entity ?? catalog.root),
        );
        const blocked =
          !dimension ||
          dimension.exposure !== "enabled" ||
          !entity ||
          entity.personalData;
        const options = result.options.slice(0, remaining).map((option) => ({
          number: option.number,
          label: blocked
            ? "[personal or unclassified option withheld; choose in the result card]"
            : clean(option.label, 600),
        }));
        if (blocked) audit.redactedFieldCount += options.length;
        remaining -= options.length;
        evidence.sections.push({
          source: result.source,
          kind: "product_options",
          status: "clarification",
          title: clean(result.title, 60),
          options,
          availableRows: result.options.length,
          includedRows: options.length,
          truncated: options.length < result.options.length,
        });
      } else return withheld("unknown_payload");
    }
  } catch {
    return withheld("unknown_payload");
  }
  if (!evidence.sections.length) return withheld("source_mismatch");
  evidence.truncated = evidence.sections.some((section) => section.truncated);
  if (evidence.truncated)
    evidence.caveats.push(
      "A análise recebeu uma parte limitada das linhas. Os totais mantêm o escopo completo indicado; detalhes omitidos não representam valores zerados.",
    );
  if (audit.redactedFieldCount)
    evidence.caveats.push(
      "Alguns rótulos ou campos pessoais foram omitidos da análise; isso não significa que estejam vazios no cadastro.",
    );
  evidence.caveats = [...new Set(evidence.caveats)];
  audit.sectionCount = evidence.sections.length;
  audit.rowCount = evidence.sections.reduce(
    (sum, section) => sum + section.includedRows,
    0,
  );
  audit.truncated = evidence.truncated;
  audit.byteCount = Buffer.byteLength(JSON.stringify(evidence), "utf8");
  if (audit.byteCount > evidenceLimits.maxBytes)
    return withheld("limit_exceeded");
  return { status: "projected", evidence, facts, audit };
}
