import { Type } from "typebox";

export const healthSchema = Type.Object({
  status: Type.Union([Type.Literal("ok"), Type.Literal("unavailable")]),
});
export const healthOperations = [
  {
    method: "GET",
    url: "/health/startup",
    operationId: "getStartupHealth",
    description:
      "Report whether the process has completed startup initialization.",
    schema: { response: { 200: healthSchema, 503: healthSchema } },
  },
  {
    method: "GET",
    url: "/health/live",
    operationId: "getLiveness",
    description:
      "Report whether the process is alive without testing downstream dependencies.",
    schema: { response: { 200: healthSchema, 503: healthSchema } },
  },
  {
    method: "GET",
    url: "/health/ready",
    operationId: "getReadiness",
    description:
      "Report whether the process can serve requests, including the database when one is configured.",
    schema: { response: { 200: healthSchema, 503: healthSchema } },
  },
] as const;
