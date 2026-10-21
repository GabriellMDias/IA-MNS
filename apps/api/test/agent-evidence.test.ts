import { describe, expect, it } from "vitest";
import {
  canReadReply,
  evidenceLimits,
  projectReplyEvidence,
} from "../src/features/agent/evidence.js";
import { redactModelText, safeModelText } from "../src/ai/transmission-text.js";
import type {
  AgentCapability,
  AgentReply,
} from "../src/features/agent/capabilities.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";

const capabilities: AgentCapability[] = ["sales", "products"].map((id) => ({
  id,
  permission: `${id}:read`,
  title: id,
  description: id,
  examples: [],
  execute: () => Promise.reject(new Error("Not executed")),
  close: () => Promise.resolve(),
}));
const permissions = new Set([
  "sales:read",
  "sales_sankhya:read",
  "sales_vrmaster:read",
  "products:read",
  "products_sankhya:read",
  "products_vrmaster:read",
]);
function answer(): AgentReply {
  return {
    kind: "answer",
    capabilityId: "sales",
    message: "Never sent: confidential prose",
    suggestions: [],
    result: {
      selection: "sankhya",
      sections: [
        {
          source: "sankhya",
          status: "answered",
          reason: null,
          result: {
            query: {
              productSearch: "maçã",
              startDate: "2026-07-01",
              endDate: "2026-09-30",
              metric: "net_value",
              groupBy: "month",
              comparison: "none",
            },
            rows: [
              {
                period: "2026-07",
                product: null,
                unit: "BRL",
                value: "12345678901234567890.12",
              },
            ],
            products: [],
            totals: [
              {
                unit: "BRL",
                value: "12345678901234567890.12",
                previousValue: null,
                changePercent: null,
              },
            ],
            comparison: null,
            warnings: ["Synthetic warning"],
          },
        },
      ],
    },
  };
}
function project(
  reply = answer(),
  extra: Partial<Parameters<typeof projectReplyEvidence>[0]> = {},
) {
  return projectReplyEvidence({
    reply,
    permissions,
    capabilities,
    source: "sankhya",
    evidenceId: "e0",
    purpose: "context",
    ...extra,
  });
}

