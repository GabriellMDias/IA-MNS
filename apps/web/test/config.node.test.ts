import { describe, expect, it } from "vitest";
import { loadClientConfig } from "../src/config.js";

describe("browser API configuration boundary", () => {
  it("accepts only explicit same-origin base paths", () => {
    for (const path of ["/api", "/", "/services/orion-v1/"])
      expect(loadClientConfig(path).apiBaseUrl).toBe(path);
  });

  it.each([
    "https://external.invalid/api",
    "//external.invalid/api",
    "/\\external.invalid/api",
    "/api\\..\\outside",
    "/api/../outside",
    "/api/./route",
    "/api/%2e%2e/outside",
    "/api/%2foutside",
    "/api?target=outside",
    "/api#fragment",
    "/ api",
    "/api\n",
    "",
  ])("rejects unsafe base %j without reflecting its value", (path) => {
    expect(() => loadClientConfig(path)).toThrow(
      "Invalid client API base URL.",
    );
  });
});
