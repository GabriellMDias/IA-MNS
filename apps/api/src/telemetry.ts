import {
  ExportResultCode,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  PeriodicExportingMetricReader,
  createAllowListAttributesProcessor,
} from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  TraceIdRatioBasedSampler,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import type { Logger } from "pino";
import type { ServerConfig } from "./config.js";

const allowedSpanAttributes = new Set([
  "http.request.method",
  "http.response.status_code",
  "http.route",
  "network.protocol.name",
  "network.protocol.version",
]);

// Redaction happens before export. Do not allow arbitrary URL, query, header,
// body, exception, or event attributes into a collector.
export function sanitizeSpan(span: ReadableSpan): ReadableSpan {
  // Keep the ReadableSpan methods on its prototype; OTLP serialization calls
  // spanContext() and duration(), which object spread would discard.
  return Object.assign(Object.create(span) as ReadableSpan, {
    name:
      span.instrumentationScope?.name === "prisma"
        ? "db.operation"
        : "http.request",
    status: { code: span.status.code },
    attributes: Object.fromEntries(
      Object.entries(span.attributes).filter(([key]) =>
        allowedSpanAttributes.has(key),
      ),
    ),
    events: [],
    links: [],
  });
}

class RedactingSpanExporter implements SpanExporter {
  private readonly delegate: SpanExporter;
  private readonly logger: Logger;
  constructor(delegate: SpanExporter, logger: Logger) {
    this.delegate = delegate;
    this.logger = logger;
  }
  export(
    spans: ReadableSpan[],
    resultCallback: Parameters<SpanExporter["export"]>[1],
  ): void {
    this.logger.debug({ spanCount: spans.length }, "telemetry_export_attempt");
    try {
      this.delegate.export(spans.map(sanitizeSpan), (result) => {
        if (result.code !== ExportResultCode.SUCCESS)
          this.logger.warn("telemetry_export_failed");
        resultCallback(result);
      });
    } catch {
      this.logger.warn("telemetry_export_failed");
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }
  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

class DiscardSpanExporter implements SpanExporter {
  export(
    _spans: ReadableSpan[],
    callback: Parameters<SpanExporter["export"]>[1],
  ): void {
    callback({ code: ExportResultCode.SUCCESS });
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

export interface Telemetry {
  shutdown(): Promise<void>;
}

export function initializeTelemetry(
  config: ServerConfig,
  logger: Logger,
): Telemetry {
  const endpoint = config.otlpEndpoint?.replace(/\/$/, "");
  const sdk = new NodeSDK({
    serviceName: "orion-api",
    autoDetectResources: false,
    resource: resourceFromAttributes({
      "service.name": "orion-api",
      "deployment.environment.name": config.environment,
      "service.version": config.releaseId,
    }),
    textMapPropagator: new W3CTraceContextPropagator(),
    sampler: new TraceIdRatioBasedSampler(config.traceSampleRatio),
    spanProcessors: [
      new BatchSpanProcessor(
        new RedactingSpanExporter(
          endpoint
            ? new OTLPTraceExporter({
                url: `${endpoint}/v1/traces`,
                timeoutMillis: 2000,
              })
            : new DiscardSpanExporter(),
          logger,
        ),
        { scheduledDelayMillis: 1000, exportTimeoutMillis: 2000 },
      ),
    ],
    ...(endpoint
      ? {
          metricReaders: [
            new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter({
                url: `${endpoint}/v1/metrics`,
                timeoutMillis: 2000,
              }),
              exportIntervalMillis: 60000,
              exportTimeoutMillis: 2000,
            }),
          ],
        }
      : {}),
    views: [
      {
        instrumentName: "*",
        attributesProcessors: [
          createAllowListAttributesProcessor([
            "http.request.method",
            "http.response.status_code",
            "http.route",
            "network.protocol.name",
            "network.protocol.version",
          ]),
        ],
      },
    ],
    instrumentations: [
      new HttpInstrumentation({
        headersToSpanAttributes: {
          client: { requestHeaders: [], responseHeaders: [] },
          server: { requestHeaders: [], responseHeaders: [] },
        },
      }),
      new FastifyOtelInstrumentation({ registerOnInitialization: true }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
  logger.info(
    { telemetryExport: endpoint ? "otlp" : "disabled" },
    "telemetry_started",
  );
  return { shutdown: () => sdk.shutdown() };
}
