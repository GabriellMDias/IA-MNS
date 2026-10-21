import { timingSafeEqual } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiModule, ModuleResources } from "../../module.js";
import { coreErrors, errorResponder } from "../../errors.js";
import { currentTraceId } from "../../request-context.js";
import type { FailureLogger } from "../agent/failures.js";
import { WhatsappChannel } from "./channel.js";
import {
  receiveWebhookOperation,
  verifyWebhookOperation,
  whatsappOperations,
} from "./contracts.js";
import { whatsappErrors, type WhatsappErrorCode } from "./errors.js";
import { GraphClient } from "./graph.js";
import type { WhatsappAgent, WhatsappIdentity } from "./ports.js";
import { WhatsappRepository } from "./repository.js";
import { readNotification, validSignature } from "./webhook.js";

const respond = errorResponder({ ...coreErrors, ...whatsappErrors });

/** What composition supplies: identity, the shared agent and the switch. */
export type WhatsappPorts = {
  identity: (resources: ModuleResources) => WhatsappIdentity | undefined;
  agent: (
    resources: ModuleResources,
    log: FailureLogger & { info(object: object, message: string): void },
  ) => WhatsappAgent | undefined;
  enabled: (resources: ModuleResources) => () => Promise<boolean>;
  /** Replaces the Graph API transport (tests and local simulation). */
  fetcher?: typeof fetch;
  /** Worker idle poll; tests shorten it. */
  idleMs?: number;
};

function sameSecret(given: unknown, expected: string): boolean {
  if (typeof given !== "string") return false;
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The WhatsApp Business Cloud API channel: a webhook adapter in front of the
 * existing corporate agent. It owns no business capability; every answer
 * comes from the same agent, permissions and history as the web. Mounted
 * only when the Meta number is configured; otherwise it adds no route.
 */
export function createWhatsappModule(ports: WhatsappPorts): ApiModule {
  return {
    name: "whatsapp",
    tag: "WhatsApp",
    requires: [],
    operations: whatsappOperations,
    errors: whatsappErrors,
    activate(resources) {
      const config = resources.config;
      if (
        !config?.whatsappPhoneNumberId ||
        !config.whatsappAccessToken ||
        !config.whatsappAppSecret ||
        !config.whatsappVerifyToken
      )
        return { name: "whatsapp", register() {} };
      const identity = ports.identity(resources);
      if (!resources.database || !identity)
        throw new Error(
          "Invalid API configuration: the WhatsApp channel requires the database and the IA-MNS identity",
        );
      const repository = new WhatsappRepository(resources.database);
      const graph = new GraphClient({
        baseUrl: config.whatsappGraphBaseUrl,
        version: config.whatsappGraphApiVersion,
        phoneNumberId: config.whatsappPhoneNumberId,
        accessToken: config.whatsappAccessToken,
        ...(ports.fetcher ? { fetcher: ports.fetcher } : {}),
      });
      const appSecret = config.whatsappAppSecret;
      const verifyToken = config.whatsappVerifyToken;
      const account = {
        phoneNumberId: config.whatsappPhoneNumberId,
        ...(config.whatsappBusinessAccountId
          ? { businessAccountId: config.whatsappBusinessAccountId }
          : {}),
      };
      return {
        name: "whatsapp",
        register(app) {
          const log = app.log.child({ module: "whatsapp" });
          const channel = new WhatsappChannel({
            repository,
            graph,
            identity,
            agent: ports.agent(resources, log),
            enabled: ports.enabled(resources),
            dailyLimit: config.whatsappDailyLimit,
            log,
            ...(ports.idleMs ? { idleMs: ports.idleMs } : {}),
          });
          app.addHook("onReady", async () => {
            // Refuse to start against a schema without the channel tables.
            await resources.database!
              .$queryRaw`SELECT m.id, m.message_id, m.person_id, m.link_version, m.state, m.not_before, m.lease_until, m.conversation_id, m.turn_id, o.part, o.provider_message_id, t.source FROM whatsapp_inbound_messages m LEFT JOIN whatsapp_outbound_messages o ON o.inbound_id = m.id LEFT JOIN whatsapp_threads t ON t.person_id = m.person_id LIMIT 0`;
            await resources.database!
              .$queryRaw`SELECT person_id, phone_number, legacy_identifier, platform_user_id, version, confirmed_at FROM identity_whatsapp_links LIMIT 0`;
            channel.start();
          });
          // Stop claiming before other modules (the agent) close.
          app.addHook("preClose", async () => {
            await channel.close();
          });
          void app.register(async (scope) => {
            await scope.register(rateLimit, { global: false });
            // The signature covers the exact bytes Meta sent.
            scope.addContentTypeParser(
              "application/json",
              { parseAs: "buffer", bodyLimit: 2_000_000 },
              (_request, body, done) => done(null, body),
            );
            const fail = (
              request: FastifyRequest,
              reply: FastifyReply,
              code: WhatsappErrorCode,
            ) => {
              const failure = respond(code, request.id, currentTraceId());
              return reply.code(failure.status).send(failure.body);
            };
            scope.get<{ Querystring: Record<string, string | undefined> }>(
              verifyWebhookOperation.url,
              {
                schema: { response: verifyWebhookOperation.schema.response },
                config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
              },
              (request, reply) => {
                reply.header("cache-control", "no-store");
                const challenge = request.query["hub.challenge"];
                if (
                  request.query["hub.mode"] !== "subscribe" ||
                  !sameSecret(request.query["hub.verify_token"], verifyToken) ||
                  typeof challenge !== "string" ||
                  !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)
                ) {
                  log.warn({}, "whatsapp_verification_refused");
                  return fail(request, reply, "WHATSAPP_VERIFICATION_FAILED");
                }
                log.info({}, "whatsapp_verification_accepted");
                return reply.type("text/plain; charset=utf-8").send(challenge);
              },
            );
            scope.post(
              receiveWebhookOperation.url,
              {
                schema: { response: receiveWebhookOperation.schema.response },
                bodyLimit: 2_000_000,
                config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
              },
              async (request, reply) => {
                reply.header("cache-control", "no-store");
                const raw = request.body;
                if (
                  !Buffer.isBuffer(raw) ||
                  !validSignature(
                    raw,
                    request.headers["x-hub-signature-256"],
                    appSecret,
                  )
                ) {
                  log.warn({}, "whatsapp_signature_refused");
                  return fail(request, reply, "WHATSAPP_SIGNATURE_INVALID");
                }
                let payload: unknown;
                try {
                  payload = JSON.parse(raw.toString("utf8"));
                } catch {
                  return fail(request, reply, "WHATSAPP_PAYLOAD_INVALID");
                }
                // Recorded durably before acknowledging; a failure here makes
                // Meta deliver the notification again.
                await channel.receive(readNotification(payload, account));
                return { received: true as const };
              },
            );
          });
        },
      };
    },
  };
}