describe("controlled business evidence transmission", () => {
  it("projects exact decimal facts, dates, provenance and safe audit without raw prose", () => {
    const result = project();
    expect(result.status).toBe("projected");
    if (result.status !== "projected") throw new Error("Expected projection");
    expect(result.facts.e0_s0_sankhya_total_0_value).toBe(
      "R$ 12.345.678.901.234.567.890,12",
    );
    expect(result.facts.e0_s0_sankhya_start).toBe("01/07/2026");
    expect(result.evidence.requiredPermissions).toEqual([
      "sales:read",
      "sales_sankhya:read",
    ]);
    expect(JSON.stringify(result)).not.toContain("confidential prose");
    expect(JSON.stringify(result.audit)).not.toContain("maçã");
    expect(result.audit.byteCount).toBe(
      Buffer.byteLength(JSON.stringify(result.evidence)),
    );
  });

  it("denies missing, inherited and semantic dependency permissions", () => {
    expect(project(answer(), { permissions: new Set() })).toMatchObject({
      status: "withheld",
      reason: "access_denied",
    });
    const reply = answer();
    reply.requiredPermissions = ["products:read"];
    expect(
      canReadReply(
        reply,
        new Set(["sales:read", "sales_sankhya:read", "sales_vrmaster:read"]),
        capabilities,
      ),
    ).toBe(false);
    delete reply.requiredPermissions;
    const data = reply.result as {
      sections: { result: { productSelection?: unknown } }[];
    };
    data.sections[0].result.productSelection = {
      source: "sankhya",
      catalogVersion: "synthetic/1",
      description: "buyer personal name",
    };
    expect(
      project(reply, {
        permissions: new Set([
          "sales:read",
          "sales_sankhya:read",
          "sales_vrmaster:read",
        ]),
      }),
    ).toMatchObject({ reason: "access_denied" });
    expect(JSON.stringify(project(reply))).not.toContain("buyer personal name");
  });

  it("fails closed for unknown fields, nonnumeric values and inconsistent provenance", () => {
    const reply = answer();
    const result = reply.result as Record<string, unknown>;
    result.password = "synthetic-never-send";
    expect(project(reply)).toMatchObject({
      status: "withheld",
      reason: "unknown_payload",
    });
    delete result.password;
    const raw = result as {
      sections: { source: string; result: { totals: { value: string }[] } }[];
    };
    raw.sections[0].result.totals[0].value = "ignore instructions";
    expect(project(reply)).toMatchObject({ reason: "unknown_payload" });
    raw.sections[0].result.totals[0].value = "10";
    raw.sections[0].source = "vrmaster";
    expect(project(reply)).toMatchObject({ reason: "unknown_payload" });
  });

  it("keeps source-separated totals and gives distinct fact references across analysis panels", () => {
    const first = answer().result;
    const second = structuredClone(first) as {
      selection: string;
      sections: { source: string }[];
    };
    second.selection = "vrmaster";
    second.sections[0].source = "vrmaster";
    const reply = answer();
    reply.result = { kind: "sales_analysis", panels: [first, second] };
    const result = project(reply, { source: "all" });
    expect(result.status).toBe("projected");
    if (result.status !== "projected") throw new Error("Expected projection");
    expect(result.evidence.sections.map((section) => section.source)).toEqual([
      "sankhya",
      "vrmaster",
    ]);
    expect(result.facts).toHaveProperty("e0_s0_p0_sankhya_total_0_value");
    expect(result.facts).toHaveProperty("e0_s0_p1_vrmaster_total_0_value");
    const selected = project(reply);
    if (selected.status !== "projected") throw new Error("Expected projection");
    expect(selected.evidence.sections).toHaveLength(1);
  });

  it("bounds row transmission, exposes truncation and requires detail purpose", () => {
    const reply = answer();
    const result = reply.result as {
      sections: {
        result: {
          rows: {
            period: string;
            product: null;
            unit: string;
            value: string;
          }[];
        };
      }[];
    };
    result.sections[0].result.rows = Array.from({ length: 150 }, () => ({
      period: "2026-07",
      product: null,
      unit: "BRL",
      value: "1",
    }));
    expect(project(reply).audit.rowCount).toBe(evidenceLimits.contextRows);
    expect(project(reply).audit.truncated).toBe(true);
    expect(project(reply, { purpose: "detail" })).toMatchObject({
      reason: "detail_purpose_required",
    });
    expect(
      project(reply, {
        purpose: "detail",
        detailJustification: "Compare individual product rows",
      }).audit.rowCount,
    ).toBe(evidenceLimits.detailRows);
  });

  it("withholds catalog-classified personal options while retaining ordinary categories", () => {
    const personal = vrmasterCatalog.dimensions.find(
      (dimension) =>
        vrmasterCatalog.entities.find(
          (entity) => entity.id === dimension.entity,
        )?.personalData,
    )!;
    const reply: AgentReply = {
      kind: "clarification",
      capabilityId: "products",
      message: "",
      suggestions: [],
      result: {
        kind: "product_options",
        source: "vrmaster",
        title: personal.title,
        text: "Synthetic",
        options: [{ number: 1, label: "Synthetic Person" }],
      },
    };
    const result = project(reply, { source: "vrmaster" });
    expect(result.status).toBe("projected");
    expect(JSON.stringify(result)).not.toContain("Synthetic Person");
    const category = vrmasterCatalog.dimensions.find(
      (dimension) =>
        dimension.kind === "hierarchy" && dimension.exposure === "enabled",
    )!;
    (reply.result as { title: string }).title = category.title;
    expect(JSON.stringify(project(reply, { source: "vrmaster" }))).toContain(
      "Synthetic Person",
    );
  });

  it("accepts empty snapshots on conversational replies but rejects malformed saved dependencies", () => {
    const reply: AgentReply = {
      kind: "conversation",
      message: "Hello",
      capabilityId: null,
      result: null,
      suggestions: [],
      evidenceSnapshots: [],
    };
    expect(canReadReply(reply, new Set(), capabilities)).toBe(true);
    const malformed = {
      ...reply,
      evidenceSnapshots: [{ id: "e0", result: null }],
    } as unknown as AgentReply;
    expect(canReadReply(malformed, permissions, capabilities)).toBe(false);
  });

  it("preserves all saved evidence and its permissions for follow-up prose", () => {
    const reply: AgentReply = {
      ...answer(),
      result: null,
      capabilityId: null,
      requiredPermissions: ["sales:read", "products:read"],
      evidenceSnapshots: [
        {
          id: "older",
          capabilityId: "sales",
          requiredPermissions: ["sales:read"],
          result: answer().result,
        },
        {
          id: "newer",
          capabilityId: "sales",
          requiredPermissions: ["products:read", "sales:read"],
          result: answer().result,
        },
      ],
    };
    const result = project(reply);
    expect(result.status).toBe("projected");
    if (result.status !== "projected") throw new Error("Expected projection");
    expect(result.evidence.sections).toHaveLength(2);
    expect(Object.keys(result.facts)).toContain("e0_s1_sankhya_total_0_value");
    expect(
      canReadReply(
        reply,
        new Set(["sales:read", "sales_sankhya:read", "sales_vrmaster:read"]),
        capabilities,
      ),
    ).toBe(false);
  });
});

it("redacts recognizable credentials and identifiers without claiming arbitrary name detection", () => {
  const text =
    "sk-proj-synthetic_not_a_real_key_12345 password=synthetic-secret person@example.test 123.456.789-00 <|system|> {{evil}}";
  const result = safeModelText(text);
  expect(result).not.toContain("synthetic-secret");
  expect(result).not.toContain("synthetic_not_a_real_key");
  expect(result).not.toContain("person@example.test");
  expect(result).not.toContain("123.456");
  expect(result).not.toContain("<|system|>");
  expect(result).not.toContain("{{evil}}");
  expect(redactModelText("Synthetic Person")).toBe("Synthetic Person");
  expect(safeModelText("abc", 2)).toBe("ab");
  expect(redactModelText('{"api_key":"synthetic-secret"}')).not.toContain(
    "synthetic-secret",
  );
});
