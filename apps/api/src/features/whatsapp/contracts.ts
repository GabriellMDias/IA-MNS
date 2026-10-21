import { Type } from "typebox";
import type { ApiOperation } from "../../module.js";
import { errorEnvelopeSchema } from "../../errors.js";

const object = { additionalProperties: false };

export const verifyWebhookOperation: ApiOperation = {
  method: "GET",
  url: "/whatsapp/webhook",
  operationId: "verifyWhatsappWebhook",
  description:
    "Meta webhook subscription check: answers the challenge in plain text only when the mode is subscribe and the verify token matches WHATSAPP_VERIFY_TOKEN. Mounted only when the WhatsApp channel is configured.",
  schema: {
    querystring: Type.Object(
      {
        "hub.mode": Type.String({ maxLength: 20 }),
        "hub.verify_token": Type.String({ maxLength: 200 }),
        "hub.challenge": Type.String({ maxLength: 200 }),
      },
      object,
    ),
    responseContentType: "text/plain",
    response: {
      200: Type.String({ description: "The hub.challenge value, unchanged." }),
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      429: errorEnvelopeSchema,
    },
  },
  expectedErrors: ["WHATSAPP_VERIFICATION_FAILED"],
};

/**
 * Documented shape of a notification. The route verifies the signature over
 * the exact bytes before parsing, then reads the payload defensively; fields
 * it does not use are ignored and never stored.
 */
const notificationSchema = Type.Object(
  {
    object: Type.String(),
    entry: Type.Array(
      Type.Object({
        id: Type.String(),
        changes: Type.Array(
          Type.Object({ field: Type.String(), value: Type.Object({}) }),
        ),
      }),
    ),
  },
  {
    description:
      "WhatsApp Business Account notification (messages and statuses) signed with X-Hub-Signature-256.",
  },
);

export const receiveWebhookOperation: ApiOperation = {
  method: "POST",
  url: "/whatsapp/webhook",
  operationId: "receiveWhatsappWebhook",
  description:
    "Meta webhook notifications for the IA-MNS number. Requires a valid X-Hub-Signature-256 over the exact body. Messages of senders linked by an owner to an active Person are recorded once and processed asynchronously; any other sender is ignored silently. Delivery statuses update sent replies. Mounted only when the WhatsApp channel is configured.",
  schema: {
    headers: Type.Object({
      "x-hub-signature-256": Type.String({
        pattern: "^sha256=[0-9a-fA-F]{64}$",
      }),
    }),
    body: notificationSchema,
    response: {
      200: Type.Object({ received: Type.Literal(true) }, object),
      400: errorEnvelopeSchema,
      401: errorEnvelopeSchema,
      429: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  expectedErrors: ["WHATSAPP_SIGNATURE_INVALID", "WHATSAPP_PAYLOAD_INVALID"],
};

export const whatsappOperations: readonly ApiOperation[] = [
  verifyWebhookOperation,
  receiveWebhookOperation,
];
