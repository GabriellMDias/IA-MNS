import createClient from "openapi-fetch";
import type { paths } from "./generated/api-types.js";

export type { paths } from "./generated/api-types.js";

/** Credentials are supplied by the host application and never retained by the SDK. */
export function createApiClient(
  baseUrl: string,
  getAccessToken: () => string | null,
) {
  const client = createClient<paths>({ baseUrl });
  client.use({
    onRequest({ request }) {
      const token = getAccessToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  });
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
