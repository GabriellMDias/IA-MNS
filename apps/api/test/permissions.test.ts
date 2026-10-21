import { describe, expect, it, vi } from "vitest";
import {
  describeScope,
  permissionDeniedMessage,
  recordAccess,
  scopeCovers,
  uniteScopes,
  unrestricted,
  type AccessRule,
  type DataScope,
} from "../src/access.js";
import {
  effectiveAccess,
  grantConditions,
  normalizeRestrictions,
  validateCatalog,
  type PermissionDescriptor,
} from "../src/features/identity/domain.js";
import { mergedRestrictions } from "../src/features/identity/repository.js";
import {
  outsideScope,
  restrictResult,
  salesAccessOf,
  salesPermissions,
  sankhyaRestriction,
  vrmasterRestriction,
} from "../src/features/sales/access.js";
import { aggregateSql, queryBindings } from "../src/features/sales/query.js";
import { vrmasterAggregateSql } from "../src/features/sales/vrmaster-query.js";
import { SalesChat } from "../src/features/sales/application.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import {
  assembleResult,
  type SalesQuery,
} from "../src/features/sales/domain.js";
import { emptySalesState } from "../src/features/sales/conversation-state.js";
import { canReadReply } from "../src/features/agent/evidence.js";
import { runAgentTurn } from "../src/features/agent/application.js";
import { runConversationTurn } from "../src/features/agent/conversation.js";
import type {
  AgentCapability,
  AgentReply,
} from "../src/features/agent/capabilities.js";
import type { ConversationModel } from "../src/ai/conversation.js";
import { noTrace } from "../src/ai/trace.js";
import { selectionScopeConflict } from "../src/features/products/sales.js";
import {
  developmentPermissions,
  parameterSetup,
  permissionCatalog,
} from "../src/modules.js";
import { parseServerConfig } from "../src/config.js";
import { interpretation } from "../evals/fixtures.js";
import { signingKey } from "./identity-helpers.js";

const company = (...values: [string, string][]): AccessRule => [
  {
    dimension: "company",
    values: values.map(([value, label]) => ({ value, label })),
  },
];
const restricted = (...rules: AccessRule[]): DataScope => ({
  kind: "restricted",
  rules,
});

describe("data scopes", () => {
  it("unites grants: any unrestricted grant admits everything, equal rules once", () => {
    const filial = company(["3", "FILIAL"]);
    expect(uniteScopes([restricted(filial), unrestricted])).toEqual(
      unrestricted,
    );
    expect(uniteScopes([])).toEqual(unrestricted);
    expect(
      uniteScopes([
        restricted(filial),
        restricted(company(["3", "OUTRO RÓTULO"])),
        restricted(company(["1", "MATRIZ"])),
      ]),
    ).toEqual(restricted(filial, company(["1", "MATRIZ"])));
  });

  it("covers a recorded result only when the reader admits at least as much", () => {
    const filial = recordAccess(restricted(company(["3", "FILIAL"])));
    const both = restricted(company(["1", "MATRIZ"], ["3", "FILIAL"]));
    expect(scopeCovers(unrestricted, filial)).toBe(true);
    expect(scopeCovers(both, filial)).toBe(true);
    // A result without a recorded restriction covered the whole source.
    expect(scopeCovers(both, null)).toBe(false);
    expect(scopeCovers(restricted(company(["1", "MATRIZ"])), filial)).toBe(
      false,
    );
    // A reader also restricted by seller covers less than the company alone.
    expect(
      scopeCovers(
        restricted([
          ...company(["3", "FILIAL"]),
          { dimension: "seller", values: [{ value: "12", label: "ANA" }] },
        ]),
        filial,
      ),
    ).toBe(false);
    expect(
      scopeCovers(
        restricted(company(["3", "FILIAL"])),
        recordAccess(
          restricted([
            ...company(["3", "FILIAL"]),
            { dimension: "seller", values: [{ value: "12", label: "ANA" }] },
          ]),
        ),
      ),
    ).toBe(true);
  });

  it("describes restrictions and denials with codes for support", () => {
    expect(
      describeScope(
        restricted(company(["1", "MATRIZ"], ["3", "FILIAL"]), [
          { dimension: "seller", values: [{ value: "0", label: "0" }] },
        ]),
        salesPermissions.sankhya.restrictions,
      ),
    ).toBe("Empresa: 1 – MATRIZ, 3 – FILIAL ou Vendedor: 0");
    const text = permissionDeniedMessage("consultar as vendas", [
      { info: salesPermissions.vrmaster },
      {
        info: salesPermissions.sankhya,
        outside: company(["3", "FILIAL"])[0],
      },
    ]);
    expect(text).toContain(
      "• VRM-VEN-01 — Consultar vendas · Pilar da Terra (VR Master)",
    );
    expect(text).toContain(
      "• SNK-VEN-01 — Consultar vendas · MNS (Sankhya), com acesso a Empresa (EMP): 3 – FILIAL",
    );
    expect(text).toContain("entre em contato com o suporte");
  });
});

