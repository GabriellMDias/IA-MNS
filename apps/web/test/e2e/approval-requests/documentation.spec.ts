import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures.ts";
import type { ApprovalRequestsStack } from "./stack.ts";

// Living Documentation checks for the Approval Request reference content.
let stack: ApprovalRequestsStack;
test.beforeEach(({ approval }) => {
  stack = approval;
});

async function openDocument(page: Page, path: string, title: string) {
  await page.goto(`${stack.webUrl}${path}`);
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
}

async function expectNoStoredCredentials(page: Page) {
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await expect(page).not.toHaveURL(/eyJ[A-Za-z0-9_-]+/);
}

test("reference operations and tables have isolated deep-linked pages", async ({
  page,
}) => {
  await openDocument(page, "/docs/api", "API reference");
  await page
    .locator('a[href="/docs/api/createApprovalRequest"]')
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "createApprovalRequest",
  );
  await expect(
    page.getByRole("heading", {
      name: "editApprovalRequestDraft",
      exact: true,
    }),
  ).toHaveCount(0);
  await openDocument(page, "/docs/database", "Data dictionary");
  await page
    .locator('a[href="/docs/database/approval_requests"]')
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "approval_requests",
  );
  await expect(
    page.getByRole("rowheader", { name: "creator_id", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No supporting context supplied.", { exact: false }),
  ).toBeVisible();
  await page.goto(`${stack.webUrl}/docs/search?q=creator_id`);
  await expect(
    page.locator('a[href^="/docs/database/approval_requests"]').first(),
  ).toBeVisible();
});

test("the database artifact includes the reference constraints", async ({
  page,
}) => {
  await openDocument(page, "/docs/database", "Data dictionary");
  const href = await page
    .getByRole("link", { name: "AI-readable database reference" })
    .first()
    .getAttribute("href");
  const response = await page.request.get(
    new URL(href!, stack.webUrl).toString(),
  );
  expect(await response.text()).toContain(
    "approval_requests_creator_key_unique",
  );
});

test("API explorer validates input and requires confirmation before an authenticated mutation", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/approval-requests"
    )
      sent.push(request.url());
  });
  await openDocument(
    page,
    "/docs/api/createApprovalRequest",
    "createApprovalRequest",
  );
  const explorer = page.getByRole("region", { name: "Try this operation" });
  const token = explorer.getByLabel("Access token", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await token.fill(stack.ownerToken);
  await explorer
    .getByLabel("idempotency-key (header)", { exact: true })
    .fill(crypto.randomUUID());
  await explorer
    .getByLabel("JSON request body", { exact: true })
    .fill('{"title":"Synthetic documentation request","description":null}');
  expect(sent).toEqual([]);
  const confirmation = explorer.getByRole("checkbox", {
    name: "I understand this request can change real API data.",
  });
  await expect(confirmation).not.toBeChecked();
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  expect(sent).toEqual([]);
  await expect(confirmation).toBeFocused();
  await confirmation.check();
  await explorer
    .getByLabel("JSON request body", { exact: true })
    .fill("{ invalid JSON");
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(explorer.getByRole("alert")).toContainText(/JSON/i);
  expect(sent).toEqual([]);
  await explorer
    .getByLabel("JSON request body", { exact: true })
    .fill('{"title":"Synthetic documentation request","description":null}');
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(explorer.getByText("HTTP 201", { exact: false })).toBeVisible();
  expect(sent).toHaveLength(1);
  const result = JSON.parse(
    await explorer.locator("pre").last().innerText(),
  ) as { id: string; title: string };
  expect(result.title).toBe("Synthetic documentation request");
  const persisted = await page.request.get(
    `${stack.apiUrl}/approval-requests/${result.id}`,
    { headers: { authorization: `Bearer ${stack.ownerToken}` } },
  );
  expect(persisted.status()).toBe(200);
  expect(((await persisted.json()) as { title: string }).title).toBe(
    result.title,
  );
  await expectNoStoredCredentials(page);
  await explorer
    .getByRole("button", { name: "Clear request and response", exact: true })
    .click();
  await expect(token).toHaveValue("");
  await expect(confirmation).not.toBeChecked();
  await expect(
    explorer.getByRole("heading", { name: "Response", exact: true }),
  ).toHaveCount(0);
  await token.fill("synthetic-invalid-token");
  await page.reload();
  await expect(page.getByLabel("Access token", { exact: true })).toHaveValue(
    "",
  );
});

test("API explorer reports real authentication failures", async ({ page }) => {
  await openDocument(
    page,
    "/docs/api/listApprovalRequests",
    "listApprovalRequests",
  );
  const explorer = page.getByRole("region", { name: "Try this operation" });
  await explorer
    .getByLabel("Access token", { exact: true })
    .fill("synthetic-invalid-token");
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(explorer.getByText("HTTP 401", { exact: false })).toBeVisible();
  await expect(explorer.locator("pre").last()).toContainText(
    "AUTHENTICATION_REQUIRED",
  );
  await expectNoStoredCredentials(page);
});

for (const [path, title] of [
  ["/docs/api/createApprovalRequest", "createApprovalRequest"],
  ["/docs/database/approval_requests", "approval_requests"],
]) {
  test(`reference documentation has no automated WCAG A/AA violations at ${path}`, async ({
    page,
  }) => {
    await openDocument(page, path, title);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
