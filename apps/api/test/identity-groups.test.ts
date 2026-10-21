import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import pino from "pino";
import pg from "pg";
import type { InjectOptions } from "fastify";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase } from "../src/database.js";
import { createApp } from "../src/app.js";
import { parseServerConfig } from "../src/config.js";
import {
  createLocalAccessTokenVerifier,
  issuerPublicJwk,
} from "../src/authentication.js";
import {
  createIdentityModule,
  identityServiceFor,
} from "../src/features/identity/module.js";
import { operationalParameters, permissionCatalog } from "../src/modules.js";
import { totpCode } from "../src/features/identity/secrets.js";
import { createAgentModule } from "../src/features/agent/module.js";
import { CorporateAgent } from "../src/features/agent/application.js";
import {
  AgentRepository,
  transferConversations,
} from "../src/features/agent/prisma-repository.js";
import type { AgentPlanner } from "../src/features/agent/planner.js";
import type { TurnView } from "../src/features/agent/contracts.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import type { DataScope, RestrictionOption } from "../src/access.js";
import { interpretation } from "../evals/fixtures.js";
import { signingKey } from "./identity-helpers.js";

const ORIGIN = "http://localhost:5173";
type ErrorBody = { error: { code: string } };

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of value) {
    current = (current << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Synthetic ERP values; the real directory reads the sales registrations. */
const values: Record<string, Record<string, RestrictionOption[]>> = {
  "sales_sankhya:read": {
    company: [
      { value: "1", label: "MATRIZ", detail: null },
      { value: "3", label: "FILIAL", detail: "MNS FILIAL LTDA" },
    ],
  },
  "sales_vrmaster:read": {
    buyer: [
      { value: "5", label: "ANA", detail: "Ativo" },
      { value: "6", label: "BRUNO", detail: "Ativo" },
    ],
  },
};
const restrictions = () => ({
  search: vi.fn((permission: string, dimension: string, query: string) =>
    Promise.resolve(
      (values[permission]?.[dimension] ?? []).filter((item) =>
        `${item.value} ${item.label}`.includes(query.toUpperCase()),
      ),
    ),
  ),
  resolve: vi.fn(
    (permission: string, dimension: string, wanted: readonly string[]) =>
      Promise.resolve(
        (values[permission]?.[dimension] ?? []).filter((item) =>
          wanted.includes(item.value),
        ),
      ),
  ),
  close: () => Promise.resolve(),
});

function readers() {
  const calls: { source: string; restriction: DataScope | undefined }[] = [];
  const reader = (source: string): SalesReader => ({
    read: (_query, _signal, _products, restriction) => {
      calls.push({ source, restriction });
      return Promise.resolve({
        current: {
          rows: [
            { period: "total", product: null, unit: "BRL", value: "10.5" },
          ],
          products: [],
          missingWeight: false,
        },
        previous: null,
      });
    },
    close: () => Promise.resolve(),
  });
  return {
    calls,
    readers: { sankhya: reader("sankhya"), vrmaster: reader("vrmaster") },
  };
}

async function setup(runtimeUrl: string) {
  const key = signingKey();
  const config = parseServerConfig({
    ORION_ENV: "test",
    ORION_DATABASE_URL: runtimeUrl,
    IA_MNS_PUBLIC_ORIGIN: ORIGIN,
    IA_MNS_IDENTITY_SIGNING_KEY: key,
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
  });
  const database = createDatabase(runtimeUrl);
  const verifier = createLocalAccessTokenVerifier({
    issuer: ORIGIN,
    audience: config.identityAudience,
    keys: { keys: [issuerPublicJwk(key)] },
  });
  const resources = { config, database, verifier };
  const directory = restrictions();
  const ports = {
    transferOwnership: transferConversations,
    parameters: operationalParameters,
    restrictions: () => directory,
  };
  const service = identityServiceFor(
    config,
    resources,
    permissionCatalog,
    ports,
  )!;
  const router: AgentPlanner = {
    route: () =>
      Promise.resolve({ intent: "capability", capabilityId: "sales" }),
  };
  const interpreter: SalesInterpreter = {
    interpret: () =>
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
  };
  const sales = readers();
  const agent = new CorporateAgent(new AgentRepository(database), router, [
    createSalesCapability(
      config,
      new SalesChat(
        interpreter,
        sales.readers,
        undefined,
        () => new Date("2026-10-20T15:00:00Z"),
      ),
    ),
  ]);
  const identity = createIdentityModule(
    permissionCatalog,
    ports,
    () => service,
  ).activate(resources);
  // The agent computes access now from identity, as composition does.
  const agentModule = createAgentModule(
    () => [],
    agent,
    [],
    undefined,
    undefined,
    () => (personId) => service.accessSnapshot(personId),
  ).activate(resources);
  const { app } = createApp(pino({ level: "silent" }), undefined, {
    modules: [identity, agentModule],
  });
  await app.ready();
  return { app, database, service, sales, directory };
}

type App = Awaited<ReturnType<typeof setup>>["app"];
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
let client = 0;
const inject = (app: App, options: InjectOptions) => {
  client += 1;
  return app.inject({
    ...options,
    remoteAddress: `198.51.100.${(client % 250) + 1}`,
  });
};

async function ownerToken(
  app: App,
  service: { createBootstrapTicket(breakGlass: boolean): Promise<string> },
) {
  const boot = await inject(app, {
    method: "POST",
    url: "/identity/bootstrap",
    payload: {
      token: await service.createBootstrapTicket(false),
      displayName: "Dona",
      login: "dona",
      password: "uma frase de acesso segura",
    },
  });
  const bootToken = boot.json<{ accessToken: string }>().accessToken;
  const totp = (
    await inject(app, {
      method: "POST",
      url: "/identity/me/totp",
      payload: {},
      headers: bearer(bootToken),
    })
  ).json<{ setup: string; secret: string }>();
  return (
    await inject(app, {
      method: "POST",
      url: "/identity/me/totp/confirm",
      payload: {
        setup: totp.setup,
        code: totpCode(
          base32Decode(totp.secret),
          Math.floor(Date.now() / 30_000),
        ),
      },
      headers: bearer(bootToken),
    })
  ).json<{ accessToken: string }>().accessToken;
}

/** An invited Person who signs in with a password of their own. */
async function member(app: App, owner: string, displayName: string) {
  const created = (
    await inject(app, {
      method: "POST",
      url: "/identity/admin/persons",
      payload: { displayName, localInvitation: true },
      headers: bearer(owner),
    })
  ).json<{ personId: string; enrollmentToken: string }>();
  const enrolled = await inject(app, {
    method: "POST",
    url: "/identity/invitations/complete",
    payload: {
      purpose: "enrollment",
      token: created.enrollmentToken,
      login: displayName.toLowerCase(),
      password: "outra frase longa e segura",
    },
  });
  return {
    personId: created.personId,
    token: enrolled.json<{ accessToken: string }>().accessToken,
  };
}

async function turn(
  app: App,
  token: string,
  source: "sankhya" | "vrmaster" | "all",
): Promise<TurnView & { conversationId: string }> {
  const id = (
    await inject(app, {
      method: "POST",
      url: "/agent/conversations",
      payload: {},
      headers: bearer(token),
    })
  ).json<{ id: string }>().id;
  expect(
    (
      await inject(app, {
        method: "POST",
        url: `/agent/conversations/${id}/turns`,
        payload: {
          message: "Quanto vendemos no mês passado?",
          requestId: randomUUID(),
          source,
        },
        headers: bearer(token),
      })
    ).statusCode,
  ).toBe(202);
  let last!: TurnView;
  await vi.waitFor(
    async () => {
      const detail = (
        await inject(app, {
          method: "GET",
          url: `/agent/conversations/${id}`,
          headers: bearer(token),
        })
      ).json<{ turns: TurnView[] }>();
      last = detail.turns.at(-1)!;
      expect(last.state).not.toBe("running");
    },
    { timeout: 5000 },
  );
  return { ...last, conversationId: id };
}

it("groups and restricted grants decide what the agent reads, with identified denials", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, sales, directory } =
      await setup(runtimeUrl);
    try {
      const owner = await ownerToken(app, service);

      // ---- the catalog identifies each permission by source ----
      const catalog = (
        await inject(app, {
          method: "GET",
          url: "/identity/admin/catalog",
          headers: bearer(owner),
        })
      ).json<{
        restrictionsAvailable: boolean;
        catalog: {
          permission: string;
          code: string;
          source: { id: string } | null;
          restrictions: { id: string; code: string }[];
        }[];
      }>();
      expect(catalog.restrictionsAvailable).toBe(true);
      expect(
        catalog.catalog.map((item) => [
          item.code,
          item.source?.id,
          item.restrictions.map((dimension) => dimension.code),
        ]),
      ).toEqual([
        ["SNK-VEN-01", "sankhya", ["EMP", "PRJ", "VEN", "GRP", "CR"]],
        ["VRM-VEN-01", "vrmaster", ["LOJ", "COM", "CC", "MER"]],
        ["SNK-PRD-01", "sankhya", []],
        ["VRM-PRD-01", "vrmaster", []],
      ]);
      const search = await inject(app, {
        method: "GET",
        url: "/identity/admin/restriction-values?permission=sales_sankhya:read&dimension=company&query=fil",
        headers: bearer(owner),
      });
      expect(search.json()).toEqual({
        items: [{ value: "3", label: "FILIAL", detail: "MNS FILIAL LTDA" }],
      });
      expect(
        (
          await inject(app, {
            method: "GET",
            url: "/identity/admin/restriction-values?permission=sales_sankhya:read&dimension=store&query=x",
            headers: bearer(owner),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_RESTRICTION_INVALID");

      // ---- without a permission the agent names the one required ----
      const carla = await member(app, owner, "Carla");
      expect(
        (
          await inject(app, {
            method: "GET",
            url: "/identity/admin/catalog",
            headers: bearer(carla.token),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_ACCESS_DENIED");
      const denied = await turn(app, carla.token, "sankhya");
      expect(denied.failureCode).toBeNull();
      expect(denied.reply?.message).toContain("SNK-VEN-01");
      expect(denied.reply?.message).toContain("suporte");
      expect(sales.calls).toHaveLength(0);

      // ---- owners create groups with unique names ----
      const created = await inject(app, {
        method: "POST",
        url: "/identity/admin/groups",
        payload: { name: "Comercial Filial", description: null },
        headers: bearer(owner),
      });
      expect(created.statusCode).toBe(201);
      const groupId = created.json<{ groupId: string }>().groupId;
      expect(
        (
          await inject(app, {
            method: "POST",
            url: "/identity/admin/groups",
            payload: { name: "  comercial   FILIAL ", description: null },
            headers: bearer(owner),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_GROUP_NAME_TAKEN");

      // ---- restrictions use real values only ----
      const grant = (restrictions: unknown) =>
        inject(app, {
          method: "PUT",
          url: `/identity/admin/groups/${groupId}/grants/sales_sankhya:read`,
          payload: { restrictions },
          headers: bearer(owner),
        });
      expect(
        (
          await grant([{ dimension: "company", values: ["99"] }])
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_RESTRICTION_INVALID");
      expect(
        (await grant([{ dimension: "store", values: ["1"] }])).json<ErrorBody>()
          .error.code,
      ).toBe("IDENTITY_RESTRICTION_INVALID");
      expect(
        (await grant([{ dimension: "company", values: ["3"] }])).statusCode,
      ).toBe(200);
      expect(directory.resolve).toHaveBeenLastCalledWith(
        "sales_sankhya:read",
        "company",
        ["3"],
        expect.anything(),
      );
      expect(
        (
          await inject(app, {
            method: "PUT",
            url: `/identity/admin/groups/${groupId}/members/${carla.personId}`,
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      const group = (
        await inject(app, {
          method: "GET",
          url: `/identity/admin/groups/${groupId}`,
          headers: bearer(owner),
        })
      ).json<{
        group: {
          members: { displayName: string }[];
          grants: { permission: string; restrictions: unknown[] }[];
        };
      }>().group;
      expect(group.members.map((item) => item.displayName)).toEqual(["Carla"]);
      expect(group.grants).toEqual([
        expect.objectContaining({
          permission: "sales_sankhya:read",
          restrictions: [
            { dimension: "company", values: [{ value: "3", label: "FILIAL" }] },
          ],
        }),
      ]);

      // ---- the member holds the group's restricted grant at once ----
      const me = (
        await inject(app, {
          method: "GET",
          url: "/identity/me",
          headers: bearer(carla.token),
        })
      ).json<{
        person: {
          groups: { name: string }[];
          access: {
            code: string;
            rules: unknown;
            origins: { kind: string; group: { name: string } | null }[];
          }[];
        };
      }>().person;
      expect(me.groups.map((item) => item.name)).toEqual(["Comercial Filial"]);
      expect(me.access).toEqual([
        expect.objectContaining({
          code: "SNK-VEN-01",
          rules: [
            [
              {
                dimension: "company",
                values: [{ value: "3", label: "FILIAL" }],
              },
            ],
          ],
          origins: [
            {
              kind: "group",
              group: { id: groupId, name: "Comercial Filial" },
              provider: null,
            },
          ],
        }),
      ]);
      const restricted = await turn(app, carla.token, "all");
      expect(sales.calls).toEqual([
        {
          source: "sankhya",
          restriction: {
            kind: "restricted",
            rules: [
              [
                {
                  dimension: "company",
                  values: [{ value: "3", label: "FILIAL" }],
                },
              ],
            ],
          },
        },
      ]);
      const answer = restricted.reply?.result as {
        sections: {
          source: string;
          status: string;
          result: { access?: unknown; warnings: string[] } | null;
        }[];
      };
      expect(answer.sections.map((section) => section.status)).toEqual([
        "answered",
        "denied",
      ]);
      expect(answer.sections[0].result?.access).toEqual({
        rules: [[{ dimension: "company", values: ["3"] }]],
      });
      expect(answer.sections[0].result?.warnings[0]).toContain(
        "Resultado limitado ao seu acesso (SNK-VEN-01): Empresa: 3 – FILIAL",
      );
      expect(restricted.reply?.message).toContain("VRM-VEN-01");

      // ---- an unrestricted personal grant widens the union ----
      expect(
        (
          await inject(app, {
            method: "PUT",
            url: `/identity/admin/persons/${carla.personId}/grants/sales_sankhya:read`,
            payload: { restrictions: [] },
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      const widened = await service.accessSnapshot(carla.personId);
      expect(widened?.scopes.get("sales_sankhya:read")).toEqual({
        kind: "all",
      });
      // History computed under the narrower scope stays readable.
      expect(
        (
          await inject(app, {
            method: "GET",
            url: `/agent/conversations/${restricted.conversationId}`,
            headers: bearer(carla.token),
          })
        ).statusCode,
      ).toBe(200);

      // ---- removing the group grant and membership revokes it ----
      for (const url of [
        `/identity/admin/persons/${carla.personId}/grants/sales_sankhya:read`,
        `/identity/admin/groups/${groupId}/members/${carla.personId}`,
      ])
        expect(
          (await inject(app, { method: "DELETE", url, headers: bearer(owner) }))
            .statusCode,
        ).toBe(200);
      expect(
        (await service.accessSnapshot(carla.personId))?.permissions.has(
          "sales_sankhya:read",
        ),
      ).toBe(false);
      // Figures read before revocation are no longer shown.
      expect(
        (
          await inject(app, {
            method: "GET",
            url: `/agent/conversations/${restricted.conversationId}`,
            headers: bearer(carla.token),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("AGENT_ACCESS_DENIED");

      // ---- renames follow the version read; deletion is audited ----
      expect(
        (
          await inject(app, {
            method: "PATCH",
            url: `/identity/admin/groups/${groupId}`,
            payload: { name: "Filial", description: "Equipe", version: 2 },
            headers: bearer(owner),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_GROUP_CONFLICT");
      expect(
        (
          await inject(app, {
            method: "PATCH",
            url: `/identity/admin/groups/${groupId}`,
            payload: { name: "Filial", description: "Equipe", version: 1 },
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await inject(app, {
            method: "DELETE",
            url: `/identity/admin/groups/${groupId}`,
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await inject(app, {
            method: "GET",
            url: `/identity/admin/groups/${groupId}`,
            headers: bearer(owner),
          })
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_GROUP_NOT_FOUND");
      const actions = (
        await database.identityAuditEvent.findMany({
          orderBy: { occurredAt: "asc" },
        })
      ).map((event) => event.action);
      for (const action of [
        "group.created",
        "group.grant_added",
        "group.member_added",
        "grant.added",
        "grant.removed",
        "group.member_removed",
        "group.updated",
        "group.deleted",
      ])
        expect(actions).toContain(action);
      const grantAudit = await database.identityAuditEvent.findFirst({
        where: { action: "group.grant_added" },
      });
      // Counts only: labels such as names never enter the audit trail.
      expect(grantAudit?.details).toMatchObject({
        permission: "sales_sankhya:read",
        restrictedDimensions: 1,
        restrictedValues: 1,
      });
      expect(JSON.stringify(grantAudit?.details)).not.toContain("FILIAL");
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 120_000);

it("converts grants and saved provider grants of the former permissions to both sources", async () => {
  await withMigratedDatabase(async (_runtimeUrl, migrationUrl) => {
    const client = new pg.Client({ connectionString: migrationUrl });
    await client.connect();
    try {
      const person = randomUUID();
      const other = randomUUID();
      await client.query(
        "INSERT INTO identity_persons (id, display_name) VALUES ($1, 'A'), ($2, 'B')",
        [person, other],
      );
      await client.query(
        "INSERT INTO identity_capability_grants (person_id, permission) VALUES ($1, 'sales:read'), ($1, 'products:read'), ($2, 'sales:read'), ($2, 'sales_vrmaster:read')",
        [person, other],
      );
      await client.query(
        `INSERT INTO operational_parameters (key, value, version, updated_by, updated_at)
         VALUES ('access.providerGrants', '["sankhya:sales:read"]'::jsonb, 3, $1, now())`,
        [person],
      );
      // The reviewed data step, applied to rows written under the former names.
      await client.query(
        await readFile(
          new URL(
            "../prisma/migrations/202610200002_identity_source_permissions/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const grants = await client.query<{
        person_id: string;
        permission: string;
      }>(
        "SELECT person_id, permission FROM identity_capability_grants ORDER BY person_id, permission",
      );
      const of = (id: string) =>
        grants.rows
          .filter((row) => row.person_id === id)
          .map((row) => row.permission);
      expect(of(person)).toEqual([
        "products_sankhya:read",
        "products_vrmaster:read",
        "sales_sankhya:read",
        "sales_vrmaster:read",
      ]);
      expect(of(other)).toEqual(["sales_sankhya:read", "sales_vrmaster:read"]);
      const parameter = await client.query<{
        value: string[];
        version: number;
      }>(
        "SELECT value, version FROM operational_parameters WHERE key = 'access.providerGrants'",
      );
      expect(parameter.rows[0]).toEqual({
        value: ["sankhya:sales_sankhya:read", "sankhya:sales_vrmaster:read"],
        version: 4,
      });
    } finally {
      await client.end();
    }
  });
}, 120_000);