describe("effective access", () => {
  const catalog = permissionCatalog;
  const base = {
    catalog,
    policy: [
      { provider: "sankhya" as const, permission: "sales_sankhya:read" },
    ],
    linkedProviders: [] as ("sankhya" | "pdt")[],
    roles: [] as "owner"[],
  };
  const filial = [
    { dimension: "company", values: [{ value: "3", label: "F" }] },
  ];

  it("derives capability permissions and gives owners everything unrestricted", () => {
    const owner = effectiveAccess({ ...base, grants: [], roles: ["owner"] });
    expect(owner.permissions).toEqual(
      [...developmentPermissions, "identity:admin"].sort(),
    );
    expect(
      [...owner.scopes.values()].every((scope) => scope.kind === "all"),
    ).toBe(true);
    const seller = effectiveAccess({
      ...base,
      grants: [{ permission: "sales_vrmaster:read", restrictions: [] }],
    });
    expect(seller.permissions).toEqual(["sales:read", "sales_vrmaster:read"]);
  });

  it("unites personal and group grants and lets explicit grants override provider policy", () => {
    const linked = { ...base, linkedProviders: ["sankhya" as const] };
    expect(
      effectiveAccess({ ...linked, grants: [] }).scopes.get(
        "sales_sankhya:read",
      ),
    ).toEqual(unrestricted);
    // An explicit restricted grant narrows the automatic one.
    const narrowed = effectiveAccess({
      ...linked,
      grants: [{ permission: "sales_sankhya:read", restrictions: filial }],
    });
    expect(narrowed.scopes.get("sales_sankhya:read")).toEqual(
      restricted(filial),
    );
    expect(narrowed.origins.get("sales_sankhya:read")).toEqual([
      { kind: "grant" },
    ]);
    const grouped = effectiveAccess({
      ...base,
      grants: [{ permission: "sales_sankhya:read", restrictions: filial }],
      groupGrants: [
        {
          groupId: "g",
          permission: "sales_sankhya:read",
          restrictions: [
            { dimension: "seller", values: [{ value: "9", label: "S" }] },
          ],
        },
      ],
    });
    expect(grouped.scopes.get("sales_sankhya:read")).toEqual(
      restricted(filial, [
        { dimension: "seller", values: [{ value: "9", label: "S" }] },
      ]),
    );
    expect(grouped.origins.get("sales_sankhya:read")).toEqual([
      { kind: "grant" },
      { kind: "group", groupId: "g" },
    ]);
  });

  it("ignores grants restricted by a dimension the permission cannot enforce", () => {
    const access = effectiveAccess({
      ...base,
      grants: [
        {
          permission: "products_sankhya:read",
          restrictions: filial,
        },
      ],
    });
    expect(access.permissions).toEqual([]);
  });

  it("normalizes restrictions only to declared dimensions with real codes", () => {
    const sales = catalog[0];
    expect(
      normalizeRestrictions(sales, [
        { dimension: "seller", values: ["12", " 3", "12"] },
        { dimension: "company", values: ["10", "2"] },
      ]),
    ).toEqual([
      { dimension: "company", values: ["2", "10"] },
      { dimension: "seller", values: ["3", "12"] },
    ]);
    for (const invalid of [
      [{ dimension: "store", values: ["1"] }],
      [{ dimension: "company", values: [] }],
      [{ dimension: "company", values: ["1; DROP"] }],
      [
        { dimension: "company", values: ["1"] },
        { dimension: "company", values: ["2"] },
      ],
    ])
      expect(normalizeRestrictions(sales, invalid)).toBeNull();
    expect(
      grantConditions([
        { dimension: "seller", value: "10", label: "B" },
        { dimension: "company", value: "3", label: "F" },
        { dimension: "seller", value: "9", label: "A" },
      ]),
    ).toEqual([
      { dimension: "company", values: [{ value: "3", label: "F" }] },
      {
        dimension: "seller",
        values: [
          { value: "9", label: "A" },
          { value: "10", label: "B" },
        ],
      },
    ]);
  });

  it("refuses ambiguous catalogs", () => {
    const entry = permissionCatalog[0];
    const copy = (change: Partial<PermissionDescriptor>) => ({
      ...entry,
      ...change,
    });
    expect(() =>
      validateCatalog([entry, copy({ permission: "other_sales:read" })]),
    ).toThrow("duplicate permission code");
    expect(() => validateCatalog([copy({ code: "SNK-VEN" })])).toThrow();
    expect(() => validateCatalog([copy({ permission: "sales:read" })])).toThrow(
      "Invalid identity permission",
    );
    expect(() => validateCatalog(permissionCatalog)).not.toThrow();
  });

  it("consolidates restricted grants without widening them", () => {
    const row = (dimension: string, value: string) => ({
      dimension,
      value,
      label: value,
    });
    const target = [row("company", "1")];
    expect(mergedRestrictions([], [row("company", "2")])).toEqual([]);
    expect(mergedRestrictions(target, [])).toEqual([]);
    expect(mergedRestrictions(target, [row("company", "2")])).toEqual([
      row("company", "1"),
      row("company", "2"),
    ]);
    // Different dimensions cannot be united exactly: the survivor's is kept.
    expect(mergedRestrictions(target, [row("seller", "2")])).toBe(target);
    expect(
      mergedRestrictions(
        [row("company", "1"), row("seller", "1")],
        [row("company", "2"), row("seller", "2")],
      ),
    ).toEqual([row("company", "1"), row("seller", "1")]);
  });
});

