import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { parseServerConfig } from "../../src/config.js";
import type { ApprovalRequest } from "../../src/features/approval-requests/domain.js";
import {
  ApprovalRequestService,
  type Repository,
} from "../../src/features/approval-requests/service.js";
import { createLogger } from "../../src/logging.js";
import { approvalRequestRoutes } from "../../src/features/approval-requests/module.js";

describe("Approval Request dependency failure", () => {
  it("reports one safe diagnostic and does not retry a failed write", async () => {
    const secret = "synthetic-secret-in-dependency-error";
    const id = randomUUID();
    const owner = randomUUID();
    const item: ApprovalRequest = {
      id,
      creatorId: owner,
      title: "Do not log request content",
      description: null,
      status: "DRAFT",
      version: 1,
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const compareAndSwap = vi.fn<Repository["compareAndSwap"]>(() =>
      Promise.reject(new Error(secret)),
    );
    const repository: Repository = {
      create: () => Promise.reject(new Error("unexpected create")),
      get: () => Promise.resolve(item),
      list: () => Promise.resolve([]),
      compareAndSwap,
    };
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const app = createApp(
      createLogger(parseServerConfig({ ORION_ENV: "test" }), destination),
      undefined,
      {
        modules: [
          approvalRequestRoutes({
            service: new ApprovalRequestService(repository),
            verifier: {
              verify: () => Promise.resolve({ id: owner, scopes: new Set() }),
            },
          }),
        ],
      },
    ).app;
    try {
      const response = await app.inject({
        method: "POST",
        url: `/approval-requests/${id}/submit`,
        headers: { authorization: "Bearer synthetic-secret-token" },
        payload: { expectedVersion: 1 },
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        error: {
          code: "INTERNAL_ERROR",
          requestId: response.headers["x-request-id"],
        },
      });
      expect(compareAndSwap).toHaveBeenCalledTimes(1);
      const expected = await app.inject({
        method: "POST",
        url: `/approval-requests/${id}/submit`,
        headers: { authorization: "Bearer synthetic-secret-token" },
        payload: { expectedVersion: 2 },
      });
      expect(expected.statusCode).toBe(409);
      expect(expected.json()).toMatchObject({
        error: { code: "RESOURCE_VERSION_CONFLICT" },
      });
      expect(compareAndSwap).toHaveBeenCalledTimes(1);
      const diagnostics = lines.map(
        (line) => JSON.parse(line) as Record<string, unknown>,
      );
      expect(
        diagnostics.filter((entry) => entry.msg === "unhandled_request_error"),
      ).toHaveLength(1);
      expect(diagnostics.map((entry) => entry.msg)).toContain("http_request");
      const artifacts = response.body + lines.join("");
      expect(artifacts).not.toContain(secret);
      expect(artifacts).not.toContain("synthetic-secret-token");
      expect(artifacts).not.toContain(item.title);
      expect(artifacts).not.toContain(id);
    } finally {
      await app.close();
    }
  });
});
