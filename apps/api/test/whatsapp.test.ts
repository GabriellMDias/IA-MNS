import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it, vi } from "vitest";
import pino from "pino";
import type { InjectOptions } from "fastify";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase, type Database } from "../src/database.js";
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
import { agentChannel } from "../src/features/agent/channel.js";
import type { AgentPlanner } from "../src/features/agent/planner.js";
import { SalesChat } from "../src/features/sales/application.js";
import { createSalesCapability } from "../src/features/sales/capability.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { SalesQuery, SalesRow } from "../src/features/sales/domain.js";
import { createWhatsappModule } from "../src/features/whatsapp/module.js";
import { WhatsappChannel } from "../src/features/whatsapp/channel.js";
import { WhatsappRepository } from "../src/features/whatsapp/repository.js";
import { GraphClient } from "../src/features/whatsapp/graph.js";
import { readNotification } from "../src/features/whatsapp/webhook.js";
import { IdentityRepository } from "../src/features/identity/repository.js";
import { interpretation } from "../evals/fixtures.js";
import { signingKey } from "./identity-helpers.js";

it("withholds answers when sales access is revoked or narrowed during computation", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, graph, sales, makeChannel } = await setup(
      runtimeUrl,
      true,
    );
    const channel = makeChannel();
    try {
      const owner = await ownerToken(app, service);
      for (const [index, change] of ["permission", "scope"].entries()) {
        const person = await createPerson(app, owner, `During ${change}`, true);
        const phone = `551198765430${index}`;
        expect(
          (await setNumber(app, owner, person.personId, `+${phone}`))
            .statusCode,
        ).toBe(200);
        await channel.receive(
          readNotification(
            notification({
              messages: [
                message(
                  { phone },
                  "Quanto vendemos de maçã nos últimos 3 meses?",
                ),
              ],
            }),
            { phoneNumberId: PHONE_NUMBER_ID },
          ),
        );
        await database.whatsappInboundMessage.updateMany({
          data: { notBefore: new Date(0) },
        });
        let release!: () => void;
        const reached = new Promise<void>((resolve) => {
          sales.gate.reached = resolve;
        });
        sales.gate.hold = new Promise<void>((resolve) => {
          release = resolve;
        });
        const processing = channel.processNext();
        try {
          await reached;
          if (change === "permission")
            await database.identityCapabilityGrant.delete({
              where: {
                personId_permission: {
                  personId: person.personId,
                  permission: "sales_sankhya:read",
                },
              },
            });
          else
            await database.identityGrantRestriction.create({
              data: {
                personId: person.personId,
                permission: "sales_sankhya:read",
                dimension: "company",
                value: "1",
                label: "Synthetic company",
              },
            });
        } finally {
          sales.gate.hold = null;
          release();
          await processing;
        }
        expect(
          await database.whatsappInboundMessage.findFirst({
            where: { personId: person.personId },
          }),
        ).toMatchObject({ state: "ignored", outcome: "revoked" });
        expect(await database.whatsappOutboundMessage.count()).toBe(0);
        expect(graph.sent).toHaveLength(0);
      }
    } finally {
      await channel.close();
      await app.close();
      await database.$disconnect();
    }
  });
}, 120_000);