describe("restricted sales SQL", () => {
  const query: SalesQuery = {
    metric: "net_value",
    groupBy: "total",
    comparison: "none",
    productSearch: null,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  };
  const scope = restricted(
    [
      ...company(["1", "M"], ["3", "F"]),
      { dimension: "project", values: [{ value: "40", label: "P" }] },
    ],
    [{ dimension: "seller", values: [{ value: "0", label: "S" }] }],
  );

  it("binds every Sankhya value and filters both reference selections", () => {
    const compiled = sankhyaRestriction(scope)!;
    expect(compiled.binds).toEqual({
      acc_0_0_0: 1,
      acc_0_0_1: 3,
      acc_0_1_0: 40,
      acc_1_0_0: 0,
    });
    expect(compiled.sql).toBe(
      "((CAB.CODEMP IN (:acc_0_0_0, :acc_0_0_1) AND NVL(ITE.AD_CODPROJ, 0) IN (SELECT RP.CODPROJ FROM TCSPRJ RP START WITH RP.CODPROJ IN (:acc_0_1_0) CONNECT BY NOCYCLE PRIOR RP.CODPROJ = RP.CODPROJPAI)) OR (CAB.CODVEND IN (:acc_1_0_0)))",
    );
    const sql = aggregateSql(query, undefined, scope);
    expect(sql.split(compiled.sql)).toHaveLength(3);
    expect(queryBindings(query, scope)).toMatchObject(compiled.binds);
    expect(sankhyaRestriction(unrestricted)).toBeNull();
    expect(aggregateSql(query)).not.toContain("acc_");
    expect(() =>
      sankhyaRestriction(
        restricted([
          { dimension: "store", values: [{ value: "1", label: "" }] },
        ]),
      ),
    ).toThrow("Unenforceable");
  });

  it("numbers VR Master parameters after the query and product values", () => {
    const compiled = vrmasterRestriction(
      restricted([
        { dimension: "store", values: [{ value: "2", label: "L" }] },
        { dimension: "buyer", values: [{ value: "5", label: "A" }] },
      ]),
      6,
    )!;
    expect(compiled).toEqual({
      sql: "((venda.id_loja = ANY($7::int[]) AND venda.id_comprador = ANY($8::int[])))",
      values: [[2], [5]],
    });
    const sql = vrmasterAggregateSql(query, undefined, compiled.sql);
    expect(sql).toContain(`WHERE ${compiled.sql} AND venda.data`);
  });
});

