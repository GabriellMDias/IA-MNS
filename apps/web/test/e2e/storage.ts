import { expect, type Page } from "@playwright/test";

/**
 * TanStack Router's lazy routes recover from a transient failure to load a
 * route chunk by reloading the page once, recording the attempt in
 * sessionStorage under `tanstack_router_reload:<error message>` with the value
 * `"1"`. The marker names the failed module URL and holds no user input or
 * credential. Under load, such as a cold development server in CI, it can
 * appear in any journey, so storage checks accept exactly this marker.
 *
 * Only the portal is a lazy route, so the accepted keys are the browsers'
 * exact dynamic-import failure messages for the portal chunk on the page's
 * own origin: its development module or its hashed production asset. Nothing
 * else may follow, so a key cannot carry arbitrary data.
 */
const markerPrefix = "tanstack_router_reload:";
const portalChunkPath =
  /^\/(src\/documentation\.tsx(\?t=\d+)?|assets\/documentation-[A-Za-z0-9_-]+\.js)$/;

export function isRouterReloadMarker(key: string, origin: string): boolean {
  if (!key.startsWith(markerPrefix)) return false;
  const message = key.slice(markerPrefix.length);
  // Safari's message names no module.
  if (message === "Importing a module script failed.") return true;
  for (const lead of [
    "Failed to fetch dynamically imported module: ",
    "error loading dynamically imported module: ",
  ]) {
    if (!message.startsWith(lead)) continue;
    const url = message.slice(lead.length);
    return (
      url.startsWith(`${origin}/`) &&
      portalChunkPath.test(url.slice(origin.length))
    );
  }
  return false;
}

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
  const origin = new URL(page.url()).origin;
  expect(storage.local, "localStorage must stay empty").toEqual([]);
  expect(
    storage.session.filter(
      ([key, value]) => !(isRouterReloadMarker(key, origin) && value === "1"),
    ),
    "sessionStorage may hold only router reload markers",
  ).toEqual([]);
  expect(JSON.stringify(storage)).not.toMatch(credentialPattern);
  await expect(page).not.toHaveURL(/eyJ[A-Za-z0-9_-]+/);
}