it("rechecks retained dependencies for every queued answer part and retry after a restart", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, graph, sales, makeChannel, agent } =
      await setup(runtimeUrl, true);
    let channel = makeChannel();
    try {
      const owner = await ownerToken(app, service);
      sales.rows.splice(
        0,
        1,
        ...Array.from({ length: 20 }, (_, index) => ({
          period: "total",
          product: `SYNTHETIC PRODUCT ${index} ${"A".repeat(230)}`,
          unit: "BRL",
          value: "1",
        })),
      );
      for (const [index, change] of [
        "permission",
        "scope",
        "derived",
        "deleted",
        "between_parts",
      ].entries()) {
        const person = await createPerson(app, owner, `Queued ${change}`, true);
        const phone = `552199876540${index}`;
        expect(
          (await setNumber(app, owner, person.personId, `+${phone}`))
            .statusCode,
        ).toBe(200);
        await channel.receive(
          readNotification(
            notification({
              messages: [
                message(
                  { phone },
                  "Quanto vendemos de maçã nos últimos 3 meses?",
                ),
              ],
            }),
            { phoneNumberId: PHONE_NUMBER_ID },
          ),
        );
        await database.whatsappInboundMessage.updateMany({
          data: { notBefore: new Date(0) },
        });
        if (change === "derived") {
          const capability = agent.capabilities[0];
          const execute = capability.execute;
          vi.spyOn(capability, "execute").mockImplementationOnce(
            async (input) => {
              const outcome = await execute(input);
              return {
                ...outcome,
                reply: {
                  kind: "conversation",
                  capabilityId: outcome.reply.capabilityId,
                  result: null,
                  message: "Synthetic retained-evidence reformulation. ".repeat(
                    120,
                  ),
                  suggestions: [],
                  evidenceSnapshots: [
                    {
                      id: "original",
                      capabilityId: outcome.reply.capabilityId,
                      requiredPermissions: [],
                      result: outcome.reply.result,
                    },
                  ],
                },
              };
            },
          );
        }
        expect(await channel.processNext()).toBe(true);
        const work = await database.whatsappInboundMessage.findFirstOrThrow({
          where: { personId: person.personId },
        });
        expect(work.outcome).toBe("answered");
        expect(
          await database.whatsappOutboundMessage.count({
            where: { personId: person.personId },
          }),
        ).toBeGreaterThan(1);
        const before = graph.sent.length;
        if (change === "between_parts") {
          expect(await channel.sendNext()).toBe(true);
          expect(graph.sent).toHaveLength(before + 1);
        } else {
          graph.failures.push(() =>
            Response.json({ error: { code: 130429 } }, { status: 429 }),
          );
          expect(await channel.sendNext()).toBe(true);
          expect(graph.sent).toHaveLength(before);
        }
        if (change === "scope")
          await database.identityGrantRestriction.create({
            data: {
              personId: person.personId,
              permission: "sales_sankhya:read",
              dimension: "company",
              value: "1",
              label: "Synthetic company",
            },
          });
        else if (change === "deleted")
          await database.agentConversation.delete({
            where: { id: work.conversationId! },
          });
        else {
          await database.identityCapabilityGrant.delete({
            where: {
              personId_permission: {
                personId: person.personId,
                permission: "sales_sankhya:read",
              },
            },
          });
        }
        // No in-memory authorization snapshot survives the new channel instance.
        await channel.close();
        channel = makeChannel();
        await database.whatsappOutboundMessage.updateMany({
          where: { state: "pending" },
          data: { notBefore: new Date(0) },
        });
        while (await channel.sendNext()) {
          /* drain all parts */
        }
        expect(graph.sent).toHaveLength(
          before + (change === "between_parts" ? 1 : 0),
        );
        const unsent = await database.whatsappOutboundMessage.findMany({
          where: { personId: person.personId, state: { not: "accepted" } },
        });
        expect(unsent.length).toBeGreaterThan(0);
        expect(
          unsent.every(
            (part) => part.state === "revoked" && part.body === null,
          ),
        ).toBe(true);
      }
    } finally {
      await channel.close();
      await app.close();
      await database.$disconnect();
    }
  });
}, 120_000);

it("never reauthorizes old inbox or outbox work after unlinking and recreating the same number", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, graph, makeChannel } = await setup(
      runtimeUrl,
      true,
    );
    const channel = makeChannel();
    try {
      const owner = await ownerToken(app, service);
      const person = await createPerson(app, owner, "Relinked person", true);
      const phone = "5531998765432";
      const version = async () =>
        (
          await database.identityWhatsappLink.findUniqueOrThrow({
            where: { personId: person.personId },
          })
        ).version;
      const receive = async () => {
        await channel.receive(
          readNotification(
            notification({
              messages: [
                message(
                  { phone },
                  "Quanto vendemos de maçã nos últimos 3 meses?",
                ),
              ],
            }),
            { phoneNumberId: PHONE_NUMBER_ID },
          ),
        );
        await database.whatsappInboundMessage.updateMany({
          data: { notBefore: new Date(0) },
        });
      };
      const relink = async () => {
        expect(
          (
            await inject(app, {
              method: "DELETE",
              url: `/identity/admin/persons/${person.personId}/whatsapp`,
              headers: bearer(owner),
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (await setNumber(app, owner, person.personId, `+${phone}`))
            .statusCode,
        ).toBe(200);
      };
      expect(
        (await setNumber(app, owner, person.personId, `+${phone}`)).statusCode,
      ).toBe(200);
      expect(await version()).toBe(1);
      await receive();
      await relink();
      expect(await version()).toBe(2);
      expect(await channel.processNext()).toBe(true);
      expect((await inbound(database))[0]).toMatchObject({
        state: "ignored",
        outcome: "revoked",
      });
      await receive();
      expect(await channel.processNext()).toBe(true);
      expect(await database.whatsappOutboundMessage.count()).toBeGreaterThan(0);
      await relink();
      expect(await version()).toBe(3);
      while (await channel.sendNext()) {
        /* drain revoked work */
      }
      expect(graph.sent).toHaveLength(0);
      expect(
        (await database.whatsappOutboundMessage.findMany()).every(
          (part) => part.state === "revoked",
        ),
      ).toBe(true);
      await expect(
        new IdentityRepository(database).setWhatsappLink({
          personId: person.personId,
          phoneNumber: "5531998765433",
          legacyIdentifier: null,
          actor: person.personId,
          now: new Date(),
          audit: () => Promise.reject(new Error("Synthetic audit failure")),
        }),
      ).rejects.toThrow("Synthetic audit failure");
      expect(await version()).toBe(3);
      expect(
        (
          await database.identityPerson.findUniqueOrThrow({
            where: { id: person.personId },
          })
        ).whatsappLinkVersion,
      ).toBe(3);
      // New authorized work still succeeds; old revocation is not a channel lockout.
      await receive();
      expect(await channel.processNext()).toBe(true);
      while (await channel.sendNext()) {
        /* drain current work */
      }
      expect(graph.sent.length).toBeGreaterThan(0);
      const writes = await Promise.all([
        setNumber(app, owner, person.personId, "+55 31 99876-5433"),
        setNumber(app, owner, person.personId, "+55 31 99876-5434"),
      ]);
      expect(writes.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(await version()).toBe(5);
    } finally {
      await channel.close();
      await app.close();
      await database.$disconnect();
    }
  });
}, 120_000);