describe("sales access", () => {
  const reader = (calls: unknown[]): SalesReader => ({
    read: vi.fn((_query, _signal, _products, restriction) => {
      calls.push(restriction);
      return Promise.resolve({
        current: {
          rows: [{ period: "total", product: null, unit: "BRL", value: "5" }],
          products: [],
          missingWeight: false,
        },
        previous: null,
      });
    }),
    close: () => Promise.resolve(),
  });
  const setup = () => {
    const calls = { sankhya: [] as unknown[], vrmaster: [] as unknown[] };
    const interpreter: SalesInterpreter = {
      interpret: vi.fn(() =>
        Promise.resolve(
          interpretation({
            measure: "net_value",
            period: {
              kind: "last",
              unit: "month",
              count: 1,
              includeCurrent: false,
            },
            groupBy: "total",
          }),
        ),
      ),
    };
    const chat = new SalesChat(
      interpreter,
      { sankhya: reader(calls.sankhya), vrmaster: reader(calls.vrmaster) },
      undefined,
      () => new Date("2026-10-20T15:00:00Z"),
    );
    const execute = (
      selection: "sankhya" | "vrmaster" | "all",
      access: ReturnType<typeof salesAccessOf>,
    ) =>
      chat.execute(
        "Vendas do mês passado",
        "00000000-0000-4000-8000-000000000001",
        emptySalesState,
        new AbortController().signal,
        undefined,
        undefined,
        { selection, access },
      );
    return { calls, interpreter, execute };
  };

  it("answers without interpreting when no selected source may be read", async () => {
    const env = setup();
    const turn = await env.execute(
      "vrmaster",
      salesAccessOf(new Set(["sales:read", "sales_sankhya:read"])),
    );
    expect(turn.reply.kind).toBe("unsupported");
    expect(turn.reply.message).toContain("VRM-VEN-01");
    expect(env.interpreter.interpret).not.toHaveBeenCalled();
    expect(env.calls.vrmaster).toHaveLength(0);
  });

  it("reports a denied source beside the permitted one and restricts its figures", async () => {
    const env = setup();
    const scope = restricted(company(["3", "FILIAL"]));
    const turn = await env.execute(
      "all",
      salesAccessOf(
        new Set(["sales:read", "sales_sankhya:read"]),
        new Map([["sales_sankhya:read", scope]]),
      ),
    );
    expect(env.calls.sankhya).toEqual([scope]);
    expect(env.calls.vrmaster).toHaveLength(0);
    const sections = turn.reply.answer!.sections;
    expect(sections.map((section) => [section.status, section.reason])).toEqual(
      [
        ["answered", null],
        ["denied", "access_denied"],
      ],
    );
    expect(sections[0].result?.access).toEqual({
      rules: [[{ dimension: "company", values: ["3"] }]],
    });
    expect(sections[0].result?.warnings[0]).toBe(
      "Resultado limitado ao seu acesso (SNK-VEN-01): Empresa: 3 – FILIAL. Não é o total da fonte.",
    );
    expect(turn.reply.message).toContain(
      "Pilar da Terra (VR Master): você não tem permissão para consultar as vendas desta fonte. Permissão necessária: VRM-VEN-01",
    );
  });

  it("passes no restriction to an unrestricted source", async () => {
    const env = setup();
    await env.execute(
      "sankhya",
      salesAccessOf(new Set(["sales:read", "sales_sankhya:read"])),
    );
    expect(env.calls.sankhya).toEqual([undefined]);
  });

  it("names the restricted values a product selection asks for", () => {
    const access = salesAccessOf(
      new Set(["sales_vrmaster:read"]),
      new Map([
        [
          "sales_vrmaster:read",
          restricted([
            { dimension: "buyer", values: [{ value: "5", label: "ANA" }] },
          ]),
        ],
      ]),
    );
    const selection = (id: number, label: string) => ({
      criteria: [
        {
          kind: "entity" as const,
          dimension: "buyer",
          mode: "include" as const,
          text: label,
          matched: [{ id, label, active: true }],
          values: [{ id, label, active: true }],
        },
      ],
    });
    expect(
      selectionScopeConflict("vrmaster", selection(5, "ANA"), access),
    ).toBe(null);
    const conflict = selectionScopeConflict(
      "vrmaster",
      selection(6, "BRUNO"),
      access,
    );
    expect(conflict).toContain(
      "VRM-VEN-01 — Consultar vendas · Pilar da Terra (VR Master), com acesso a Comprador (COM): 6 – BRUNO",
    );
    expect(
      outsideScope(unrestricted, "buyer", [{ value: "6", label: "B" }]),
    ).toEqual([]);
  });
});

