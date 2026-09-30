import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const webUrl = () => process.env.ORION_E2E_WEB_URL!;
const apiUrl = () => process.env.ORION_E2E_API_URL!;
const sections = (page: Page) =>
  page.getByRole("navigation", { name: "Documentation sections" });

async function openDocument(page: Page, path: string, title: string) {
  await page.goto(`${webUrl()}${path}`);
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

test("documentation sections isolate details and preserve deep links and browser history", async ({
  page,
}) => {
  await openDocument(page, "/docs", "Orion documentation");
  for (const selector of [".docs-brand-symbol", ".brand img"]) {
    const mark = page.locator(selector);
    await expect(mark).toBeVisible();
    await expect(mark).toHaveJSProperty("complete", true);
    expect(
      await mark.evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
  }
  const favicon = page.locator('link[rel="icon"]');
  const iconResponse = await page.request.get(
    new URL((await favicon.getAttribute("href"))!, page.url()).href,
  );
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");
  const touchIcon = page.locator('link[rel="apple-touch-icon"]');
  const touchUrl = new URL((await touchIcon.getAttribute("href"))!, page.url())
    .href;
  const touchResponse = await page.request.get(touchUrl);
  expect(touchResponse.ok()).toBe(true);
  expect(touchResponse.headers()["content-type"]).toContain("image/png");
  expect(
    await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, touchUrl),
  ).toEqual([180, 180]);
  await expect(page.locator(".docs-foundation-version")).toBeVisible();
  await expect(page.locator(".docs-foundation-version")).toContainText(
    "Orion foundation:",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await sections(page)
    .getByRole("link", { name: "API reference", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/api$/);
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
  await expect(
    page.getByRole("heading", { name: "approval_requests", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumbs" }),
  ).toContainText("API");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "createApprovalRequest",
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/api$/);
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "createApprovalRequest",
  );
  await sections(page)
    .getByRole("link", { name: "Data dictionary", exact: true })
    .click();
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
});

test("repository documentation reads locally with heading links and unknown-page recovery", async ({
  page,
}) => {
  await openDocument(page, "/docs/repository/docs/setup", "Development Setup");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await toc
    .getByRole("link", { name: "Prepare a clean checkout", exact: true })
    .click();
  await expect(page).toHaveURL(/#prepare-a-clean-checkout$/);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Prepare a clean checkout",
      exact: true,
    }),
  ).toBeVisible();
  const validationLink = page
    .locator('a[href="/docs/repository/docs/validation"]')
    .first();
  await expect(validationLink).toBeVisible();
  await validationLink.click();
  await expect(page).toHaveURL(/\/docs\/repository\/docs\/validation$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.goto(`${webUrl()}/docs/repository/docs/not-a-real-document`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /not found/i,
  );
  await sections(page)
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Orion documentation",
  );
});

test("full-text search finds authored policy and generated operation, column, and component content", async ({
  page,
}) => {
  await openDocument(page, "/docs", "Orion documentation");
  for (const [query, path] of [
    [
      "destructive integration suites",
      "/docs/repository/docs/architecture/testing-strategy",
    ],
    ["createApprovalRequest", "/docs/api/createApprovalRequest"],
    ["creator_id", "/docs/database/approval_requests"],
    ["onReload", "/docs/components/ErrorNotice"],
  ]) {
    await page
      .getByRole("searchbox", { name: "Search documentation" })
      .fill(query);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/search\?/);
    await expect(page.locator(`a[href^="${path}"]`).first()).toBeVisible();
  }
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search documentation" }),
  ).toHaveValue("onReload");
  await expect(
    page.locator('a[href="/docs/components/ErrorNotice"]').first(),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search documentation" })
    .fill("no-documentation-matches-this-synthetic-query");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/no results|no matching/i)).toBeVisible();
});

test("canonical artifacts are available locally from relevant sections", async ({
  page,
}) => {
  for (const [path, title, label, expected] of [
    ["/docs/api", "API reference", "OpenAPI 3.1 JSON", '"openapi": "3.1.'],
    [
      "/docs/database",
      "Data dictionary",
      "AI-readable database reference",
      "approval_requests_creator_key_unique",
    ],
    [
      "/docs/components",
      "Components",
      "AI-readable component reference",
      "## ErrorNotice",
    ],
  ]) {
    await openDocument(page, path, title);
    const href = await page
      .getByRole("link", { name: label })
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    const url = new URL(href!, webUrl());
    expect(url.origin).toBe(webUrl());
    const response = await page.request.get(url.toString());
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(expected);
  }
});

