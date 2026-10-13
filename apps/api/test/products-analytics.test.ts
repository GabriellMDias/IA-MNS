import { expect, it, vi } from "vitest";
import { noTrace } from "../src/ai/trace.js";
import type { CapabilityInput } from "../src/features/agent/capabilities.js";
import { createSalesAnalyticsCapability } from "../src/features/products/analytics.js";
import type { ProductInterpreter } from "../src/features/products/interpreter.js";
import { ProductResolver } from "../src/features/products/resolver.js";
import type { ProductSource } from "../src/features/products/source.js";
import {
  emptyProductState,
  type ProductState,
} from "../src/features/products/state.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import type { ProductSelection } from "../src/features/products/selection.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import type { SalesProductScope } from "../src/features/sales/product-scope.js";
import type { SemanticSalesPlan } from "../src/features/sales/semantic.js";

const plan: SemanticSalesPlan = {
  metrics: ["net_value", "quantity"],
  dimensions: [],
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  comparison: "none",
};
const criterion = (text: string): ProductSelection["criteria"][number] => ({
  kind: "text",
  dimension: "description",
  mode: "include",
  text,
  phrase: text,
});
const selection = { criteria: [criterion("banana")] };
function setup() {
  const interpreter: ProductInterpreter = {
    interpret: vi.fn(() =>
      Promise.resolve({
        decision: "resolve" as const,
        relation: "new" as const,
        choice: null,
        criteria: [
          {
            dimension: "description",
            mode: "include" as const,
            text: "banana",
            qualifier: null,
            searchTerms: [],
          },
        ],
        unsupportedReason: null,
      }),
    ),
    select: vi.fn(),
  };
  const scope: SalesProductScope = {
    source: "vrmaster",
    catalogVersion: vrmasterCatalog.version,
    description: "Synthetic complete product selection",
    keysSql: "SELECT id FROM public.produto WHERE id >= $5",
    values: [1],
  };
  const source: ProductSource = {
    catalog: vrmasterCatalog,
    categoryCandidates: vi.fn(),
    findRecords: vi.fn(),
    listRecords: vi.fn(),
    find: vi.fn(() =>
      Promise.resolve({
        total: 450,
        products: [
          {
            code: "1",
            description: "SYNTHETIC BANANA",
            classification: "SYNTHETIC",
          },
        ],
        sections: [],
      }),
    ),
    salesScope: vi.fn(() => Promise.resolve(scope)),
    close: vi.fn(() => Promise.resolve()),
  };
  const readMany = vi.fn<NonNullable<SalesReader["readMany"]>>((queries) =>
    Promise.resolve(
      queries.map((query) => ({
        current: {
          rows: [
            {
              period: "total",
              product: null,
              unit: query.metric === "net_value" ? "BRL" : "EMBALAGEM:1",
              value: "450",
            },
          ],
          products: [],
          missingWeight: false,
        },
        previous: null,
      })),
    ),
  );
  const reader: SalesReader = {
    read: vi.fn(),
    readMany,
    close: vi.fn(() => Promise.resolve()),
  };
  const capability = createSalesAnalyticsCapability(
    { vrmaster: reader },
    [new ProductResolver(source, interpreter)],
    () => new Date("2026-10-12T12:00:00Z"),
  );
  const input = (
    overrides: Partial<CapabilityInput> = {},
  ): CapabilityInput => ({
    message:
      "Quanto vendi de banana de julho a setembro? Mostre valor e quantidade.",
    history: [],
    context: null,
    permissions: new Set(["sales:read", "products:read"]),
    source: "vrmaster",
    signal: new AbortController().signal,
    progress: vi.fn(() => Promise.resolve()),
    trace: noTrace,
    ...overrides,
  });
  const tool = capability.tools![0];
  return {
    capability,
    tool,
    input,
    source,
    interpreter,
    reader,
    readMany,
    scope,
  };
}

it("resolves original user conditions and shares the complete membership across dynamically selected measures", async () => {
  const env = setup();
  const outcome = await env.tool.execute(
    { plan, products: { mode: "resolve", text: "untrusted model wording" } },
    env.input(),
  );
  expect(env.interpreter.interpret).toHaveBeenCalledWith(
    expect.objectContaining({ message: env.input().message, purpose: "sales" }),
    expect.anything(),
    expect.anything(),
  );
  expect(env.readMany).toHaveBeenCalledOnce();
  expect(env.readMany.mock.calls[0][2]).toBe(env.scope);
  expect(outcome.reply).toMatchObject({
    kind: "answer",
    capabilityId: "analytics",
    requiredPermissions: ["sales:read", "products:read"],
    result: { kind: "sales_analysis" },
  });
  expect(env.capability.canRead!(outcome.reply, new Set(["sales:read"]))).toBe(
    false,
  );
});

it("reuses an authorized same-source product lookup without another interpretation or materializing its display list", async () => {
  const env = setup();
  const outcome = await env.tool.execute(
    { plan, products: { mode: "reuse", text: null } },
    env.input({
      contexts: {
        products: {
          productSources: {
            vrmaster: {
              catalogVersion: vrmasterCatalog.version,
              state: { ...emptyProductState, active: selection },
            },
          },
        },
      },
    }),
  );
  expect(outcome.reply.kind).toBe("answer");
  expect(env.interpreter.interpret).not.toHaveBeenCalled();
  expect(env.source.find).not.toHaveBeenCalled();
  expect(env.source.salesScope).toHaveBeenCalledWith(
    selection,
    expect.anything(),
  );
});