it("backfills link generations from current links and retained channel work on upgrade", async () => {
  await withMigratedDatabase(async (runtimeUrl, migrationUrl) => {
    const database = createDatabase(runtimeUrl);
    const admin = new pg.Client({ connectionString: migrationUrl });
    await admin.connect();
    try {
      const linked = randomUUID(),
        removed = randomUUID(),
        fresh = randomUUID();
      await database.identityPerson.createMany({
        data: [linked, removed, fresh].map((id) => ({
          id,
          displayName: "Synthetic upgrade",
        })),
      });
      await database.identityWhatsappLink.create({
        data: {
          personId: linked,
          phoneNumber: "5511987654321",
          version: 4,
          linkedBy: linked,
          updatedBy: linked,
        },
      });
      const work = await database.whatsappInboundMessage.create({
        data: {
          id: randomUUID(),
          messageId: "wamid.upgrade",
          personId: removed,
          linkVersion: 7,
          senderPhone: "5521998765432",
          kind: "text",
          sentAt: new Date(),
        },
      });
      await database.whatsappOutboundMessage.create({
        data: {
          id: randomUUID(),
          inboundId: work.id,
          part: 1,
          personId: removed,
          linkVersion: 9,
          recipientPhone: work.senderPhone,
          kind: "notice",
          body: "Synthetic upgrade",
        },
      });
      // Recreate only the prior column state in this disposable database.
      await admin.query(
        "ALTER TABLE identity_persons DROP COLUMN whatsapp_link_version",
      );
      await admin.query(
        await readFile(
          new URL(
            "../prisma/migrations/202610210002_identity_whatsapp_link_generations/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const [id, expected] of [
        [linked, 4],
        [removed, 9],
        [fresh, 0],
      ] as const)
        expect(
          (await database.identityPerson.findUniqueOrThrow({ where: { id } }))
            .whatsappLinkVersion,
        ).toBe(expected);
      await new IdentityRepository(database).setWhatsappLink({
        personId: removed,
        phoneNumber: "5521998765432",
        legacyIdentifier: null,
        actor: linked,
        now: new Date(),
        audit: async () => {},
      });
      expect(
        (
          await database.identityWhatsappLink.findUniqueOrThrow({
            where: { personId: removed },
          })
        ).version,
      ).toBe(10);
    } finally {
      await admin.end();
      await database.$disconnect();
    }
  });
}, 120_000);

// Synthetic Meta identifiers and secrets; nothing here reaches Meta.
const ORIGIN = "http://localhost:5173";
const PHONE_NUMBER_ID = "100000000000001";
const ACCOUNT_ID = "200000000000002";
const APP_SECRET = "f".repeat(32);
const VERIFY_TOKEN = "verify-token-synthetic-0123456789";
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

/** A synthetic Graph API that records what IA-MNS would have sent. */
function fakeGraph() {
  const sent: { to?: string; recipient?: string; body: string }[] = [];
  const reads: string[] = [];
  const failures: (() => Response)[] = [];
  const fetcher = ((url: string, init: RequestInit) => {
    expect(url).toBe(`http://127.0.0.1:9/v25.0/${PHONE_NUMBER_ID}/messages`);
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer EAAsynthetic-whatsapp-token",
    );
    const payload = JSON.parse(init.body as string) as {
      status?: string;
      message_id?: string;
      to?: string;
      recipient?: string;
      text?: { body: string };
    };
    if (payload.status === "read") {
      reads.push(payload.message_id!);
      return Promise.resolve(Response.json({ success: true }));
    }
    const failure = failures.shift();
    if (failure) return Promise.resolve(failure());
    sent.push({
      ...(payload.to ? { to: payload.to } : {}),
      ...(payload.recipient ? { recipient: payload.recipient } : {}),
      body: payload.text!.body,
    });
    return Promise.resolve(
      Response.json({
        messaging_product: "whatsapp",
        messages: [{ id: `wamid.out.${sent.length}` }],
      }),
    );
  }) as unknown as typeof fetch;
  return { sent, reads, failures, fetcher };
}

