import { test as base } from "@playwright/test";
import {
  startApprovalRequestsStack,
  type ApprovalRequestsStack,
} from "./stack.ts";

// One reference stack per worker, shared by every reference spec file.
export const test = base.extend<
  Record<never, never>,
  { approval: ApprovalRequestsStack }
>({
  approval: [
    // Playwright requires object destructuring for fixture dependencies.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const stack = await startApprovalRequestsStack();
      try {
        await use(stack);
      } finally {
        await stack.stop();
      }
    },
    { scope: "worker", timeout: 180_000 },
  ],
});
export { expect } from "@playwright/test";
