import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withMigratedDatabase } from "../../scripts/migrated-database.js";
import {
  createRepository,
  type PrismaApprovalRequestRepository,
} from "../../src/features/approval-requests/prisma-repository.js";
import { ApprovalRequestService } from "../../src/features/approval-requests/service.js";
import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/logging.js";
import { parseServerConfig } from "../../src/config.js";
import type { AccessTokenVerifier } from "../../src/authentication.js";
import { approvalRequestRoutes } from "../../src/features/approval-requests/module.js";

function assemble(options: {
  service: ApprovalRequestService;
  verifier: AccessTokenVerifier;
  checkReady?: () => Promise<boolean>;
  rateLimit?: { max: number; timeWindow: number };
}) {
  return createApp(
    createLogger(parseServerConfig({ ORION_ENV: "test" })),
    undefined,
    {
      modules: [approvalRequestRoutes(options)],
      ...(options.checkReady ? { checkReady: options.checkReady } : {}),
    },
  );
}

const owner = randomUUID();
const reviewer = randomUUID();
const outsider = randomUUID();
const identities = new Map([
  ["Bearer owner", { id: owner, scopes: new Set<string>() }],
  [
    "Bearer reviewer",
    {
      id: reviewer,
      scopes: new Set(["approval:review"]),
    },
  ],
  ["Bearer outsider", { id: outsider, scopes: new Set<string>() }],
  [
    "Bearer both",
    {
      id: owner,
      scopes: new Set(["approval:review"]),
    },
  ],
]);

