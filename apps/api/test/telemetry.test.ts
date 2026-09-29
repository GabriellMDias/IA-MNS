import { describe, expect, it } from "vitest";
import { sanitizeSpan } from "../src/telemetry.js";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

describe("telemetry export boundary", () => {
  it("removes URLs, headers, exception details and events before trace export", () => {
    const span = {
      name: "GET /path?secret=do-not-export",
      attributes: {
        "url.full": "https://example.test/?secret=do-not-export",
        "http.request.method": "GET",
        "http.response.status_code": 200,
        authorization: "Bearer secret",
      },
      events: [
        { name: "exception", attributes: { "exception.message": "secret" } },
      ],
      links: [{ attributes: { token: "secret" } }],
      status: { code: 2, message: "do-not-export" },
      spanContext: () => ({ traceId: "11111111111111111111111111111111" }),
    } as unknown as ReadableSpan;
    const safe = sanitizeSpan(span);
    expect(safe.name).toBe("http.request");
    expect(safe.attributes).toEqual({
      "http.request.method": "GET",
      "http.response.status_code": 200,
    });
    expect(safe.events).toEqual([]);
    expect(safe.links).toEqual([]);
    expect(safe.status).toEqual({ code: 2 });
    expect(safe.spanContext().traceId).toBe("11111111111111111111111111111111");
    expect(JSON.stringify(safe)).not.toContain("do-not-export");
  });

  it("retains only a safe database span identity and status code", () => {
    const span = {
      name: "prisma:query SELECT secret FROM approval_requests",
      instrumentationScope: { name: "prisma" },
      status: { code: 2, message: "database secret" },
      attributes: {
        "db.statement": "SELECT secret",
        "db.query.parameter.0": "secret",
      },
      events: [
        { name: "exception", attributes: { "exception.message": "secret" } },
      ],
      links: [],
      spanContext: () => ({ traceId: "11111111111111111111111111111111" }),
    } as unknown as ReadableSpan;
    const safe = sanitizeSpan(span);
    expect(safe.name).toBe("db.operation");
    expect(safe.status).toEqual({ code: 2 });
    expect(safe.attributes).toEqual({});
    expect(safe.events).toEqual([]);
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
});
