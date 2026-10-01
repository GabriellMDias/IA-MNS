import { coreErrors, defineErrors, errorResponder } from "../../errors.js";

// Business conditions owned by the Approval Request reference module.
export const approvalErrors = defineErrors({
  PERMISSION_DENIED: {
    status: 403,
    message: "Permission denied.",
    category: "authorization",
    retryable: false,
  },
  APPROVAL_REQUEST_INVALID_STATE: {
    status: 409,
    message: "The request cannot be changed in its current state.",
    category: "conflict",
    retryable: false,
  },
  RESOURCE_VERSION_CONFLICT: {
    status: 409,
    message: "The request changed; reload it before trying again.",
    category: "conflict",
    retryable: false,
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    message: "The creation key was used for different content.",
    category: "conflict",
    retryable: false,
  },
});

export const respond = errorResponder({ ...coreErrors, ...approvalErrors });
