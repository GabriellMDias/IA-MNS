import { describe, expect, it } from "vitest";
import {
  authorize,
  BusinessFailure,
  nextStatus,
  validateDraft,
  validateRejectionReason,
  type ApprovalRequest,
  type Principal,
} from "../../src/features/approval-requests/domain.js";

const owner: Principal = {
  id: "9f2c592e-63d7-4e45-923c-3c38a3298761",
  capabilities: new Set(),
};
const reviewer: Principal = {
  id: "f5774425-684d-48c2-96e5-347d42823d4e",
  capabilities: new Set(["approval:review"]),
};
const both: Principal = {
  id: owner.id,
  capabilities: new Set(["approval:review"]),
};
const item: ApprovalRequest = {
  id: "b3d84984-b6e1-4621-944f-5b4080d2a4e9",
  creatorId: owner.id,
  title: "Budget",
  description: null,
  status: "SUBMITTED",
  version: 2,
  rejectionReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Approval Request domain", () => {
  it("rejects unusable draft content and rejection reasons independently of HTTP", () => {
    expect(() => validateDraft("  ", null)).toThrowError(BusinessFailure);
    expect(() => validateDraft("Purpose", "  ")).toThrowError(BusinessFailure);
    expect(() => validateDraft("Purpose", null)).not.toThrow();
    expect(() => validateRejectionReason(undefined)).toThrowError(
      BusinessFailure,
    );
    expect(() => validateRejectionReason(" \t ")).toThrowError(BusinessFailure);
    expect(() => validateRejectionReason("Insufficient detail")).not.toThrow();
  });
  it("allows only documented transitions and makes terminal states immutable", () => {
    expect(nextStatus("DRAFT", "edit")).toBe("DRAFT");
    expect(nextStatus("DRAFT", "submit")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "approve")).toBe("APPROVED");
    expect(nextStatus("SUBMITTED", "reject")).toBe("REJECTED");
    expect(nextStatus("DRAFT", "cancel")).toBe("CANCELLED");
    expect(nextStatus("SUBMITTED", "cancel")).toBe("CANCELLED");
    for (const state of ["APPROVED", "REJECTED", "CANCELLED"] as const)
      for (const action of [
        "edit",
        "submit",
        "approve",
        "reject",
        "cancel",
      ] as const)
        expect(() => nextStatus(state, action)).toThrowError(BusinessFailure);
    expect(() => nextStatus("DRAFT", "approve")).toThrowError(BusinessFailure);
  });
  it("keeps ownership and reviewer capability independent, with self-review denied", () => {
    expect(() => authorize(owner, item, "get")).not.toThrow();
    expect(() => authorize(reviewer, item, "get")).not.toThrow();
    expect(() => authorize(reviewer, item, "approve")).not.toThrow();
    expect(() => authorize(owner, item, "approve")).toThrowError(
      BusinessFailure,
    );
    expect(() => authorize(both, item, "reject")).toThrowError(BusinessFailure);
    expect(() => authorize(reviewer, item, "cancel")).toThrowError(
      BusinessFailure,
    );
    expect(() =>
      authorize({ ...reviewer, capabilities: new Set() }, item, "get"),
    ).toThrowError(BusinessFailure);
    expect(() =>
      authorize(reviewer, { ...item, status: "DRAFT" }, "get"),
    ).toThrowError(BusinessFailure);
  });
});
