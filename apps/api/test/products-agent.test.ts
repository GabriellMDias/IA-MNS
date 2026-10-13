import { randomUUID } from "node:crypto";
import pino from "pino";
import { expect, it, vi } from "vitest";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import { createDatabase } from "../src/database.js";
import { activateModules } from "../src/module.js";
import { apiModules } from "../src/modules.js";
import { createOpenAiModel } from "../src/ai/openai.js";
import { productModelTimeoutMs } from "../src/features/products/interpreter.js";
import type { TurnView } from "../src/features/agent/contracts.js";
import type { SemanticCatalog } from "../src/features/products/catalog.js";
import type { ProductSource } from "../src/features/products/source.js";
import { vrmasterCatalog } from "../src/features/products/vrmaster/catalog.js";
import { sankhyaCatalog } from "../src/features/products/sankhya/catalog.js";
import { createVrmasterProductSource } from "../src/features/products/vrmaster/source.js";
import { createSankhyaProductSource } from "../src/features/products/sankhya/source.js";
import { createSalesReaders } from "../src/features/sales/readers.js";

vi.mock("../src/features/products/vrmaster/source.js", () => ({
  createVrmasterProductSource: vi.fn(),
}));
vi.mock("../src/features/products/sankhya/source.js", () => ({
  createSankhyaProductSource: vi.fn(),
}));
vi.mock("../src/features/sales/readers.js", () => ({
  createSalesReaders: vi.fn(),
}));
vi.mock("../src/ai/openai.js", async (original) => {
  const implementation = await original<typeof import("../src/ai/openai.js")>();
  return { createOpenAiModel: vi.fn(implementation.createOpenAiModel) };
});

