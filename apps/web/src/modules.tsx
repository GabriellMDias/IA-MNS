import {
  ApprovalRequestsNavigation,
  approvalRequestsRouteTree,
} from "./approval-requests/routes.js";
import { coreRoutes, rootRoute } from "./shell.js";

// Composition owned by this repository. Orion mounts its Approval Request
// reference workflow; a derived project starts with only the shared routes.
export const routeTree = rootRoute.addChildren([
  ...coreRoutes,
  approvalRequestsRouteTree,
]);

export const moduleNavigation = [ApprovalRequestsNavigation] as const;