describe("history under narrowed access", () => {
  const sales: AgentCapability = {
    id: "sales",
    title: "Consultas de vendas",
    description: "Sales",
    examples: [],
    permission: "sales:read",
    sourcePermissions: salesPermissions,
    execute: vi.fn(),
    close: () => Promise.resolve(),
  };
  const result = (access?: DataScope) =>
    restrictResult(
      assembleResult(
        {
          metric: "net_value",
          groupBy: "total",
          comparison: "none",
          productSearch: null,
          startDate: "2026-09-01",
          endDate: "2026-09-30",
        },
        {
          rows: [{ period: "total", product: null, unit: "BRL", value: "1" }],
          products: [],
          missingWeight: false,
        },
        null,
        "sankhya",
      ),
      "sankhya",
      access,
    );
  const reply = (access?: DataScope): AgentReply => ({
    kind: "answer",
    message: "",
    capabilityId: "sales",
    suggestions: [],
    result: {
      selection: "sankhya",
      sections: [
        {
          source: "sankhya",
          status: "answered",
          reason: null,
          result: result(access),
        },
      ],
    },
  });
  const held = new Set(["sales:read", "sales_sankhya:read"]);
  const scopes = (scope: DataScope) => new Map([["sales_sankhya:read", scope]]);

  it("shows figures only to readers who still cover their scope", () => {
    const filial = restricted(company(["3", "FILIAL"]));
    expect(canReadReply(reply(), held, [sales], scopes(unrestricted))).toBe(
      true,
    );
    expect(canReadReply(reply(), held, [sales], scopes(filial))).toBe(false);
    expect(canReadReply(reply(filial), held, [sales], scopes(filial))).toBe(
      true,
    );
    expect(
      canReadReply(
        reply(filial),
        new Set(["sales:read", "sales_vrmaster:read"]),
        [sales],
      ),
    ).toBe(false);
  });
});