function source(catalog: SemanticCatalog): ProductSource {
  return {
    catalog,
    categoryCandidates: vi.fn(),
    findRecords: vi.fn(),
    listRecords: vi.fn(),
    find: vi.fn(() =>
      Promise.resolve({
        total: 1,
        products: [
          {
            code: "1",
            description: "SYNTHETIC PRODUCT",
            classification: "SYNTHETIC GROUP",
          },
        ],
        sections: [],
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
    salesScope: vi.fn(() =>
      Promise.resolve(
        catalog.source.id === "vrmaster"
          ? {
              source: "vrmaster" as const,
              catalogVersion: catalog.version,
              description: "Synthetic complete scope",
              keysSql: "SELECT id FROM public.produto",
              values: [],
            }
          : {
              source: "sankhya" as const,
              catalogVersion: catalog.version,
              description: "Synthetic complete scope",
              keysSql: "SELECT CODPROD FROM TGFPRO",
              binds: {},
            },
      ),
    ),
  };
}

it("composes both resolvers through authenticated conversation HTTP with permission, source isolation and replay protection", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const database = createDatabase(runtimeUrl);
    const vr = source(vrmasterCatalog);
    const sk = source(sankhyaCatalog);
    vi.mocked(createVrmasterProductSource).mockReturnValue(vr);
    vi.mocked(createSankhyaProductSource).mockReturnValue(sk);
    const salesRead = vi.fn(() =>
      Promise.resolve({
        current: {
          rows: [{ period: "total", product: null, unit: "BRL", value: "10" }],
          products: [],
          missingWeight: false,
        },
        previous: null,
      }),
    );
    vi.mocked(createSalesReaders).mockReturnValue({
      vrmaster: { read: salesRead, close: () => Promise.resolve() },
      sankhya: { read: salesRead, close: () => Promise.resolve() },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, options: RequestInit) => {
        const body = JSON.parse(
          typeof options.body === "string" ? options.body : "{}",
        ) as {
          tools: { name: string }[];
          input: { content: string }[];
        };
        const name = body.tools[0].name;
        const value =
          name === "interpret_product_request"
            ? {
                decision: "resolve",
                relation: "new",
                choice: null,
                criteria: [
                  {
                    dimension: "description",
                    mode: "include",
                    text: "synthetic",
                    qualifier: null,
                    searchTerms: [],
                  },
                ],
                unsupportedReason: null,
              }
            : name === "interpret_sales_message"
              ? {
                  decision: "analyze",
                  relation: "new",
                  measure: "net_value",
                  filters: [],
                  period: {
                    kind: "range",
                    unit: null,
                    count: null,
                    includeCurrent: null,
                    month: null,
                    year: null,
                    startDate: "2026-09-01",
                    endDate: "2026-09-30",
                  },
                  groupBy: "total",
                  comparison: "none",
                  clarification: null,
                  unsupportedReason: null,
                  productMode: body.input.at(-1)?.content.includes("semânticas")
                    ? "resolve"
                    : "reuse",
                }
              : {
                  intent: "capability",
                  capabilityId: body.input.at(-1)?.content.startsWith("Vendas")
                    ? "sales"
                    : "products",
                };
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output: [
                {
                  type: "function_call",
                  name,
                  call_id: "synthetic",
                  arguments: JSON.stringify(value),
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const config = parseServerConfig({
      ORION_ENV: "test",
      OPENAI_API_KEY: "synthetic-key",
      IA_MNS_AGENT_MODE: "legacy",
      VRMASTER_DB_HOST: "vr.invalid",
      VRMASTER_DB_NAME: "synthetic",
      VRMASTER_DB_USER: "synthetic_reader",
      VRMASTER_DB_PASSWORD: "synthetic-password",
      VRMASTER_DB_SSL_MODE: "disable",
      SANKHYA_DB_USER: "synthetic_reader",
      SANKHYA_DB_PASSWORD: "synthetic-password",
      SANKHYA_DB_CONNECT_STRING: "sk.invalid/service",
    });
    let permissions = new Set<string>();
    const { app } = createApp(pino({ level: "silent" }), undefined, {
      modules: activateModules(
        apiModules,
        {
          config,
          database,
          verifier: {
            verify: (authorization) =>
              Promise.resolve(
                authorization === "Bearer synthetic"
                  ? { id: "synthetic-user", scopes: permissions }
                  : null,
              ),
          },
        },
        "test",
      ),
    });
    const headers = { authorization: "Bearer synthetic" };
    try {
      expect(createOpenAiModel).toHaveBeenCalledWith(
        config,
        expect.any(Function),
        { timeoutMs: productModelTimeoutMs },
      );
      expect(
        (await app.inject({ method: "POST", url: "/agent/conversations" }))
          .statusCode,
      ).toBe(401);
      const created = await app.inject({
        method: "POST",
        url: "/agent/conversations",
        headers,
        payload: {},
      });
      expect(created.statusCode).toBe(201);
      const id = created.json<{ id: string }>().id;
      let targetId = id;
      const submit = async (
        erp: "vrmaster" | "sankhya" | "all",
        requestId = randomUUID(),
        message = "Quais produtos contêm synthetic na descrição?",
      ) => {
        const response = await app.inject({
          method: "POST",
          url: `/agent/conversations/${targetId}/turns`,
          headers,
          payload: {
            message,
            source: erp,
            requestId,
          },
        });
        expect(response.statusCode).toBe(202);
        let detail!: { turns: TurnView[] };
        await vi.waitFor(
          async () => {
            detail = (
              await app.inject({
                method: "GET",
                url: `/agent/conversations/${targetId}`,
                headers,
              })
            ).json<{ turns: TurnView[] }>();
            expect(detail.turns.at(-1)?.state).not.toBe("running");
          },
          { timeout: 5000 },
        );
        return detail.turns.at(-1)!;
      };
      expect((await submit("vrmaster")).failureCode).toBe(
        "AGENT_ACCESS_DENIED",
      );
      expect(vr.find).not.toHaveBeenCalled();
      expect(sk.find).not.toHaveBeenCalled();
      permissions = new Set(["products:read"]);
      const requestId = randomUUID();
      expect((await submit("vrmaster", requestId)).reply?.result).toMatchObject(
        { kind: "products", source: "vrmaster", total: 1 },
      );
      await submit("vrmaster", requestId);
      expect(vr.find).toHaveBeenCalledOnce();
      expect(sk.find).not.toHaveBeenCalled();
      expect((await submit("sankhya")).reply?.result).toMatchObject({
        kind: "products",
        source: "sankhya",
        total: 1,
      });
      expect(sk.find).toHaveBeenCalledOnce();
      const salesMessage = "Vendas desses produtos em setembro de 2026.";
      expect(
        (await submit("vrmaster", randomUUID(), salesMessage)).failureCode,
      ).toBe("AGENT_ACCESS_DENIED");
      expect(salesRead).not.toHaveBeenCalled();
      permissions = new Set(["sales:read"]);
      // Product history remains protected after removing products permission.
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/agent/conversations/${id}`,
            headers,
          })
        ).statusCode,
      ).toBe(403);
      targetId = (
        await app.inject({
          method: "POST",
          url: "/agent/conversations",
          headers,
          payload: {},
        })
      ).json<{ id: string }>().id;
      expect(
        (await submit("vrmaster", randomUUID(), salesMessage)).failureCode,
      ).toBe("AGENT_ACCESS_DENIED");
      expect(salesRead).not.toHaveBeenCalled();
      permissions = new Set(["sales:read", "products:read"]);
      targetId = id;
      for (const erp of ["vrmaster", "sankhya"] as const) {
        expect(
          (await submit(erp, randomUUID(), salesMessage)).reply?.result,
        ).toMatchObject({
          sections: [
            { source: erp, result: { productSelection: { source: erp } } },
          ],
        });
      }
      expect(salesRead).toHaveBeenCalledTimes(2);
      targetId = (
        await app.inject({
          method: "POST",
          url: "/agent/conversations",
          headers,
          payload: {},
        })
      ).json<{ id: string }>().id;
      const semanticRequestId = randomUUID();
      const semanticMessage =
        "Vendas semânticas de synthetic em setembro de 2026.";
      expect(
        (await submit("vrmaster", semanticRequestId, semanticMessage)).reply
          ?.kind,
      ).toBe("answer");
      permissions = new Set(["sales:read"]);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/agent/conversations/${targetId}`,
            headers,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/agent/conversations/${targetId}/turns`,
            headers,
            payload: {
              message: semanticMessage,
              source: "vrmaster",
              requestId: semanticRequestId,
            },
          })
        ).statusCode,
      ).toBe(403);
      expect(salesRead).toHaveBeenCalledTimes(3);
      permissions = new Set(["sales:read", "products:read"]);
      targetId = id;
      expect((await submit("all")).reply?.kind).toBe("clarification");
      expect(vr.find).toHaveBeenCalledTimes(2);
      expect(sk.find).toHaveBeenCalledOnce();
      const saved = await database.agentConversation.findUniqueOrThrow({
        where: { id },
      });
      expect(saved.contexts).toMatchObject({
        products: {
          productSources: {
            vrmaster: { catalogVersion: vrmasterCatalog.version },
            sankhya: { catalogVersion: sankhyaCatalog.version },
          },
        },
      });
    } finally {
      await app.close();
      await database.$disconnect();
      vi.unstubAllGlobals();
    }
    expect(vr.close).toHaveBeenCalledOnce();
    expect(sk.close).toHaveBeenCalledOnce();
  });
}, 120000);