it("continues a numbered product choice against the persisted structured plan without another model call", async () => {
  const env = setup();
  const pending: ProductState = {
    ...emptyProductState,
    pending: {
      awaiting: "choice",
      asked: {
        dimension: "description",
        mode: "include",
        text: "fruta",
        qualifier: null,
        searchTerms: [],
      },
      resolved: [],
      remaining: [],
      options: [
        { label: "Banana", personal: false, criterion: criterion("banana") },
        { label: "Maçã", personal: false, criterion: criterion("maçã") },
      ],
    },
  };
  const outcome = await env.capability.execute(
    env.input({
      message: "1",
      context: {
        version: 1,
        sources: {
          vrmaster: {
            products: pending,
            catalogVersion: vrmasterCatalog.version,
            pending: { plan, products: { mode: "resolve", text: null } },
          },
        },
      },
    }),
  );
  expect(outcome.reply.kind).toBe("answer");
  expect(outcome.awaiting).toBeNull();
  expect(env.source.salesScope).toHaveBeenCalledWith(
    selection,
    expect.anything(),
  );
  expect(env.interpreter.interpret).not.toHaveBeenCalled();
  expect(env.readMany.mock.calls[0][0]).toHaveLength(2);
});

it.each(["sankhya", "all"] as const)(
  "never reuses the VRMaster selection in %s",
  async (source) => {
    const env = setup();
    const outcome = await env.tool.execute(
      { plan, products: { mode: "reuse", text: null } },
      env.input({
        source,
        context: {
          version: 1,
          sources: {
            vrmaster: {
              products: { ...emptyProductState, active: selection },
              catalogVersion: vrmasterCatalog.version,
              pending: null,
            },
          },
        },
      }),
    );
    expect(outcome.reply.kind).not.toBe("answer");
    expect(env.readMany).not.toHaveBeenCalled();
    expect(env.source.salesScope).not.toHaveBeenCalled();
  },
);

it("blocks stale catalog state without silently reverting to unfiltered totals", async () => {
  const env = setup();
  const outcome = await env.tool.execute(
    { plan, products: { mode: "reuse", text: null } },
    env.input({
      context: {
        version: 1,
        sources: {
          vrmaster: {
            products: { ...emptyProductState, active: selection },
            catalogVersion: "outdated",
            pending: null,
          },
        },
      },
    }),
  );
  expect(outcome.reply.kind).toBe("clarification");
  expect(env.readMany).not.toHaveBeenCalled();
});

it("retains the original product request when a pending all-source analysis resumes in one ERP", async () => {
  const env = setup();
  const first = await env.tool.execute(
    { plan, products: { mode: "resolve", text: null } },
    env.input({ source: "all" }),
  );
  expect(first.awaiting).toEqual(["source"]);
  expect(env.readMany).not.toHaveBeenCalled();
  const outcome = await env.capability.execute(
    env.input({
      message: "Selecionei o VR Master.",
      context: first.context,
    }),
  );
  expect(outcome.reply.kind).toBe("answer");
  expect(env.interpreter.interpret).toHaveBeenCalledWith(
    expect.objectContaining({ message: env.input().message }),
    expect.anything(),
    expect.anything(),
  );
  expect(env.source.salesScope).toHaveBeenCalledWith(
    { criteria: [{ ...selection.criteria[0], phrase: "BANANA" }] },
    expect.anything(),
  );
  expect(outcome.context).toMatchObject({
    sources: { all: { pending: null, request: null } },
  });
});

it("requires product permission only for semantic selection, while permitting authorized unfiltered analytics", async () => {
  const env = setup();
  const input = env.input({ permissions: new Set(["sales:read"]) });
  await expect(
    env.tool.execute(
      { plan, products: { mode: "resolve", text: null } },
      input,
    ),
  ).rejects.toThrow("AGENT_ACCESS_DENIED");
  expect(env.source.find).not.toHaveBeenCalled();
  expect(env.readMany).not.toHaveBeenCalled();
  const outcome = await env.tool.execute(
    { plan, products: { mode: "all", text: null } },
    input,
  );
  expect(outcome.reply.requiredPermissions).toEqual(["sales:read"]);
  expect(outcome.reply.kind).toBe("answer");
});

it("rejects unsupported tool properties before resolving products or reading any ERP", async () => {
  const env = setup();
  await expect(
    env.tool.execute(
      {
        plan: { ...plan, sql: "SELECT private FROM any_table" },
        products: { mode: "all", text: null },
      },
      env.input(),
    ),
  ).rejects.toThrow("SALES_QUERY_INVALID");
  expect(env.readMany).not.toHaveBeenCalled();
  expect(env.interpreter.interpret).not.toHaveBeenCalled();
});

it("leaves shared reader and resolver lifecycle ownership with the existing capabilities", async () => {
  const env = setup();
  await env.capability.close();
  expect(env.reader.close).not.toHaveBeenCalled();
  expect(env.source.close).not.toHaveBeenCalled();
});
