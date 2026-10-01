import { expect, type Page } from "@playwright/test";

/**
 * TanStack Router's lazy routes recover from a transient failure to load a
 * route chunk by reloading the page once, recording the attempt in
 * sessionStorage under `tanstack_router_reload:<error message>` with the value
 * `"1"`. The marker names the failed module URL and holds no user input or
 * credential. Under load, such as a cold development server in CI, it can
 * appear in any journey, so storage checks accept exactly this marker.
 */
export const routerReloadMarker =
  /^tanstack_router_reload:(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)\b/;

const credentialPattern = /eyJ[A-Za-z0-9_-]+|bearer\s/i;

/**
 * Browser storage must hold no credential, token, or user input: local
 * storage stays empty and session storage may contain only router reload
 * markers. The URL must not carry a token either.
 */
export async function expectNoStoredUserData(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(storage.local, "localStorage must stay empty").toEqual([]);
  expect(
    storage.session.filter(
      ([key, value]) => !(routerReloadMarker.test(key) && value === "1"),
    ),
    "sessionStorage may hold only router reload markers",
  ).toEqual([]);
  expect(JSON.stringify(storage)).not.toMatch(credentialPattern);
  await expect(page).not.toHaveURL(/eyJ[A-Za-z0-9_-]+/);
}
