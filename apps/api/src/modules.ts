import type { ApiModule } from "./module.js";
import { approvalRequestsModule } from "./features/approval-requests/module.js";

// Composition owned by this repository. Orion composes its Approval Request
// reference slice; a derived project starts with an empty list.
export const apiModules: readonly ApiModule[] = [approvalRequestsModule];
