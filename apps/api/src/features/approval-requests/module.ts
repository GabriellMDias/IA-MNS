import type { AccessTokenVerifier } from "../../authentication.js";
import type { ApiModule, RegisteredModule } from "../../module.js";
import { approvalOperations } from "./contracts.js";
import { approvalErrors } from "./errors.js";
import { PrismaApprovalRequestRepository } from "./prisma-repository.js";
import { registerApprovalRoutes } from "./routes.js";
import { ApprovalRequestService } from "./service.js";

/** Mounts the reference routes for an assembled service and verifier. */
export function approvalRequestRoutes(options: {
  service: ApprovalRequestService;
  verifier: AccessTokenVerifier;
  rateLimit?: { max: number; timeWindow: number };
}): RegisteredModule {
  return {
    name: "approval-requests",
    register: (app) =>
      registerApprovalRoutes(
        app,
        options.service,
        options.verifier,
        options.rateLimit,
      ),
  };
}

// Orion's executable reference slice. It is foundation-only: projects derived
// from Orion start without it and compose their own modules instead.
export const approvalRequestsModule: ApiModule = {
  name: "approval-requests",
  tag: "Approval Requests",
  requires: ["database", "authentication"],
  operations: approvalOperations,
  errors: approvalErrors,
  activate: ({ database, verifier }) =>
    approvalRequestRoutes({
      // Activation guarantees both declared requirements are configured.
      service: new ApprovalRequestService(
        new PrismaApprovalRequestRepository(database!),
      ),
      verifier: verifier!,
    }),
};