/** Synthetic sales readers: they record each query and can be held. */
function salesReaders() {
  const calls: { source: string; query: SalesQuery }[] = [];
  const rows: SalesRow[] = [
    { period: "total", product: null, unit: "BRL", value: "1234.5" },
  ];
  const gate: { hold: Promise<void> | null; reached: () => void } = {
    hold: null,
    reached: () => undefined,
  };
  const reader = (source: string) => ({
    read: async (query: SalesQuery) => {
      calls.push({ source, query });
      if (gate.hold) {
        gate.reached();
        await gate.hold;
      }
      return {
        current: {
          rows,
          products: [{ code: "1", description: "MAÇÃ GALA" }],
          missingWeight: false,
        },
        previous: null,
      };
    },
    close: async () => {},
  });
  return {
    calls,
    rows,
    gate,
    readers: { sankhya: reader("sankhya"), vrmaster: reader("vrmaster") },
  };
}

async function setup(runtimeUrl: string, manual = false) {
  const key = signingKey();
  const config = parseServerConfig({
    ORION_ENV: "test",
    ORION_DATABASE_URL: runtimeUrl,
    IA_MNS_PUBLIC_ORIGIN: ORIGIN,
    IA_MNS_IDENTITY_SIGNING_KEY: key,
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    IA_MNS_WHATSAPP_CHANNEL: "enabled",
    WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: ACCOUNT_ID,
    WHATSAPP_ACCESS_TOKEN: "EAAsynthetic-whatsapp-token",
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    WHATSAPP_GRAPH_BASE_URL: "http://127.0.0.1:9",
  });
  const database = createDatabase(runtimeUrl);
  const verifier = createLocalAccessTokenVerifier({
    issuer: ORIGIN,
    audience: config.identityAudience,
    keys: { keys: [issuerPublicJwk(key)] },
  });
  const resources = { config, database, verifier };
  const ports = {
    transferOwnership: transferConversations,
    parameters: operationalParameters,
  };
  const service = identityServiceFor(
    config,
    resources,
    permissionCatalog,
    ports,
  )!;
  // The real legacy router contract and the real sales capability; only the
  // model interpretation and the ERP readers are synthetic.
  const router: AgentPlanner = {
    route: vi.fn<AgentPlanner["route"]>(() =>
      Promise.resolve({ intent: "capability", capabilityId: "sales" }),
    ),
  };
  const interpreter: SalesInterpreter = {
    interpret: vi.fn<SalesInterpreter["interpret"]>(({ message }) =>
      Promise.resolve(
        message.includes("mês passado")
          ? interpretation({
              relation: "refine",
              period: {
                kind: "last",
                unit: "month",
                count: 1,
                includeCurrent: false,
              },
            })
          : interpretation({
              measure: "net_value",
              filters: { product: "maçã" },
              period: {
                kind: "last",
                unit: "month",
                count: 3,
                includeCurrent: false,
              },
              groupBy: "total",
            }),
      ),
    ),
  };
  const sales = salesReaders();
  const agent = new CorporateAgent(new AgentRepository(database), router, [
    createSalesCapability(
      config,
      new SalesChat(
        interpreter,
        sales.readers,
        undefined,
        () => new Date("2026-10-13T15:00:00Z"),
      ),
    ),
  ]);
  const graph = fakeGraph();
  const identity = createIdentityModule(
    permissionCatalog,
    ports,
    () => service,
  ).activate(resources);
  const agentModule = createAgentModule(() => [], agent).activate(resources);
  const whatsapp = createWhatsappModule({
    identity: () => ({
      authorize: (sender) => service.authorizeWhatsappSender(sender),
      confirm: (authorization) => service.confirmWhatsappSender(authorization),
    }),
    agent: (_resources, log) => agentChannel(agent, "whatsapp", log),
    enabled: (current) => {
      const parameters = operationalParameters(current);
      return async () =>
        (await parameters.get("channels.whatsapp")) === "enabled";
    },
    fetcher: graph.fetcher,
    idleMs: 25,
  }).activate(resources);
  const { app } = createApp(pino({ level: "silent" }), undefined, {
    modules: [identity, agentModule, ...(manual ? [] : [whatsapp])],
  });
  await app.ready();
  const makeChannel = () =>
    new WhatsappChannel({
      repository: new WhatsappRepository(database),
      identity: {
        authorize: (sender) => service.authorizeWhatsappSender(sender),
        confirm: (authorization) =>
          service.confirmWhatsappSender(authorization),
      },
      agent: agentChannel(agent, "whatsapp", app.log),
      graph: new GraphClient({
        baseUrl: config.whatsappGraphBaseUrl,
        version: config.whatsappGraphApiVersion,
        phoneNumberId: PHONE_NUMBER_ID,
        accessToken: config.whatsappAccessToken!,
        fetcher: graph.fetcher,
      }),
      enabled: () => Promise.resolve(true),
      dailyLimit: 500,
      log: app.log,
      idleMs: 25,
    });
  return { app, database, service, graph, sales, router, makeChannel, agent };
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

async function createPerson(
  app: App,
  owner: string,
  displayName: string,
  grant: boolean,
) {
  const created = await inject(app, {
    method: "POST",
    url: "/identity/admin/persons",
    payload: { displayName, localInvitation: !grant },
    headers: bearer(owner),
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{
    personId: string;
    enrollmentToken: string | null;
  }>();
  if (grant)
    for (const permission of ["sales_sankhya:read", "sales_vrmaster:read"])
      expect(
        (
          await inject(app, {
            method: "PUT",
            url: `/identity/admin/persons/${body.personId}/grants/${permission}`,
            payload: { restrictions: [] },
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
  return body;
}

const setNumber = (app: App, token: string, personId: string, number: string) =>
  inject(app, {
    method: "PUT",
    url: `/identity/admin/persons/${personId}/whatsapp`,
    payload: { number },
    headers: bearer(token),
  });

let messageCounter = 0;
function message(
  from: { phone?: string; userId?: string },
  text: string | null,
  secondsAgo = 5,
) {
  messageCounter += 1;
  return {
    ...(from.phone ? { from: from.phone } : {}),
    ...(from.userId ? { from_user_id: from.userId } : {}),
    id: `wamid.in.${messageCounter}.${randomBytes(4).toString("hex")}`,
    timestamp: String(Math.floor(Date.now() / 1000) - secondsAgo),
    ...(text === null
      ? { type: "image", image: { id: "media-1" } }
      : { type: "text", text: { body: text } }),
  };
}
function notification(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: ACCOUNT_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5511900000000",
                phone_number_id: PHONE_NUMBER_ID,
              },
              ...value,
            },
          },
        ],
      },
    ],
  };
}
function deliver(app: App, payload: object, signature?: string) {
  const body = JSON.stringify(payload);
  return inject(app, {
    method: "POST",
    url: "/whatsapp/webhook",
    payload: body,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256":
        signature ??
        `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`,
    },
  });
}

