import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../src/config.js";
import { createLogger } from "../src/logging.js";
import { errorDiagnostics } from "../src/error-diagnostics.js";

describe("Pino redaction", () => {
  it("keeps public Oracle and OpenAI failure codes without secret-bearing messages", () => {
    const oracle = new Error("DPI-1050: private-client-path secret-password");
    const openai = Object.assign(new Error("secret-prompt secret-key"), {
      code: "insufficient_quota",
      name: "RateLimitError",
    });
    const unknown = Object.assign(new Error("private-value"), {
      code: "untrusted-secret-code",
    });
    expect(errorDiagnostics(oracle).causes[0].code).toBe("DPI-1050");
    expect(errorDiagnostics(openai).causes[0]).toMatchObject({
      type: "RateLimitError",
      code: "insufficient_quota",
    });
    expect(errorDiagnostics(unknown).causes[0].code).toBeUndefined();
    const output = JSON.stringify([
      errorDiagnostics(oracle),
      errorDiagnostics(openai),
      errorDiagnostics(unknown),
    ]);
    for (const secret of [
      "private-client-path",
      "secret-password",
      "secret-prompt",
      "secret-key",
      "private-value",
      "untrusted-secret-code",
    ])
      expect(output).not.toContain(secret);
  });
  it("removes credential fields and request headers at the central logger", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const logger = createLogger(
      parseServerConfig({ ORION_ENV: "test" }),
      destination,
    );
    logger.info(
      {
        auth: { token: "secret-token" },
        req: { headers: { authorization: "Bearer secret" } },
        requestId: "req_safe",
      },
      "safe_event",
    );
    const output = lines.join("");
    expect(output).toContain("req_safe");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("Bearer secret");
    expect(output).toContain("[REDACTED]");
  });
});
