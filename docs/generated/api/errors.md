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
| `IDENTITY_NOT_CONFIGURED` | 503 | availability | no | Identity is not configured. |
| `IDENTITY_METHOD_UNAVAILABLE` | 503 | availability | no | This sign-in method is not available. |
| `IDENTITY_INVALID_CREDENTIALS` | 401 | authentication | no | The sign-in details are invalid. |
| `IDENTITY_INVALID_CODE` | 401 | authentication | no | The verification code is invalid. |
| `IDENTITY_FLOW_EXPIRED` | 400 | validation | no | This sign-in step expired or was already used. Start again. |
| `IDENTITY_PROOF_REJECTED` | 401 | authentication | no | The external identity could not be verified. |
| `IDENTITY_PROVIDER_UNAVAILABLE` | 503 | availability | yes | The external identity provider is unavailable. |
| `IDENTITY_ACCOUNT_DISABLED` | 403 | authorization | no | This account is disabled. |
| `IDENTITY_SESSION_EXPIRED` | 401 | authentication | no | The session ended. Sign in again. |
| `IDENTITY_RECENT_AUTHENTICATION_REQUIRED` | 403 | authorization | no | Confirm your identity again to continue. |
| `IDENTITY_STRONG_AUTHENTICATION_REQUIRED` | 403 | authorization | no | This operation requires a second factor. |
| `IDENTITY_ACCESS_DENIED` | 403 | authorization | no | This operation is not permitted. |
| `IDENTITY_PERSON_NOT_FOUND` | 404 | not_found | no | The person was not found. |
| `IDENTITY_LINK_NOT_FOUND` | 404 | not_found | no | The linked account was not found. |
| `IDENTITY_LINK_CONFLICT` | 409 | conflict | no | This external account is already linked to another person. |
| `IDENTITY_PROVIDER_ALREADY_LINKED` | 409 | conflict | no | A different account of this provider is already linked. |
| `IDENTITY_LAST_METHOD` | 409 | conflict | no | At least one sign-in method must remain. |
| `IDENTITY_LAST_OWNER` | 409 | conflict | no | At least one active owner must remain. |
| `IDENTITY_LOGIN_TAKEN` | 409 | conflict | no | This login is not available. |
| `IDENTITY_ALREADY_ENROLLED` | 409 | conflict | no | A local credential already exists. |
| `IDENTITY_INVALID_LOGIN` | 400 | validation | no | Use 3 to 64 lowercase letters, digits, dot, dash or underscore. |
| `IDENTITY_INVALID_NAME` | 400 | validation | no | Use a display name with 1 to 120 characters. |
| `IDENTITY_SESSION_NOT_FOUND` | 404 | not_found | no | The session was not found. |
| `IDENTITY_WEAK_PASSWORD` | 400 | validation | no | Use at least 12 characters that do not contain the login. |
| `IDENTITY_UNKNOWN_PERMISSION` | 400 | validation | no | The permission is not registered. |
| `IDENTITY_TOTP_REQUIRED` | 409 | conflict | no | Set up a second factor first. |
| `IDENTITY_DIRECTORY_UNAVAILABLE` | 503 | availability | no | The Sankhya user directory is not configured. |
| `IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND` | 404 | not_found | no | The external account was not found. |
| `IDENTITY_EXTERNAL_ACCOUNT_INACTIVE` | 409 | conflict | no | The external account can no longer sign in. |
| `IDENTITY_MERGE_NOT_ALLOWED` | 409 | conflict | no | These profiles cannot be combined automatically. |
| `IDENTITY_MERGE_BUSY` | 409 | conflict | yes | A conversation is still running. Try again shortly. |
| `IDENTITY_LOCAL_CREDENTIAL_REQUIRED` | 409 | conflict | no | Create a local password first. |
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
