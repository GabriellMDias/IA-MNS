import type { ErrorDefinition } from "../../errors.js";

export const whatsappErrors = {
  WHATSAPP_SIGNATURE_INVALID: {
    status: 401,
    category: "authentication",
    retryable: false,
    message: "The webhook signature is missing or invalid.",
  },
  WHATSAPP_VERIFICATION_FAILED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "The webhook verification request was refused.",
  },
  WHATSAPP_PAYLOAD_INVALID: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "The webhook payload is not valid JSON.",
  },
} as const satisfies Record<string, ErrorDefinition>;

export type WhatsappErrorCode = keyof typeof whatsappErrors;
