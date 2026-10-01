# API Error Registry

<!-- Generated from apps/api/src/errors.ts and composed module errors. Run pnpm -C apps/api references:write; do not edit. -->

[Error contract](../../api/error-contract.md) · [API runtime](../../../apps/api/README.md)

| Code | HTTP status | Category | Retryable | Public message |
| --- | --- | --- | --- | --- |
| `AUTHENTICATION_REQUIRED` | 401 | authentication | no | Authentication is required. |
| `VALIDATION_FAILED` | 400 | validation | no | The request is invalid. |
| `RESOURCE_NOT_FOUND` | 404 | not_found | no | The resource was not found. |
| `RATE_LIMITED` | 429 | rate_limit | yes | Too many requests. Try again later. |
| `INTERNAL_ERROR` | 500 | internal | no | An unexpected error occurred. |
| `SERVICE_UNAVAILABLE` | 503 | availability | yes | The service is unavailable. |
| `PERMISSION_DENIED` | 403 | authorization | no | Permission denied. |
| `APPROVAL_REQUEST_INVALID_STATE` | 409 | conflict | no | The request cannot be changed in its current state. |
| `RESOURCE_VERSION_CONFLICT` | 409 | conflict | no | The request changed; reload it before trying again. |
| `IDEMPOTENCY_KEY_REUSED` | 409 | conflict | no | The creation key was used for different content. |