describe("agent denials", () => {
  const sales: AgentCapability = {
    id: "sales",
    title: "Consultas de vendas",
    description: "Sales",
    examples: [],
    permission: "sales:read",
    sourcePermissions: salesPermissions,
    execute: vi.fn(),
    close: () => Promise.resolve(),
  };
  const input = (
    permissions: string[],
    source: "sankhya" | "vrmaster" | "all",
  ) => ({
    actor: { id: "alice", permissions: new Set(permissions) },
    message: "Quanto vendemos?",
    history: [],
    contexts: {},
    signal: new AbortController().signal,
    progress: () => Promise.resolve(),
    trace: noTrace,
    source,
  });

  it("answers a routed request for a source the person may not read with its code", async () => {
    const route = vi.fn(() =>
      Promise.resolve({ intent: "capability" as const, capabilityId: "sales" }),
    );
    const { reply } = await runAgentTurn(
      { route },
      [sales],
      input(["sales:read", "sales_sankhya:read"], "vrmaster"),
    );
    expect(sales.execute).not.toHaveBeenCalled();
    expect(reply).toMatchObject({
      kind: "unavailable",
      capabilityId: null,
      result: null,
    });
    expect(reply.message).toBe(
      "Você não tem permissão para usar consultas de vendas na fonte Pilar da Terra (VR Master).\n\nPermissão necessária:\n• VRM-VEN-01 — Consultar vendas · Pilar da Terra (VR Master)\n\nSe precisar desse acesso, entre em contato com o suporte e informe o código acima para a liberação.",
    );
    // With "all", one held source is enough to run the capability.
    const permitted = await runAgentTurn(
      {
        route: () =>
          Promise.resolve({ intent: "greeting" as const, capabilityId: null }),
      },
      [sales],
      input(["sales:read", "sales_sankhya:read"], "all"),
    );
    expect(permitted.reply.message).toContain("consultas de vendas");
  });

  it("lets the conversation model report a missing permission, written by the server", async () => {
    const requests: string[] = [];
    const model: ConversationModel = {
      provider: "synthetic",
      model: "scripted",
      invoke: vi.fn((request: Parameters<ConversationModel["invoke"]>[0]) => {
        requests.push(request.instructions);
        expect(request.tools.map((tool) => tool.name)).toContain(
          "report_missing_permission",
        );
        return Promise.resolve({
          kind: "tool_calls" as const,
          calls: [
            {
              id: "call",
              name: "report_missing_permission",
              arguments: { capabilityId: "sales" },
            },
          ],
          continuation: {},
          invocation: {
            provider: "synthetic",
            model: "scripted",
            latencyMs: 1,
            inputTokens: 1,
            outputTokens: 1,
          },
        });
      }),
    };
    const { reply } = await runConversationTurn(
      model,
      [sales],
      input([], "all"),
    );
    expect(requests[0]).toContain("may not use with the selected source");
    expect(reply.kind).toBe("unavailable");
    expect(reply.message).toContain("SNK-VEN-01");
    expect(reply.message).toContain("VRM-VEN-01");
    expect(sales.execute).not.toHaveBeenCalled();
  });
});

describe("composition", () => {
  const identityEnv = {
    ORION_ENV: "test",
    IA_MNS_PUBLIC_ORIGIN: "http://localhost:5173",
    IA_MNS_IDENTITY_SIGNING_KEY: signingKey(),
    IA_MNS_IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64url"),
  };

  it("never composes implicit permissions from provider links or retired settings", () => {
    expect(
      permissionCatalog.every((item) => item.autoGrantProviders.length === 0),
    ).toBe(true);
    const defaults = parameterSetup(
      parseServerConfig({
        ...identityEnv,
        IA_MNS_PROVIDER_GRANTS: "sankhya:sales:read",
      }),
    ).defaults;
    expect(defaults).not.toHaveProperty("access.providerGrants");
  });
});