describe("Approval Request on migrated PostgreSQL", () => {
  let release: (() => void) | undefined;
  let fixture: Promise<void> | undefined;
  let repo!: PrismaApprovalRequestRepository;
  let app!: ReturnType<typeof createApp>["app"];
  let dependencyReady = true;
  beforeAll(async () => {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalReady!: () => void;
    let signalFailure!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      signalReady = resolve;
      signalFailure = reject;
    });
    fixture = withMigratedDatabase(async (runtimeUrl) => {
      repo = createRepository(runtimeUrl);
      const assembled = assemble({
        service: new ApprovalRequestService(repo),
        checkReady: async () => {
          if (!dependencyReady) return false;
          await repo.db.$queryRaw`SELECT 1`;
          return true;
        },
        verifier: {
          verify: (authorization) =>
            Promise.resolve(identities.get(authorization ?? "") ?? null),
        },
      });
      app = assembled.app;
      await app.ready();
      assembled.lifecycle.markReady();
      signalReady();
      await gate;
      await app.close();
      await repo.db.$disconnect();
    }).catch((error: unknown) => {
      signalFailure(error);
      throw error;
    });
    await ready;
  }, 120_000);
  afterAll(async () => {
    release?.();
    await fixture;
  }, 30_000);

  async function call(
    method: string,
    url: string,
    token = "owner",
    payload?: object,
    key?: string,
  ) {
    const reply = await app.inject({
      method: method as "GET",
      url,
      headers: {
        authorization: `Bearer ${token}`,
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(payload ? { payload } : {}),
    });
    return {
      status: reply.statusCode,
      body: reply.json<Record<string, unknown>>(),
    };
  }
  async function create(title = "Budget") {
    const result = await call(
      "POST",
      "/approval-requests",
      "owner",
      { title },
      randomUUID(),
    );
    expect(result.status).toBe(201);
    return result.body as {
      id: string;
      version: number;
      status: string;
      createdAt: string;
      updatedAt: string;
    };
  }
  it("keeps liveness independent when a required database is unready", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/health/ready" })).statusCode,
    ).toBe(200);
    dependencyReady = false;
    expect(
      (await app.inject({ method: "GET", url: "/health/ready" })).statusCode,
    ).toBe(503);
    expect(
      (await app.inject({ method: "GET", url: "/health/live" })).statusCode,
    ).toBe(200);
    dependencyReady = true;
  });
  it("rejects anonymous access and requires a key", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: "/approval-requests",
    });
    expect(anonymous.statusCode).toBe(401);
    expect(
      (await call("POST", "/approval-requests", "owner", { title: "x" }))
        .status,
    ).toBe(400);
  });
  it("limits feature requests before authentication without limiting health", async () => {
    let verifications = 0;
    const limited = assemble({
      service: new ApprovalRequestService(repo),
      verifier: {
        verify: () => {
          verifications++;
          return Promise.resolve(null);
        },
      },
      rateLimit: { max: 2, timeWindow: 3_600_000 },
    });
    try {
      limited.lifecycle.markReady();
      for (const [index, url] of [
        "/approval-requests",
        "/approval-requests/not-an-id",
      ].entries()) {
        const denied = await limited.app.inject({
          method: "GET",
          url,
          headers: { "x-forwarded-for": `192.0.2.${index + 1}` },
        });
        expect(denied.statusCode).toBe(401);
      }
      const exceeded = await limited.app.inject({
        method: "POST",
        url: "/approval-requests",
        headers: { "x-forwarded-for": "192.0.2.3" },
        payload: {},
      });
      expect(exceeded.statusCode).toBe(429);
      expect(exceeded.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again later.",
          requestId: exceeded.headers["x-request-id"],
        },
      });
      expect(Number(exceeded.headers["retry-after"])).toBeGreaterThan(0);
      expect(verifications).toBe(2);
      expect((await limited.app.inject("/health/live")).statusCode).toBe(200);
    } finally {
      await limited.app.close();
    }
  });
  it("replays a creation intent and rejects conflicting reuse", async () => {
    const key = randomUUID();
    const first = await call(
      "POST",
      "/approval-requests",
      "owner",
      { title: "Intent" },
      key,
    );
    expect(first.status).toBe(201);
    const replay = await call(
      "POST",
      "/approval-requests",
      "owner",
      { title: "Intent" },
      key,
    );
    expect(replay.body.id).toBe(first.body.id);
    const changed = await call(
      "POST",
      "/approval-requests",
      "owner",
      { title: "Different" },
      key,
    );
    expect(changed.status).toBe(409);
    expect((changed.body.error as { code: string }).code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
  });
  it("keeps concurrent creation keyed to one durable request", async () => {
    const sameKey = randomUUID();
    const sameIntent = await Promise.all([
      call(
        "POST",
        "/approval-requests",
        "owner",
        { title: "Concurrent same" },
        sameKey,
      ),
      call(
        "POST",
        "/approval-requests",
        "owner",
        { title: "Concurrent same" },
        sameKey,
      ),
    ]);
    expect(sameIntent.map((result) => result.status)).toEqual([201, 201]);
    expect(sameIntent[0].body.id).toBe(sameIntent[1].body.id);
    const differentKey = randomUUID();
    const differentIntent = await Promise.all([
      call(
        "POST",
        "/approval-requests",
        "owner",
        { title: "First intent" },
        differentKey,
      ),
      call(
        "POST",
        "/approval-requests",
        "owner",
        { title: "Second intent" },
        differentKey,
      ),
    ]);
    expect(differentIntent.map((result) => result.status).sort()).toEqual([
      201, 409,
    ]);
  });
  it("preserves the committed creation after a caller times out before its response", async () => {
    const key = randomUUID();
    let committed!: () => void;
    let releaseResponse!: () => void;
    const writeCommitted = new Promise<void>((resolve) => {
      committed = resolve;
    });
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const delayed = assemble({
      service: new ApprovalRequestService({
        create: async (input) => {
          const result = await repo.create(input);
          committed();
          await responseGate;
          return result;
        },
        get: (id) => repo.get(id),
        list: (filter) => repo.list(filter),
        compareAndSwap: (input) => repo.compareAndSwap(input),
      }),
      verifier: {
        verify: (authorization) =>
          Promise.resolve(identities.get(authorization ?? "") ?? null),
      },
    });
    try {
      const pending = delayed.app.inject({
        method: "POST",
        url: "/approval-requests",
        headers: { authorization: "Bearer owner", "idempotency-key": key },
        payload: { title: "Unknown outcome" },
      });
      await writeCommitted;
      await expect(
        Promise.race([
          pending.then(() => "response"),
          Promise.resolve("caller deadline"),
        ]),
      ).resolves.toBe("caller deadline");
      releaseResponse();
      const first = await pending;
      expect(first.statusCode).toBe(201);
      const replay = await call(
        "POST",
        "/approval-requests",
        "owner",
        { title: "Unknown outcome" },
        key,
      );
      expect(replay.status).toBe(201);
      expect(replay.body.id).toBe(first.json<{ id: string }>().id);
      const rows = await repo.db.approvalRequest.count({
        where: { creatorId: owner, idempotencyKey: key },
      });
      expect(rows).toBe(1);
    } finally {
      releaseResponse();
      await delayed.app.close();
    }
  });
  it("rolls back an invalid atomic update without advancing the version", async () => {
    const item = await create("Rollback candidate");
    await expect(
      repo.compareAndSwap({
        id: item.id,
        creatorId: owner,
        expectedVersion: 1,
        sourceStatus: "DRAFT",
        nextStatus: "SUBMITTED",
        title: " ",
        description: null,
        requireOwner: true,
      }),
    ).rejects.toThrow();
    const unchanged = await call("GET", `/approval-requests/${item.id}`);
    expect(unchanged.body).toMatchObject({
      title: "Rollback candidate",
      status: "DRAFT",
      version: 1,
    });
    const submitted = await call(
      "POST",
      `/approval-requests/${item.id}/submit`,
      "owner",
      { expectedVersion: 1 },
    );
    expect(submitted.body).toMatchObject({ status: "SUBMITTED", version: 2 });
  });
  it("enforces owner and review visibility before pagination", async () => {
    const item = await create();
    expect(
      (await call("GET", `/approval-requests/${item.id}`, "outsider")).status,
    ).toBe(404);
    expect(
      (await call("GET", `/approval-requests/${item.id}`, "reviewer")).status,
    ).toBe(404);
    expect(
      (await call("GET", "/approval-requests?scope=reviewable", "outsider"))
        .status,
    ).toBe(403);
    const submitted = await call(
      "POST",
      `/approval-requests/${item.id}/submit`,
      "owner",
      { expectedVersion: 1 },
    );
    expect(submitted.status).toBe(200);
    expect(
      (await call("GET", `/approval-requests/${item.id}`, "reviewer")).status,
    ).toBe(200);
    const reviewPage = await call(
      "GET",
      "/approval-requests?scope=reviewable&limit=1",
      "reviewer",
    );
    expect((reviewPage.body.items as { id: string }[])[0]?.id).toBe(item.id);
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/approve`, "both", {
          expectedVersion: 2,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "POST",
          `/approval-requests/${item.id}/approve`,
          "outsider",
          { expectedVersion: 2 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/cancel`, "reviewer", {
          expectedVersion: 2,
        })
      ).status,
    ).toBe(404);
    const approved = await call(
      "POST",
      `/approval-requests/${item.id}/approve`,
      "reviewer",
      { expectedVersion: 2 },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(
      (await call("GET", `/approval-requests/${item.id}`, "reviewer")).status,
    ).toBe(404);
  });
  it("validates edit, rejection reason, terminal state, and stale version", async () => {
    const item = await create();
    const edit = await call(
      "PUT",
      `/approval-requests/${item.id}/draft`,
      "owner",
      { expectedVersion: 1, title: "Updated" },
    );
    expect(edit.status).toBe(200);
    expect(edit.body.version).toBe(2);
    expect(
      (
        await call("PUT", `/approval-requests/${item.id}/draft`, "owner", {
          expectedVersion: 1,
          title: "Stale",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/reject`, "reviewer", {
          expectedVersion: 2,
          reason: "no",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/submit`, "owner", {
          expectedVersion: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/reject`, "reviewer", {
          expectedVersion: 3,
          reason: "  ",
        })
      ).status,
    ).toBe(400);
    const rejected = await call(
      "POST",
      `/approval-requests/${item.id}/reject`,
      "reviewer",
      { expectedVersion: 3, reason: "Insufficient detail" },
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.rejectionReason).toBe("Insufficient detail");
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/cancel`, "owner", {
          expectedVersion: 4,
        })
      ).status,
    ).toBe(409);
  });
  it("cancels drafts and submitted requests only once", async () => {
    const draft = await create();
    const cancelledDraft = await call(
      "POST",
      `/approval-requests/${draft.id}/cancel`,
      "owner",
      { expectedVersion: 1 },
    );
    expect(cancelledDraft.status).toBe(200);
    expect(cancelledDraft.body.status).toBe("CANCELLED");
    expect(
      (
        await call("POST", `/approval-requests/${draft.id}/cancel`, "owner", {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    const submitted = await create();
    expect(
      (
        await call(
          "POST",
          `/approval-requests/${submitted.id}/submit`,
          "owner",
          { expectedVersion: 1 },
        )
      ).status,
    ).toBe(200);
    const cancelledSubmitted = await call(
      "POST",
      `/approval-requests/${submitted.id}/cancel`,
      "owner",
      { expectedVersion: 2 },
    );
    expect(cancelledSubmitted.status).toBe(200);
    expect(cancelledSubmitted.body.status).toBe("CANCELLED");
    expect(
      (
        await call(
          "POST",
          `/approval-requests/${submitted.id}/approve`,
          "reviewer",
          { expectedVersion: 3 },
        )
      ).status,
    ).toBe(409);
  });
  it("does not repeat a submitted transition after a lost response", async () => {
    const item = await create("Submit once");
    const first = await call(
      "POST",
      `/approval-requests/${item.id}/submit`,
      "owner",
      { expectedVersion: 1 },
    );
    expect(first.body).toMatchObject({ status: "SUBMITTED", version: 2 });
    const repeated = await call(
      "POST",
      `/approval-requests/${item.id}/submit`,
      "owner",
      { expectedVersion: 1 },
    );
    expect(repeated.status).toBe(409);
    expect((repeated.body.error as { code: string }).code).toBe(
      "RESOURCE_VERSION_CONFLICT",
    );
    expect(
      (await call("GET", `/approval-requests/${item.id}`)).body,
    ).toMatchObject({
      status: "SUBMITTED",
      version: 2,
    });
  });
  it("allows only one concurrent conditional write", async () => {
    const item = await create();
    const competing = await Promise.all([
      call("PUT", `/approval-requests/${item.id}/draft`, "owner", {
        expectedVersion: 1,
        title: "Edited",
      }),
      call("POST", `/approval-requests/${item.id}/submit`, "owner", {
        expectedVersion: 1,
      }),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await call("GET", `/approval-requests/${item.id}`);
    expect(current.body.version).toBe(2);
    if (current.body.status === "SUBMITTED") {
      const terminal = await Promise.all([
        call("POST", `/approval-requests/${item.id}/approve`, "reviewer", {
          expectedVersion: 2,
        }),
        call("POST", `/approval-requests/${item.id}/reject`, "reviewer", {
          expectedVersion: 2,
          reason: "No",
        }),
        call("POST", `/approval-requests/${item.id}/cancel`, "owner", {
          expectedVersion: 2,
        }),
      ]);
      expect(terminal.filter((r) => r.status === 200)).toHaveLength(1);
      expect(terminal.filter((r) => r.status === 409)).toHaveLength(2);
    }
  });
  it("keeps one terminal outcome when reviewer decisions race with owner cancellation", async () => {
    const item = await create();
    expect(
      (
        await call("POST", `/approval-requests/${item.id}/submit`, "owner", {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(200);
    const terminal = await Promise.all([
      call("POST", `/approval-requests/${item.id}/approve`, "reviewer", {
        expectedVersion: 2,
      }),
      call("POST", `/approval-requests/${item.id}/reject`, "reviewer", {
        expectedVersion: 2,
        reason: "No",
      }),
      call("POST", `/approval-requests/${item.id}/cancel`, "owner", {
        expectedVersion: 2,
      }),
    ]);
    expect(terminal.filter((r) => r.status === 200)).toHaveLength(1);
    expect(terminal.filter((r) => r.status === 409)).toHaveLength(2);
    const final = await call("GET", `/approval-requests/${item.id}`);
    expect(final.body.version).toBe(3);
    expect(["APPROVED", "REJECTED", "CANCELLED"]).toContain(final.body.status);
    expect(final.body.rejectionReason === null).toBe(
      final.body.status !== "REJECTED",
    );
  });
  it("uses scope-bound cursors and reapplies authorization on each page", async () => {
    await create("Page one");
    await create("Page two");
    const first = await call("GET", "/approval-requests?limit=1", "owner");
    expect(first.body.items as unknown[]).toHaveLength(1);
    const cursor = first.body.nextCursor as string;
    expect(cursor).toBeTruthy();
    const second = await call(
      "GET",
      `/approval-requests?limit=1&cursor=${encodeURIComponent(cursor)}`,
      "owner",
    );
    expect((second.body.items as { id: string }[])[0]?.id).not.toBe(
      (first.body.items as { id: string }[])[0]?.id,
    );
    expect(
      (
        await call(
          "GET",
          `/approval-requests?limit=1&cursor=${encodeURIComponent(cursor)}`,
          "reviewer",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "GET",
          `/approval-requests?limit=1&cursor=${encodeURIComponent(cursor)}&scope=reviewable`,
          "reviewer",
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("GET", "/approval-requests?cursor=corrupt", "owner")).status,
    ).toBe(400);
    const invalidIdCursor = Buffer.from(
      JSON.stringify([
        1,
        "mine",
        owner,
        new Date().toISOString(),
        "------------------------------------",
      ]),
    ).toString("base64url");
    expect(
      (
        await call(
          "GET",
          `/approval-requests?cursor=${invalidIdCursor}`,
          "owner",
        )
      ).status,
    ).toBe(400);
  });
  it("enforces database constraints independently of HTTP", async () => {
    const item = await create();
    await expect(
      repo.db
        .$executeRaw`UPDATE approval_requests SET version = 0 WHERE id = ${item.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      repo.db
        .$executeRaw`UPDATE approval_requests SET status = 'REJECTED'::"ApprovalRequestStatus" WHERE id = ${item.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      repo.db
        .$executeRaw`UPDATE approval_requests SET title = ${"\t"} WHERE id = ${item.id}::uuid`,
    ).rejects.toThrow();
    const [identity] = await repo.db.$queryRaw<
      { current_user: string }[]
    >`SELECT current_user`;
    expect(identity?.current_user).toBe("orion_runtime");
    await expect(
      repo.db.$executeRaw`CREATE TABLE forbidden_runtime_ddl (id integer)`,
    ).rejects.toThrow();
    await expect(
      repo.db
        .$executeRaw`UPDATE approval_requests SET creator_id = ${randomUUID()}::uuid WHERE id = ${item.id}::uuid`,
    ).rejects.toThrow();
  });
});