async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > end) throw new Error("Timed out waiting for the channel");
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}
const inbound = (database: Database) =>
  database.whatsappInboundMessage.findMany({ orderBy: { receivedAt: "asc" } });
const settled = (database: Database) =>
  until(
    () =>
      Promise.all([
        database.whatsappInboundMessage.count({
          where: { state: { in: ["pending", "processing"] } },
        }),
        database.whatsappOutboundMessage.count({
          where: { state: { in: ["pending", "sending"] } },
        }),
      ]),
    ([pending, sending]) => pending === 0 && sending === 0,
  );

it("lets owners alone link numbers and answers only linked, active people through the existing agent", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, graph, sales, router } =
      await setup(runtimeUrl);
    try {
      // ---- Meta subscription verification ----
      const verify = (token: string) =>
        inject(app, {
          method: "GET",
          url: `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`,
        });
      const verified = await verify(VERIFY_TOKEN);
      expect(verified.statusCode).toBe(200);
      expect(verified.body).toBe("1158201444");
      expect(verified.headers["content-type"]).toMatch(/^text\/plain/);
      expect(
        (await verify("wrong-token-wrong-token-wrong-token")).json<ErrorBody>()
          .error.code,
      ).toBe("WHATSAPP_VERIFICATION_FAILED");

      // ---- administration: only owners link, change and remove numbers ----
      const owner = await ownerToken(app, service);
      const ana = await createPerson(app, owner, "Ana", true);
      const bruno = await createPerson(app, owner, "Bruno", false);
      const carla = await createPerson(app, owner, "Carla", true);
      const dora = await createPerson(app, owner, "Dora", false);
      const doraToken = (
        await inject(app, {
          method: "POST",
          url: "/identity/invitations/complete",
          payload: {
            purpose: "enrollment",
            token: dora.enrollmentToken,
            login: "dora",
            password: "uma frase de acesso segura",
          },
        })
      ).json<{ accessToken: string }>().accessToken;
      for (const response of [
        await setNumber(app, doraToken, dora.personId, "+55 11 97777-0000"),
        await setNumber(app, doraToken, ana.personId, "+55 11 97777-0000"),
        await inject(app, {
          method: "DELETE",
          url: `/identity/admin/persons/${ana.personId}/whatsapp`,
          headers: bearer(doraToken),
        }),
      ])
        expect(response.json<ErrorBody>().error.code).toBe(
          "IDENTITY_ACCESS_DENIED",
        );
      expect(
        (
          await setNumber(app, owner, ana.personId, "11987654321")
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_WHATSAPP_NUMBER_INVALID");
      expect(
        (
          await setNumber(app, owner, ana.personId, "+55 11 8765-4321")
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_WHATSAPP_NINTH_DIGIT_REQUIRED");
      expect(
        (await setNumber(app, owner, ana.personId, "+55 11 98765-4321"))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await setNumber(app, owner, bruno.personId, "+55 (11) 98765 4321")
        ).json<ErrorBody>().error.code,
      ).toBe("IDENTITY_WHATSAPP_NUMBER_IN_USE");
      expect(
        (await setNumber(app, owner, bruno.personId, "+55 21 99000-0001"))
          .statusCode,
      ).toBe(200);
      expect(
        (await setNumber(app, owner, bruno.personId, "+55 21 99876-5432"))
          .statusCode,
      ).toBe(200);
      expect(
        (await setNumber(app, owner, carla.personId, "+55 31 99123-4567"))
          .statusCode,
      ).toBe(200);
      const detail = (
        await inject(app, {
          method: "GET",
          url: `/identity/admin/persons/${bruno.personId}`,
          headers: bearer(owner),
        })
      ).json<{
        person: { whatsapp: { number: string; confirmedAt: string | null } };
        audit: {
          action: string;
          byOwner: boolean;
          details: Record<string, unknown>;
        }[];
      }>();
      expect(detail.person.whatsapp).toMatchObject({
        number: "+55 21 99876-5432",
        confirmedAt: null,
      });
      expect(
        detail.audit
          .filter((event) => event.action.startsWith("whatsapp."))
          .map((event) => [event.action, event.byOwner, event.details.suffix]),
      ).toEqual([
        ["whatsapp.changed", true, "5432"],
        ["whatsapp.linked", true, "0001"],
      ]);
      // A person sees their own number but cannot change it.
      expect(
        (
          await inject(app, {
            method: "GET",
            url: "/identity/me",
            headers: bearer(doraToken),
          })
        ).json<{ person: { whatsapp: unknown } }>().person.whatsapp,
      ).toBeNull();

      // ---- forged or unsigned notifications are refused ----
      const forged = await deliver(
        app,
        notification({ messages: [message({ phone: "551187654321" }, "Olá")] }),
        `sha256=${"0".repeat(64)}`,
      );
      expect(forged.statusCode).toBe(401);
      expect(forged.json<ErrorBody>().error.code).toBe(
        "WHATSAPP_SIGNATURE_INVALID",
      );
      expect(await inbound(database)).toHaveLength(0);

      // ---- unknown numbers are ignored silently: nothing stored or sent ----
      const stranger = await deliver(
        app,
        notification({
          contacts: [{ wa_id: "5511912345678", profile: { name: "X" } }],
          messages: [message({ phone: "5511912345678" }, "Quanto vendemos?")],
        }),
      );
      expect(stranger.statusCode).toBe(200);
      expect(await inbound(database)).toHaveLength(0);

      // ---- Ana (legacy Brazilian identifier) asks; the agent answers ----
      const first = message(
        { phone: "551187654321", userId: "BR.1000001" },
        "Quanto vendemos de maçã nos últimos 3 meses?",
      );
      expect(
        (await deliver(app, notification({ messages: [first] }))).statusCode,
      ).toBe(200);
      // A repeated delivery of the same message is recorded once.
      expect(
        (await deliver(app, notification({ messages: [first] }))).statusCode,
      ).toBe(200);
      await settled(database);
      expect(await inbound(database)).toHaveLength(1);
      expect(graph.reads).toEqual([first.id]);
      expect(graph.sent).toHaveLength(1);
      expect(graph.sent[0].to).toBe("551187654321");
      expect(graph.sent[0].body).toContain("R$ 1.234,50");
      expect(graph.sent[0].body).toContain("*Fonte: MNS (Sankhya)*");
      expect(sales.calls).toHaveLength(1);
      expect(sales.calls[0]).toMatchObject({
        source: "sankhya",
        query: {
          productSearch: "maçã",
          startDate: "2026-07-01",
          endDate: "2026-09-30",
        },
      });
      // The link learned the business-scoped id Meta reported with the number.
      expect(
        await database.identityWhatsappLink.findUnique({
          where: { personId: ana.personId },
          select: { platformUserId: true, confirmedAt: true },
        }),
      ).toMatchObject({
        platformUserId: "BR.1000001",
        confirmedAt: expect.any(Date) as Date,
      });
      // The conversation is Ana's, in the same history as the web, marked WhatsApp.
      const agentRepository = new AgentRepository(database);
      const history = await agentRepository.list(ana.personId);
      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({ channel: "whatsapp" });
      const conversationId = history.items[0].id;

      // ---- ordered processing and context continuity ----
      const help = message({ phone: "551187654321" }, "/ajuda", 4);
      const followUp = message(
        { phone: "551187654321" },
        "E no mês passado?",
        3,
      );
      // Delivered out of order in one notification; processed in send order.
      await deliver(app, notification({ messages: [followUp, help] }));
      await settled(database);
      expect(graph.sent).toHaveLength(3);
      expect(graph.sent[1].body).toContain("/fonte");
      expect(graph.sent[2].body).toContain("R$ 1.234,50");
      // "E no mês passado?" kept the product of the earlier question.
      expect(sales.calls[1]).toMatchObject({
        source: "sankhya",
        query: {
          productSearch: "maçã",
          startDate: "2026-09-01",
          endDate: "2026-09-30",
        },
      });
      const turns = (await agentRepository.detail(ana.personId, conversationId))
        .turns;
      expect(turns.map((turn) => turn.question)).toEqual([
        "Quanto vendemos de maçã nos últimos 3 meses?",
        "E no mês passado?",
      ]);

      // ---- explicit source choice (company isolation stays in the agent) ----
      await deliver(
        app,
        notification({
          messages: [message({ phone: "551187654321" }, "/fonte vrmaster", 2)],
        }),
      );
      await settled(database);
      expect(graph.sent.at(-1)?.body).toContain("Pilar da Terra (VR Master)");
      await deliver(
        app,
        notification({
          messages: [
            message(
              { phone: "551187654321" },
              "Quanto vendemos de maçã nos últimos 3 meses?",
              1,
            ),
          ],
        }),
      );
      await settled(database);
      expect(sales.calls.at(-1)?.source).toBe("vrmaster");
      expect(graph.sent.at(-1)?.body).toContain(
        "*Fonte: Pilar da Terra (VR Master)*",
      );
      expect(graph.sent.at(-1)?.body).not.toContain("MNS (Sankhya)");

      // ---- a sender who hides the number is matched by the learned id ----
      await deliver(
        app,
        notification({
          messages: [message({ userId: "BR.1000001" }, "/ajuda", 1)],
        }),
      );
      await settled(database);
      expect(graph.sent.at(-1)).toMatchObject({ recipient: "BR.1000001" });
      expect(graph.sent.at(-1)).not.toHaveProperty("to");
      // ...but Ana's number with another WhatsApp user id is refused.
      const before = (await inbound(database)).length;
      await deliver(
        app,
        notification({
          messages: [
            message({ phone: "551187654321", userId: "BR.9999999" }, "Olá", 1),
          ],
        }),
      );
      expect(await inbound(database)).toHaveLength(before);

      // ---- permissions still apply: Bruno has no sales permission ----
      const salesCalls = sales.calls.length;
      await deliver(
        app,
        notification({
          messages: [
            message(
              { phone: "5521998765432" },
              "Quanto vendemos de maçã nos últimos 3 meses?",
              1,
            ),
          ],
        }),
      );
      await settled(database);
      expect(sales.calls).toHaveLength(salesCalls);
      // The reply names the missing permission for support.
      expect(graph.sent.at(-1)).toMatchObject({ to: "5521998765432" });
      expect(graph.sent.at(-1)?.body).toContain("Você não tem permissão");
      expect(graph.sent.at(-1)?.body).toContain("SNK-VEN-01");
      // Unsupported media get a short notice instead of an agent turn.
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5521998765432" }, null, 1)],
        }),
      );
      await settled(database);
      expect(graph.sent.at(-1)?.body).toContain("apenas mensagens de texto");
      // The previous number of Bruno no longer reaches anyone.
      const count = (await inbound(database)).length;
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5521990000001" }, "Olá", 1)],
        }),
      );
      expect(await inbound(database)).toHaveLength(count);

      // ---- disabled people are ignored silently ----
      expect(
        (
          await inject(app, {
            method: "PATCH",
            url: `/identity/admin/persons/${carla.personId}`,
            payload: { status: "disabled" },
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      const sentBefore = graph.sent.length;
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5531991234567" }, "Olá", 1)],
        }),
      );
      expect(await inbound(database)).toHaveLength(count);
      expect(graph.sent).toHaveLength(sentBefore);

      // ---- revocation while a question is being answered ----
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        sales.gate.reached = resolve;
      });
      sales.gate.hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      await deliver(
        app,
        notification({
          messages: [
            message(
              { phone: "551187654321" },
              "Quanto vendemos de maçã nos últimos 3 meses?",
              1,
            ),
          ],
        }),
      );
      await reached;
      expect(
        (
          await inject(app, {
            method: "DELETE",
            url: `/identity/admin/persons/${ana.personId}/whatsapp`,
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      sales.gate.hold = null;
      release();
      await settled(database);
      expect(graph.sent).toHaveLength(sentBefore);
      const revoked = (await inbound(database)).at(-1)!;
      expect(revoked).toMatchObject({
        state: "ignored",
        outcome: "revoked",
        body: null,
      });
      // The answer stays in Ana's own history; it simply was not delivered.
      expect(revoked.turnId).not.toBeNull();
      await deliver(
        app,
        notification({
          messages: [message({ phone: "551187654321" }, "Olá", 1)],
        }),
      );
      expect(await inbound(database)).toHaveLength(count + 1);

      // ---- delivery statuses only move forward ----
      await deliver(
        app,
        notification({
          statuses: [
            { id: "wamid.out.1", status: "read", recipient_id: "551187654321" },
          ],
        }),
      );
      await deliver(
        app,
        notification({
          statuses: [
            {
              id: "wamid.out.1",
              status: "delivered",
              recipient_id: "551187654321",
            },
          ],
        }),
      );
      expect(
        await database.whatsappOutboundMessage.findUnique({
          where: { providerMessageId: "wamid.out.1" },
          select: { state: true, body: true },
        }),
      ).toEqual({ state: "read", body: null });

      // ---- the owner switch stops the channel without a restart ----
      expect(
        (
          await inject(app, {
            method: "PUT",
            url: "/identity/admin/parameters/channels.whatsapp",
            payload: { value: "disabled", version: 0 },
            headers: bearer(owner),
          })
        ).statusCode,
      ).toBe(200);
      const routed = vi.mocked(router.route).mock.calls.length;
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5521998765432" }, "Olá", 1)],
        }),
      );
      expect(await inbound(database)).toHaveLength(count + 1);
      expect(vi.mocked(router.route).mock.calls).toHaveLength(routed);
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 180_000);

