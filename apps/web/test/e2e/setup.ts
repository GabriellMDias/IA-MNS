import { startApi, startWeb, stopAll } from "./stack.ts";

// Shared browser journeys need only the emitted API and the web app. Module
// suites that need PostgreSQL or identities start their own stacks.
export default async function setup() {
  const api = await startApi({ environment: "test" });
  let web: Awaited<ReturnType<typeof startWeb>> | undefined;
  try {
    web = await startWeb({ apiUrl: api.url });
  } catch (error) {
    await stopAll([api]);
    throw error;
  }
  process.env.ORION_E2E_WEB_URL = web.url;
  process.env.ORION_E2E_API_URL = api.url;
  return () => stopAll([web, api]);
}