test("mobile navigation and real component previews keep synthetic input local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sent: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      sent.push(request.url());
  });
  await openDocument(
    page,
    "/docs/components/AccessTokenForm",
    "AccessTokenForm",
  );
  await expect(page.locator(".docs-foundation-version")).toBeVisible();
  await page.getByRole("button", { name: "Browse documentation" }).click();
  await expect(
    sections(page).getByRole("link", { name: "Components", exact: true }),
  ).toBeVisible();
  await sections(page)
    .getByRole("link", { name: "Components", exact: true })
    .click();
  await page
    .locator('a[href="/docs/components/AccessTokenForm"]')
    .first()
    .click();
  const preview = page.locator(".docs-preview").first();
  await expect(
    preview.getByRole("button", { name: "Use local owner" }),
  ).toHaveCount(0);
  await preview
    .getByLabel("Access token", { exact: true })
    .fill("non-secret-example");
  await preview
    .getByRole("button", { name: "Connect", exact: true })
    .press("Enter");
  await expect(preview.getByRole("status")).toContainText("discarded");
  await expect(preview.getByLabel("Access token", { exact: true })).toHaveValue(
    "",
  );
  await expect(page).not.toHaveURL(/non-secret-example/);
  await expectNoStoredCredentials(page);
  expect(sent).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await openDocument(page, "/docs/components/ErrorNotice", "ErrorNotice");
  await page.getByRole("button", { name: "Reload current request" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Demonstration reload selected",
  );
  await openDocument(
    page,
    "/docs/database/approval_requests",
    "approval_requests",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("API explorer waits for an explicit request and returns the real health response", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      sent.push(request.url());
  });
  await openDocument(page, "/docs/api/getReadiness", "getReadiness");
  const explorer = page.getByRole("region", { name: "Try this operation" });
  await expect(
    explorer.getByRole("button", { name: "Send request", exact: true }),
  ).toBeVisible();
  expect(sent).toEqual([]);
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(explorer.getByText("HTTP 200", { exact: false })).toBeVisible();
  await expect(explorer.locator("pre").last()).toContainText('"status": "ok"');
  expect(sent).toHaveLength(1);
  expect(new URL(sent[0]).pathname).toBe("/api/health/ready");
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
  await token.fill(process.env.ORION_E2E_OWNER_TOKEN!);
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
    `${apiUrl()}/approval-requests/${result.id}`,
    {
      headers: { authorization: `Bearer ${process.env.ORION_E2E_OWNER_TOKEN}` },
    },
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

test("API explorer cancellation discards late responses and response markup stays inert", async ({
  page,
}) => {
  let pending: Route | undefined;
  await page.route("**/api/health/ready", (route) => {
    pending = route;
  });
  await openDocument(page, "/docs/api/getReadiness", "getReadiness");
  const explorer = page.getByRole("region", { name: "Try this operation" });
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await explorer
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(
    explorer.getByRole("button", { name: "Send request", exact: true }),
  ).toBeEnabled();
  if (pending) {
    await pending
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"status":"late synthetic response"}',
      })
      .catch(() => undefined);
  }
  await expect(
    explorer.getByRole("heading", { name: "Response", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/health/ready");
  await page.route("**/api/health/ready", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: '<img src="x" onerror="alert(1)">' }),
    }),
  );
  await explorer
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(explorer.getByText("HTTP 200", { exact: false })).toBeVisible();
  await expect(explorer.locator("pre").last()).toContainText("<img");
  await expect(explorer.locator("img")).toHaveCount(0);
});

for (const [path, title] of [
  ["/docs", "Orion documentation"],
  ["/docs/api/createApprovalRequest", "createApprovalRequest"],
  ["/docs/database/approval_requests", "approval_requests"],
  ["/docs/components/AccessTokenForm", "AccessTokenForm"],
  ["/docs/repository/docs/setup", "Development Setup"],
]) {
  test(`documentation has no automated WCAG A/AA violations at ${path}`, async ({
    page,
  }) => {
    await openDocument(page, path, title);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
