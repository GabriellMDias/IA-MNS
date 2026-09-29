import { context, trace } from "@opentelemetry/api";

export function currentTraceId(): string | undefined {
  return currentTraceContext().trace_id;
}

export function currentTraceContext(): {
  trace_id?: string;
  span_id?: string;
} {
  const active = trace.getSpan(context.active())?.spanContext();
  return active && trace.isSpanContextValid(active)
    ? { trace_id: active.traceId, span_id: active.spanId }
    : {};
}
