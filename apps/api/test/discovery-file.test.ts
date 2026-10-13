import { afterEach, describe, expect, it, vi } from "vitest";
const reader = vi.hoisted(() =>
  vi.fn<(path: URL, encoding: string) => Promise<string>>(),
);
vi.mock("node:fs/promises", () => ({ readFile: reader }));
import { loadDiscoveryConfig } from "../scripts/discovery-config.js";

const env = {
  ORION_ENV: "test",
  SANKHYA_DB_USER: "IA_MNS_RO",
  SANKHYA_DB_PASSWORD: "synthetic-reader",
  SANKHYA_DB_CONNECT_STRING: "example.test/service",
};
const missing = () =>
  Object.assign(new Error("synthetic missing file"), { code: "ENOENT" });
afterEach(() => reader.mockReset());
describe("explicit Discovery file selection", () => {
  it("supports the owner-provided .env.discovery when .local is absent", async () => {
    reader
      .mockRejectedValueOnce(missing())
      .mockResolvedValueOnce(
        "SANKHYA_DB_USER_FULLACESS=synthetic_admin\nSANKHYA_DB_PASSWORD_FULLACESS=synthetic-secret\n",
      );
    const config = await loadDiscoveryConfig("sankhya", env);
    expect(config.sankhyaUser).toBe("synthetic_admin");
    expect(
      reader.mock.calls.map(([path]) => path.pathname.split("/").at(-1)),
    ).toEqual([".env.discovery.local", ".env.discovery"]);
  });
  it("prefers .local without merging administrative files", async () => {
    reader.mockResolvedValueOnce(
      "SANKHYA_DB_USER_FULLACESS=synthetic_local_admin\nSANKHYA_DB_PASSWORD_FULLACESS=synthetic-local-secret\n",
    );
    expect((await loadDiscoveryConfig("sankhya", env)).sankhyaUser).toBe(
      "synthetic_local_admin",
    );
    expect(reader).toHaveBeenCalledOnce();
  });
  it("missing files never cause runtime-credential fallback", async () => {
    reader.mockRejectedValue(missing());
    await expect(loadDiscoveryConfig("sankhya", env)).rejects.toThrow(
      "runtime credentials are never a fallback",
    );
    expect(reader).toHaveBeenCalledTimes(2);
  });
});
