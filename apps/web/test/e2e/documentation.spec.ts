import { test, expect } from "@playwright/test";

const webUrl = () => process.env.ORION_E2E_WEB_URL!;

test("public living documentation navigates current API, data, and component references", async ({
  page,
}) => {
  await page.goto(`${webUrl()}/docs`);
  await expect(page).toHaveTitle("Living Documentation · Orion");
  await expect(
    page.getByRole("heading", { name: "Orion living documentation" }),
  ).toBeFocused();
  const navigation = page.getByRole("navigation", {
    name: "Documentation sections",
  });
  await expect(navigation.getByRole("link", { name: "API" })).toBeVisible();
  await navigation.getByRole("link", { name: "API" }).click();
  await expect(page).toHaveURL(/#api$/);
  await expect(
    page.getByRole("heading", { name: "createApprovalRequest" }),
  ).toBeVisible();
  await expect(page.getByText("Bearer access token").first()).toBeVisible();
  await navigation.getByRole("link", { name: "Public errors" }).click();
  await expect(
    page.getByRole("rowheader", { name: "RESOURCE_VERSION_CONFLICT" }),
  ).toBeVisible();
  await navigation.getByRole("link", { name: "Database & dictionary" }).click();
  await expect(
    page.getByRole("heading", { name: "approval_requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "creator_id" }),
  ).toBeVisible();
  await expect(page.getByText("No supporting context supplied.")).toBeVisible();
  await navigation.getByRole("link", { name: "Components" }).click();
  await expect(
    page.getByRole("heading", { name: "AccessTokenForm" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ErrorNotice" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("This request changed");
  await page.getByRole("button", { name: "Reload current request" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Demonstration reload selected",
  );
  async function fetchReference(label: string) {
    const href = await page
      .getByRole("link", { name: label })
      .getAttribute("href");
    expect(href).toBeTruthy();
    return page.request.get(new URL(href!, webUrl()).toString());
  }
  const openapi = await fetchReference("OpenAPI 3.1 JSON");
  expect(openapi.ok()).toBe(true);
  expect(await openapi.text()).toContain('"openapi": "3.1.');
  const database = await fetchReference("AI-readable database reference");
  expect(database.ok()).toBe(true);
  expect(await database.text()).toContain(
    "approval_requests_creator_key_unique",
  );
  const components = await fetchReference("AI-readable component reference");
  expect(components.ok()).toBe(true);
  expect(await components.text()).toContain("## ErrorNotice");
});

test("documentation previews keep synthetic input local and remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${webUrl()}/docs`);
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
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