it("retries replies only when Meta refused them and never resends an uncertain one", async () => {
  await withMigratedDatabase(async (runtimeUrl) => {
    const { app, database, service, graph } = await setup(runtimeUrl);
    try {
      const owner = await ownerToken(app, service);
      const ana = await createPerson(app, owner, "Ana", true);
      expect(
        (await setNumber(app, owner, ana.personId, "+55 11 98765-4321"))
          .statusCode,
      ).toBe(200);
      graph.failures.push(() =>
        Response.json({ error: { code: 130429 } }, { status: 400 }),
      );
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5511987654321" }, "/ajuda", 2)],
        }),
      );
      await settled(database);
      // Throughput refusal, then accepted on the next attempt.
      expect(graph.sent).toHaveLength(1);
      expect(
        await database.whatsappOutboundMessage.findFirst({
          select: { state: true, attempts: true },
        }),
      ).toEqual({ state: "accepted", attempts: 2 });

      graph.failures.push(() => new Response("upstream", { status: 502 }));
      await deliver(
        app,
        notification({
          messages: [message({ phone: "5511987654321" }, "/ajuda", 1)],
        }),
      );
      await settled(database);
      expect(graph.sent).toHaveLength(1);
      const uncertain = await database.whatsappOutboundMessage.findFirst({
        where: { state: { not: "accepted" } },
        select: { state: true, attempts: true, failureCode: true, body: true },
      });
      expect(uncertain).toEqual({
        state: "unknown",
        attempts: 1,
        failureCode: "http_502",
        body: null,
      });

      // ---- consolidation keeps one number per Person ----
      const merge = (target: string, source: string) =>
        inject(app, {
          method: "POST",
          url: `/identity/admin/persons/${target}/merge`,
          payload: { sourcePersonId: source },
          headers: bearer(owner),
        });
      const link = (personId: string) =>
        database.identityWhatsappLink.findUnique({
          where: { personId },
          select: { phoneNumber: true, version: true },
        });
      const bia = await createPerson(app, owner, "Bia", false);
      expect(
        (await setNumber(app, owner, bia.personId, "+55 41 99111-2222"))
          .statusCode,
      ).toBe(200);
      // The surviving Person keeps its own number; the absorbed one is gone.
      expect((await merge(ana.personId, bia.personId)).statusCode).toBe(200);
      expect(await link(ana.personId)).toEqual({
        phoneNumber: "5511987654321",
        version: 1,
      });
      expect(await link(bia.personId)).toBeNull();
      expect(
        await database.identityWhatsappLink.count({
          where: { phoneNumber: "5541991112222" },
        }),
      ).toBe(0);
      // Without a number of its own, the survivor receives the absorbed
      // number as a new version, which refuses work queued for the source.
      const caio = await createPerson(app, owner, "Caio", false);
      const davi = await createPerson(app, owner, "Davi", false);
      // The survivor's deleted links also reserve their generations.
      for (let index = 0; index < 2; index++) {
        expect(
          (await setNumber(app, owner, caio.personId, "+55 21 99876-5432"))
            .statusCode,
        ).toBe(200);
        expect(
          (
            await inject(app, {
              method: "DELETE",
              url: `/identity/admin/persons/${caio.personId}/whatsapp`,
              headers: bearer(owner),
            })
          ).statusCode,
        ).toBe(200);
      }
      expect(
        (await setNumber(app, owner, davi.personId, "+55 41 99111-2222"))
          .statusCode,
      ).toBe(200);
      expect((await merge(caio.personId, davi.personId)).statusCode).toBe(200);
      expect(await link(caio.personId)).toEqual({
        phoneNumber: "5541991112222",
        version: 3,
      });
    } finally {
      await app.close();
      await database.$disconnect();
    }
  });
}, 120_000);
