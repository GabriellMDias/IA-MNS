import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import type { ApprovalRequestsStack } from "./stack.ts";

let stack: ApprovalRequestsStack;
test.beforeEach(({ approval }) => {
  stack = approval;
});
const webUrl = () => stack.webUrl;
const appUrl = () => `${stack.webUrl}/approval-requests`;
const apiUrl = () => stack.apiUrl;

async function connect(page: Page, token: string) {
  await page.getByLabel("Access token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
}

test("local synthetic identities connect without persisting bearer tokens", async ({
  page,
}) => {
  const withoutOrigin = await page.request.post(
    `${webUrl()}/__orion_local_identity/owner`,
  );
  expect(withoutOrigin.status()).toBe(403);
  const localResponse = await page.request.post(
    `${webUrl()}/__orion_local_identity/owner`,
    { headers: { origin: webUrl() } },
  );
  expect(localResponse.status()).toBe(200);
  expect(localResponse.headers()["cache-control"]).toBe("no-store");
  await page.goto(appUrl());
  await page.getByRole("button", { name: "Use local owner" }).click();
  await expect(
    page.getByRole("heading", { name: "Approval requests" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/eyJ[A-Za-z0-9_-]+/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Connect with/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use local reviewer" }).click();
  await expect(
    page.getByRole("heading", { name: "Approval requests" }),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
  }));
  expect(storage).toEqual({ local: 0, session: 0 });
});

test("owner creates, edits, submits and a different reviewer approves through PostgreSQL", async ({
  page,
}) => {
  const title = `Browser request ${Date.now()}`;
  await page.goto(appUrl());
  await connect(page, stack.ownerToken);
  await expect(
    page.getByRole("heading", { name: "Approval requests" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Original description");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page
    .getByLabel("Description", { exact: true })
    .fill("Edited description");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator("p.description")).toHaveText("Edited description");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("SUBMITTED", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All requests" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).toContainText("SUBMITTED");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("alert")).toContainText("permission");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await connect(page, stack.reviewerToken);
  await page.getByRole("link", { name: "All requests" }).click();
  await page.getByRole("link", { name: "For review" }).click();
  await expect(page).toHaveURL(/scope=reviewable/);
  await page.reload();
  await expect(page).toHaveURL(/scope=reviewable/);
  await connect(page, stack.reviewerToken);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(new RegExp(`/approval-requests/${id}$`));
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/approval-requests/${id}$`));
  await connect(page, stack.reviewerToken);
  await expect(page.getByRole("alert")).toContainText("not found");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await connect(page, stack.ownerToken);
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
});

test("a stale browser mutation reports conflict and preserves the newer database state", async ({
  page,
}) => {
  const title = `Stale request ${Date.now()}`;
  await page.goto(appUrl());
  await connect(page, stack.ownerToken);
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const response = await fetch(`${apiUrl()}/approval-requests/${id}/submit`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${stack.ownerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expectedVersion: 1 }),
  });
  expect(response.status).toBe(200);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await page.getByRole("button", { name: "Reload current request" }).click();
  await expect(page.getByText("SUBMITTED", { exact: true })).toBeVisible();
});

test("a late creation response cannot navigate a replacement credential session", async ({
  page,
}) => {
  let releaseResponse!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let responseReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  await page.route("**/api/approval-requests", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    responseReady();
    await released;
    await route.fulfill({ response });
  });
  await page.goto(appUrl());
  await connect(page, stack.ownerToken);
  await page.getByRole("textbox", { name: "Title" }).fill("Delayed creation");
  await page.getByRole("button", { name: "Create draft" }).click();
  await ready;
  await page.getByRole("button", { name: "Disconnect" }).click();
  await connect(page, stack.reviewerToken);
  const completed = page.waitForResponse(
    (response) => response.request().method() === "POST",
  );
  releaseResponse();
  await completed;
  // Flush the completed response's React updates before checking the new view.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page).toHaveURL(new RegExp(`^${appUrl()}/?(?:\\?.*)?$`));
  await expect(
    page.getByRole("heading", { name: "Approval requests" }),
  ).toBeVisible();
});

test("a late draft response cannot restore former-session data to the cache", async ({
  page,
}) => {
  await page.goto(appUrl());
  await connect(page, stack.ownerToken);
  await page
    .getByRole("textbox", { name: "Title" })
    .fill("Delayed private draft");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Delayed private draft" }),
  ).toBeVisible();

  let releaseResponse!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let responseReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  await page.route("**/api/approval-requests/*/draft", async (route) => {
    const response = await route.fetch();
    responseReady();
    await released;
    await route.fulfill({ response });
  });
  await page
    .getByLabel("Description", { exact: true })
    .fill("Former session data");
  await page.getByRole("button", { name: "Save draft" }).click();
  await ready;
  await page.getByRole("button", { name: "Disconnect" }).click();
  await connect(page, stack.reviewerToken);
  await expect(page.getByRole("alert")).toContainText("not found");
  const completed = page.waitForResponse(
    (response) => response.request().method() === "PUT",
  );
  releaseResponse();
  await completed;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(page.getByRole("alert")).toContainText("not found");
  await expect(
    page.getByText("Former session data", { exact: true }),
  ).toHaveCount(0);
});
