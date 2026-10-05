/**
 * Embedded host bridge, protocol v1. The IA-MNS frame asks its parent host for a
 * proof bound to a pending server flow. Only opaque proofs travel here (a PDT
 * authorization code or a Sankhya assertion); IA-MNS validates them server-side.
 * Messages are accepted only from the configured host origin and the parent
 * window, and are sent only to that origin, never "*".
 */
export type HostRequest =
  | { provider: "pdt"; state: string; code_challenge: string }
  | { provider: "sankhya"; nonce: string };
export type HostProof =
  { code: string; state: string; iss: string } | { assertion: string };

export class HostBridgeError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Host bridge: ${reason}`);
    this.name = "HostBridgeError";
    this.reason = reason;
  }
}

export function requestHostProof(
  hostOrigin: string,
  request: HostRequest,
  timeoutMs = 15_000,
): Promise<HostProof> {
  if (window.parent === window)
    return Promise.reject(new HostBridgeError("not_embedded"));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new HostBridgeError("timeout"));
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.origin !== hostOrigin || event.source !== window.parent) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.v !== 1 || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (data.type === "ia-mns:auth-response") {
        if (
          request.provider === "pdt" &&
          typeof data.code === "string" &&
          typeof data.state === "string" &&
          typeof data.iss === "string"
        )
          resolve({ code: data.code, state: data.state, iss: data.iss });
        else if (
          request.provider === "sankhya" &&
          typeof data.assertion === "string"
        )
          resolve({ assertion: data.assertion });
        else reject(new HostBridgeError("malformed_response"));
      } else
        reject(
          new HostBridgeError(
            typeof data.error === "string"
              ? data.error.slice(0, 80)
              : "host_error",
          ),
        );
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { v: 1, type: "ia-mns:auth-request", requestId, ...request },
      hostOrigin,
    );
  });
}
