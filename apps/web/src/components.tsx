import { useEffect, useState, type FormEvent } from "react";
import { failureMessage } from "./api.js";

export function AccessTokenForm({
  onConnect,
  showLocalIdentity = true,
}: {
  onConnect: (token: string) => void;
  showLocalIdentity?: boolean;
}) {
  const [entry, setEntry] = useState("");
  function connect(event: FormEvent) {
    event.preventDefault();
    const value = entry.trim();
    if (!value) return;
    onConnect(value);
    setEntry("");
  }
  return (
    <section
      className="panel credential-panel"
      aria-labelledby="credential-title"
    >
      <p className="eyebrow">Access</p>
      <h1 id="credential-title">Connect with an access token</h1>
      <p>
        Enter a bearer access token from a trusted issuer. The token stays in
        memory and is cleared on refresh or disconnect.
      </p>
      <form onSubmit={connect} className="form-stack">
        <label htmlFor="access-token">Access token</label>
        <input
          id="access-token"
          type="password"
          autoComplete="off"
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
          required
        />
        <button type="submit" className="button-primary">
          Connect
        </button>
      </form>
      {showLocalIdentity && <LocalIdentityConnect onConnect={onConnect} />}
    </section>
  );
}

function LocalIdentityConnect({
  onConnect,
}: {
  onConnect: (token: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    void fetch("/__orion_local_identity/available", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "available" in body &&
          body.available === true
        )
          setAvailable(true);
      })
      .catch(() => {
        /* The manual issuer is optional in ordinary web development. */
      });
    return () => controller.abort();
  }, []);

  async function connectLocal(actor: "owner" | "reviewer") {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/__orion_local_identity/${actor}`, {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) throw new Error("Local identity unavailable.");
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("accessToken" in body) ||
        typeof body.accessToken !== "string"
      )
        throw new Error("Invalid local identity response.");
      onConnect(body.accessToken);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  if (!import.meta.env.DEV || !available) return null;
  return (
    <div className="form-stack">
      <p>Local synthetic identities</p>
      <div className="action-group">
        <button
          type="button"
          disabled={pending}
          onClick={() => void connectLocal("owner")}
        >
          Use local owner
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void connectLocal("reviewer")}
        >
          Use local reviewer
        </button>
      </div>
      {failed && (
        <p role="alert">
          Local identity is unavailable. Restart the local workflow.
        </p>
      )}
    </div>
  );
}

export function ErrorNotice({
  error,
  onReload,
  operation = "read",
}: {
  error: unknown;
  onReload?: () => void;
  operation?: "read" | "create" | "write";
}) {
  return (
    <div role="alert" className="notice notice-error">
      <strong>{failureMessage(error, operation)}</strong>
      {onReload && (
        <button type="button" onClick={onReload}>
          Reload current request
        </button>
      )}
    </div>
  );
}
