import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startApi, webBuild } from "./stack.ts";

let served: Awaited<ReturnType<typeof startApi>> | undefined;
test.beforeAll(async () => {
  if (test.info().project.name === "served")
    served = await startApi({ env: { ORION_WEB_ROOT: webBuild } });
});
test.afterAll(async () => {
  await served?.stop();
});

test("feature catalog exposes each ERP's filters and complete SQL without API access", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto(`${served?.url ?? process.env.ORION_E2E_WEB_URL!}/docs`);
  await page
    .locator(".docs-hub")
    .getByRole("link", { name: /Funcionalidades por origem/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Feature Catalog by Origin",
  );
  const catalogUrl = page.url();
  for (const [source, token, metric, group] of [
    ["vrmaster", "public.venda", "quantity", "month_product"],
    ["sankhya", "TGFCAB CAB", "weight", "month"],
  ]) {
    await page
      .locator(`.docs-markdown a[href$="/${source}/sales"]`)
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Request options", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Effective access restrictions",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator(`.docs-markdown a[href$="/sales-${metric}-${group}"]`)
      .click();
    await expect(page.locator("pre code.language-sql")).toContainText(token);
    await expect(page.locator("pre code.language-sql")).toContainText(
      source === "sankhya" ? ":startDate" : "$1::date",
    );
    await page.getByRole("button", { name: "Copiar SQL", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("SQL copiado.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Windows clipboard APIs convert LF to CRLF; compare content across both transports.
    const normalizedCopy = copied.replaceAll("\r\n", "\n");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar SQL", exact: true }).click();
    const download = await downloaded;
    expect(
      readFileSync(await download.path(), "utf8").replaceAll("\r\n", "\n"),
    ).toBe(normalizedCopy);
    expect(normalizedCopy.trim()).toBe(
      `${(await page.locator("pre code.language-sql").textContent())!.trim()};`,
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Copiar SQL", exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (source === "sankhya")
      await page.screenshot({ path: test.info().outputPath("sales-sql.png") });
    await page.goto(catalogUrl);
  }
  await page.locator('.docs-markdown a[href$="/vrmaster/products"]').click();
  await expect(
    page.getByRole("heading", { name: "All catalog filters", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "pending_validation", exact: true }).first(),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(catalogUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Feature Catalog by Origin",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("feature-catalog-mobile.png"),
  });
});
