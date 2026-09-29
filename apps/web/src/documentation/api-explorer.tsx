import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadClientConfig } from "../config.js";
import {
  buildExplorerRequest,
  changesData,
  explorerLimitation,
  parameterKey,
  readExplorerResponse,
  requestTemplate,
  requiresBearer,
  REQUEST_TIMEOUT_MS,
  type ExplorerOperation,
} from "./api-explorer-request.js";

export type { ExplorerOperation } from "./api-explorer-request.js";

type Result = Awaited<ReturnType<typeof readExplorerResponse>> & {
  status: number;
  elapsed: number;
};

/** Remounting the session clears credentials, request data, results, and pending work. */
export function ApiExplorer({ operation }: { operation: ExplorerOperation }) {
  const [revision, setRevision] = useState(0);
  return (
    <ExplorerSession
      key={`${operation.operationId}:${revision}`}
      operation={operation}
      onClear={() => setRevision((current) => current + 1)}
    />
  );
}

function ExplorerSession({
  operation,
  onClear,
}: {
  operation: ExplorerOperation;
  onClear: () => void;
}) {
  const id = useId();
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const template = useMemo(
    () =>
      operation.request
        ? requestTemplate(
            operation.request.schema,
            operation.components?.schemas,
          )
        : "",
    [operation.request, operation.components?.schemas],
  );
  const [body, setBody] = useState(template);
  const [acknowledged, setAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<{
    controller: AbortController;
    cancelled: boolean;
    timer: number | undefined;
  } | null>(null);
  const limitation = explorerLimitation(operation);
  const mutation = changesData(operation);
  const authenticated = requiresBearer(operation);
  let base: string | null = null;
  try {
    base = loadClientConfig().apiBaseUrl;
  } catch {
    // Show a safe configuration error without rendering environment values.
  }

  useEffect(
    () => () => {
      const request = pending.current;
      pending.current = null;
      window.clearTimeout(request?.timer);
      request?.controller.abort();
    },
    [],
  );

  async function send() {
    if (pending.current || !base) return;
    setError(null);
    setResult(null);
    let request: ReturnType<typeof buildExplorerRequest>;
    try {
      request = buildExplorerRequest(operation, {
        apiBaseUrl: base,
        parameters,
        token,
        body,
        acknowledged,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Check the request fields.",
      );
      return;
    }
    const current = {
      controller: new AbortController(),
      cancelled: false,
      timer: undefined as number | undefined,
    };
    pending.current = current;
    setRunning(true);
    const started = performance.now();
    current.timer = window.setTimeout(
      () => current.controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(request.url, {
        ...request.init,
        signal: current.controller.signal,
      });
      const details = await readExplorerResponse(response, token.trim());
      current.controller.signal.throwIfAborted();
      if (pending.current === current) {
        setResult({
          ...details,
          status: response.status,
          elapsed: Math.round(performance.now() - started),
        });
      }
    } catch {
      if (pending.current === current) {
        const reason = current.cancelled
          ? "Request cancelled."
          : current.controller.signal.aborted
            ? "Request timed out after 15 seconds."
            : "The request could not be completed. Check the API connection; redirects are not followed.";
        setError(
          `${reason}${mutation ? " The outcome may be unknown: cancellation does not undo server work. Inspect the resource before retrying; preserve the original idempotency key when the contract supports it." : ""}`,
        );
      }
    } finally {
      window.clearTimeout(current.timer);
      if (pending.current === current) {
        pending.current = null;
        setRunning(false);
        setAcknowledged(false);
      }
    }
  }

  return (
    <section className="docs-explorer" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Try this operation</h3>
      <p>
        Sends an explicit request to the configured same-origin API. Use a local
        or test environment and synthetic data. The API enforces the contract
        and permissions.
      </p>
      <p className="docs-muted">
        Credentials, request values, and responses stay in this page's memory
        and clear when you leave this operation. No automatic requests or
        retries. Responses are limited to 64 KiB; requests time out after 15
        seconds.
      </p>
      {!base && (
        <p role="alert" className="docs-error">
          The API base path configuration is invalid.
        </p>
      )}
      {limitation && <p className="docs-muted">{limitation}</p>}
      {!limitation && base && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset disabled={running} className="docs-explorer-fields">
            <legend>Request inputs</legend>
            {authenticated && (
              <div className="docs-field">
                <label htmlFor={`${id}-token`}>Access token</label>
                <input
                  id={`${id}-token`}
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-describedby={`${id}-token-help`}
                />
                <span id={`${id}-token-help`} className="docs-muted">
                  An already-issued bearer token, held in memory only. Never use
                  production credentials here.
                </span>
              </div>
            )}
            {operation.parameters.map((parameter) => {
              const key = parameterKey(parameter);
              return (
                <div key={key} className="docs-field">
                  <label htmlFor={`${id}-${key}`}>
                    {parameter.name} ({parameter.in})
                  </label>
                  <input
                    id={`${id}-${key}`}
                    value={parameters[key] ?? ""}
                    onChange={(event) =>
                      setParameters((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    required={parameter.required}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={`${id}-${key}-help`}
                  />
                  <span id={`${id}-${key}-help`} className="docs-muted">
                    {parameter.required ? "Required" : "Optional"} ·{" "}
                    {parameter.type}
                  </span>
                </div>
              );
            })}
            {operation.request && (
              <div className="docs-field">
                <label htmlFor={`${id}-body`}>JSON request body</label>
                <textarea
                  id={`${id}-body`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={10}
                  spellCheck={false}
                  autoComplete="off"
                  required={operation.request.required !== false}
                  aria-describedby={`${id}-body-help`}
                />
                <p id={`${id}-body-help`} className="docs-muted">
                  The generated template is a starting shape. Replace its values
                  and inspect the schema; the server performs validation.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setBody(template)}
                >
                  Reset body template
                </button>
              </div>
            )}
            {mutation && (
              <div className="docs-mutation-notice">
                <p>
                  This operation can change real API data. Review the operation,
                  target identifiers, body, and concurrency or idempotency
                  parameters before sending. Cancelling cannot undo work the
                  server has accepted.
                </p>
                <label className="docs-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    required
                  />
                  I understand this request can change real API data.
                </label>
              </div>
            )}
            <button type="submit">
              {running ? "Sending request…" : "Send request"}
            </button>
          </fieldset>
          <div className="docs-actions">
            {running && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const request = pending.current;
                  if (request) {
                    request.cancelled = true;
                    request.controller.abort();
                  }
                }}
              >
                Cancel request
              </button>
            )}
            <button type="button" className="secondary" onClick={onClear}>
              Clear request and response
            </button>
          </div>
        </form>
      )}
      {running && <p role="status">Waiting for the API response…</p>}
      {error && (
        <p role="alert" className="docs-error">
          {error}
        </p>
      )}
      {result && (
        <section
          className="docs-response"
          aria-labelledby={`${id}-response-title`}
        >
          <h4 id={`${id}-response-title`}>Response</h4>
          <p role="status">
            <strong>HTTP {result.status}</strong> · {result.elapsed} ms
          </p>
          {result.status >= 500 && mutation && (
            <p className="docs-mutation-notice">
              The outcome may be unknown. Inspect current state before retrying
              a mutation.
            </p>
          )}
          <details>
            <summary>Safe response headers ({result.headers.length})</summary>
            <dl>
              {result.headers.map(([name, value]) => (
                <div key={name}>
                  <dt>
                    <code>{name}</code>
                  </dt>
                  <dd>
                    <code>{value}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          {result.truncated && (
            <p role="status">
              Response truncated at the 64 KiB read limit. This is an incomplete
              response.
            </p>
          )}
          <pre tabIndex={0} aria-label="Response body">
            <code>{result.body || "(empty response body)"}</code>
          </pre>
          <p className="docs-muted">
            Credential-like JSON fields, bearer values, and echoes of the
            supplied token are redacted. Response content can still contain
            application data; clear it when finished.
          </p>
        </section>
      )}
    </section>
  );
}
