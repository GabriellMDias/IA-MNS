import type { ErrorDefinition } from "../../errors.js";

export const identityErrors = {
  IDENTITY_NOT_CONFIGURED: {
    status: 503,
    category: "availability",
    retryable: false,
    message: "Identity is not configured.",
  },
  IDENTITY_METHOD_UNAVAILABLE: {
    status: 503,
    category: "availability",
    retryable: false,
    message: "This sign-in method is not available.",
  },
  IDENTITY_INVALID_CREDENTIALS: {
    status: 401,
    category: "authentication",
    retryable: false,
    message: "The sign-in details are invalid.",
  },
  IDENTITY_INVALID_CODE: {
    status: 401,
    category: "authentication",
    retryable: false,
    message: "The verification code is invalid.",
  },
  IDENTITY_FLOW_EXPIRED: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "This sign-in step expired or was already used. Start again.",
  },
  IDENTITY_PROOF_REJECTED: {
    status: 401,
    category: "authentication",
    retryable: false,
    message: "The external identity could not be verified.",
  },
  IDENTITY_PROVIDER_UNAVAILABLE: {
    status: 503,
    category: "availability",
    retryable: true,
    message: "The external identity provider is unavailable.",
  },
  IDENTITY_ACCOUNT_DISABLED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "This account is disabled.",
  },
  IDENTITY_SESSION_EXPIRED: {
    status: 401,
    category: "authentication",
    retryable: false,
    message: "The session ended. Sign in again.",
  },
  IDENTITY_RECENT_AUTHENTICATION_REQUIRED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "Confirm your identity again to continue.",
  },
  IDENTITY_STRONG_AUTHENTICATION_REQUIRED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "This operation requires a second factor.",
  },
  IDENTITY_ACCESS_DENIED: {
    status: 403,
    category: "authorization",
    retryable: false,
    message: "This operation is not permitted.",
  },
  IDENTITY_PERSON_NOT_FOUND: {
    status: 404,
    category: "not_found",
    retryable: false,
    message: "The person was not found.",
  },
  IDENTITY_LINK_NOT_FOUND: {
    status: 404,
    category: "not_found",
    retryable: false,
    message: "The linked account was not found.",
  },
  IDENTITY_LINK_CONFLICT: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "This external account is already linked to another person.",
  },
  IDENTITY_PROVIDER_ALREADY_LINKED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "A different account of this provider is already linked.",
  },
  IDENTITY_LAST_METHOD: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "At least one sign-in method must remain.",
  },
  IDENTITY_LAST_OWNER: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "At least one active owner must remain.",
  },
  IDENTITY_LOGIN_TAKEN: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "This login is not available.",
  },
  IDENTITY_ALREADY_ENROLLED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "A local credential already exists.",
  },
  IDENTITY_INVALID_LOGIN: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "Use 3 to 64 lowercase letters, digits, dot, dash or underscore.",
  },
  IDENTITY_INVALID_NAME: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "Use a display name with 1 to 120 characters.",
  },
  IDENTITY_SESSION_NOT_FOUND: {
    status: 404,
    category: "not_found",
    retryable: false,
    message: "The session was not found.",
  },
  IDENTITY_WEAK_PASSWORD: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "Use at least 12 characters that do not contain the login.",
  },
  IDENTITY_UNKNOWN_PERMISSION: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "The permission is not registered.",
  },
  IDENTITY_POLICY_INVALID: {
    status: 400,
    category: "validation",
    retryable: false,
    message: "The authentication policy is outside the allowed limits.",
  },
  IDENTITY_POLICY_NOT_ALLOWED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "Production always requires a second factor for administrators.",
  },
  IDENTITY_POLICY_CONFIRMATION_REQUIRED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "Confirm that this policy significantly reduces security.",
  },
  IDENTITY_TOTP_REQUIRED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "Set up a second factor first.",
  },
  IDENTITY_DIRECTORY_UNAVAILABLE: {
    status: 503,
    category: "availability",
    retryable: false,
    message: "The Sankhya user directory is not configured.",
  },
  IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND: {
    status: 404,
    category: "not_found",
    retryable: false,
    message: "The external account was not found.",
  },
  IDENTITY_EXTERNAL_ACCOUNT_INACTIVE: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "The external account can no longer sign in.",
  },
  IDENTITY_MERGE_NOT_ALLOWED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "These profiles cannot be combined automatically.",
  },
  IDENTITY_MERGE_BUSY: {
    status: 409,
    category: "conflict",
    retryable: true,
    message: "A conversation is still running. Try again shortly.",
  },
  IDENTITY_LOCAL_CREDENTIAL_REQUIRED: {
    status: 409,
    category: "conflict",
    retryable: false,
    message: "Create a local password first.",
  },
} as const satisfies Record<string, ErrorDefinition>;

export type IdentityErrorCode = keyof typeof identityErrors;

export class IdentityFailure extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = "IdentityFailure";
    this.code = code;
  }
}
