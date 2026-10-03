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
| `SALES_ACCESS_DENIED` | 403 | authorization | no | Sales access is not permitted. |
| `SALES_NOT_CONFIGURED` | 503 | configuration | no | Sales providers are not configured. |
| `SALES_PROVIDER_UNAVAILABLE` | 503 | availability | yes | The sales provider is unavailable. Try again later. |
| `SALES_QUERY_INVALID` | 400 | validation | no | The sales query is outside the supported limits. |
| `SALES_RESULT_TOO_LARGE` | 400 | validation | no | Narrow the product search or period. |
| `SALES_CONVERSATION_EXPIRED` | 410 | not_found | no | The conversation is no longer available. Start a new conversation. |
| `SALES_CONVERSATION_BUSY` | 409 | conflict | yes | A question is already being processed in this conversation. |
| `AGENT_CONVERSATION_ARCHIVED` | 409 | conflict | no | Restore the archived conversation before submitting a new turn. |
| `AGENT_NOT_CONFIGURED` | 503 | availability | no | The agent is not configured. |
| `AGENT_CONVERSATION_NOT_FOUND` | 404 | not_found | no | The conversation was not found. |
| `AGENT_CONVERSATION_BUSY` | 409 | conflict | yes | The conversation has an active turn. |
| `AGENT_REQUEST_CONFLICT` | 409 | conflict | no | This request identifier has different content. |
| `AGENT_ACCESS_DENIED` | 403 | authorization | no | This capability is not permitted. |
| `AGENT_PROVIDER_UNAVAILABLE` | 503 | availability | yes | The agent provider is unavailable. |
