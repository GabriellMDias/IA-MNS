import { Type } from "typebox";
import { Value } from "typebox/value";

const schema = Type.Object({
  apiBaseUrl: Type.String({ pattern: "^/[^?#]*$" }),
});

export function loadClientConfig(
  raw: string | undefined = import.meta.env.VITE_ORION_API_BASE_URL,
) {
  const value = { apiBaseUrl: raw ?? "/api" };
  if (
    !Value.Check(schema, value) ||
    value.apiBaseUrl.startsWith("//") ||
    /[\\%\s]/.test(value.apiBaseUrl) ||
    value.apiBaseUrl
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  )
    throw new Error("Invalid client API base URL.");
  return Object.freeze(value);
}
