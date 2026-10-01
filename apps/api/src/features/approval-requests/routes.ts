import type { FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import type {
  AccessTokenVerifier,
  VerifiedPrincipal,
} from "../../authentication.js";
import type { AppInstance } from "../../module.js";
import { currentTraceId } from "../../request-context.js";
import {
  BusinessFailure,
  type ApprovalRequest,
  type Principal,
} from "./domain.js";
import { ApprovalRequestService } from "./service.js";
import { approvalOperations } from "./contracts.js";
import { respond } from "./errors.js";

/** Maps issuer scopes to this module's capabilities. */
export function principalFrom(verified: VerifiedPrincipal): Principal {
  const capabilities = new Set<"approval:review">();
  if (verified.scopes.has("approval:review"))
    capabilities.add("approval:review");
  return { id: verified.id, capabilities };
}

function wire(item: ApprovalRequest) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function registerApprovalRoutes(
  app: AppInstance,
  service: ApprovalRequestService,
  verifier: AccessTokenVerifier,
  limit: { max: number; timeWindow: number } = {
    max: 120,
    timeWindow: 60_000,
  },
): void {
  const principals = new WeakMap<FastifyRequest, Principal>();
  void app.register(async (feature) => {
    await feature.register(rateLimit, {
      max: limit.max,
      timeWindow: limit.timeWindow,
      hook: "onRequest",
      addHeadersOnExceeding: {
        "x-ratelimit-limit": false,
        "x-ratelimit-remaining": false,
        "x-ratelimit-reset": false,
      },
      addHeaders: {
        "x-ratelimit-limit": false,
        "x-ratelimit-remaining": false,
        "x-ratelimit-reset": false,
        "retry-after": true,
      },
    });
    feature.addHook("preValidation", async (request, reply) => {
      const verified = await verifier.verify(request.headers.authorization);
      if (!verified) {
        const failure = respond(
          "AUTHENTICATION_REQUIRED",
          request.id,
          currentTraceId(),
        );
        reply.code(failure.status).send(failure.body);
        return;
      }
      principals.set(request, principalFrom(verified));
    });
    for (const operation of approvalOperations) {
      feature.route({
        method: operation.method,
        url: operation.url,
        schema: operation.schema,
        handler: async (request, reply) => {
          const principal = principals.get(request);
          if (!principal) {
            const failure = respond(
              "AUTHENTICATION_REQUIRED",
              request.id,
              currentTraceId(),
            );
            return reply.code(failure.status).send(failure.body);
          }
          try {
            const params = request.params as { id: string } | undefined;
            const body = request.body as Record<string, unknown> | undefined;
            const query = request.query as
              | {
                  scope?: "mine" | "reviewable";
                  limit?: number;
                  cursor?: string;
                }
              | undefined;
            const id = params?.id ?? "";
            switch (operation.operationId) {
              case "createApprovalRequest": {
                const item = await service.create(
                  principal,
                  {
                    title: body!.title as string,
                    description:
                      (body!.description as string | null | undefined) ?? null,
                  },
                  request.headers["idempotency-key"] as string,
                );
                return reply.code(201).send(wire(item));
              }
              case "listApprovalRequests": {
                const page = await service.list(
                  principal,
                  query?.scope ?? "mine",
                  query?.limit ?? 20,
                  query?.cursor,
                );
                return reply.send({
                  items: page.items.map(wire),
                  nextCursor: page.nextCursor,
                });
              }
              case "getApprovalRequest":
                return reply.send(wire(await service.get(principal, id)));
              case "editApprovalRequestDraft":
                return reply.send(
                  wire(
                    await service.mutate(principal, id, "edit", {
                      expectedVersion: body!.expectedVersion as number,
                      title: body!.title as string,
                      description:
                        (body!.description as string | null | undefined) ??
                        null,
                    }),
                  ),
                );
              case "submitApprovalRequest":
                return reply.send(
                  wire(
                    await service.mutate(principal, id, "submit", {
                      expectedVersion: body!.expectedVersion as number,
                    }),
                  ),
                );
              case "approveApprovalRequest":
                return reply.send(
                  wire(
                    await service.mutate(principal, id, "approve", {
                      expectedVersion: body!.expectedVersion as number,
                    }),
                  ),
                );
              case "rejectApprovalRequest":
                return reply.send(
                  wire(
                    await service.mutate(principal, id, "reject", {
                      expectedVersion: body!.expectedVersion as number,
                      rejectionReason: body!.reason as string,
                    }),
                  ),
                );
              case "cancelApprovalRequest":
                return reply.send(
                  wire(
                    await service.mutate(principal, id, "cancel", {
                      expectedVersion: body!.expectedVersion as number,
                    }),
                  ),
                );
            }
          } catch (error) {
            if (error instanceof BusinessFailure) {
              const failure = respond(error.code, request.id, currentTraceId());
              return reply.code(failure.status).send(failure.body);
            }
            throw error;
          }
        },
      });
    }
  });
}
