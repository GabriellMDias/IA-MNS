import { describe, expect, it } from "vitest";
import { activateModules } from "../../src/module.js";
import { publicErrorRegistry } from "../../src/error-registry.js";
import { approvalRequestsModule } from "../../src/features/approval-requests/module.js";
import { principalFrom } from "../../src/features/approval-requests/routes.js";

describe("Approval Request reference module", () => {
  it("requires both the database and bearer authentication", () => {
    expect(approvalRequestsModule.requires).toEqual([
      "database",
      "authentication",
    ]);
    expect(activateModules([approvalRequestsModule], {}, "test")).toEqual([]);
    expect(() =>
      activateModules([approvalRequestsModule], {}, "production"),
    ).toThrow("approval-requests requires database and authentication");
  });

  it("owns its business errors in the public registry", () => {
    const registry = publicErrorRegistry([approvalRequestsModule]);
    expect(registry.APPROVAL_REQUEST_INVALID_STATE?.status).toBe(409);
    expect(registry.PERMISSION_DENIED?.status).toBe(403);
    for (const operation of approvalRequestsModule.operations)
      for (const code of operation.expectedErrors ?? [])
        expect(
          registry[code],
          `${operation.operationId} ${code}`,
        ).toBeDefined();
  });

  it("maps only the issuer review scope to the review capability", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect([
      ...principalFrom({ id, scopes: new Set(["approval:review", "other"]) })
        .capabilities,
    ]).toEqual(["approval:review"]);
    expect(
      principalFrom({ id, scopes: new Set(["approval:read"]) }).capabilities
        .size,
    ).toBe(0);
  });
});
