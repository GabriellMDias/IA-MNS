/**
 * Graph API client for the dedicated IA-MNS number: sends text replies and
 * marks received messages as read with a typing indicator. It never logs or
 * returns the access token, request bodies or Meta error texts.
 *
 * Every send result says what is known about delivery, because a WhatsApp
 * message cannot be recalled and Meta offers no idempotency key:
 * - `accepted`: Meta returned the message id;
 * - `retry`: Meta proved it did not accept the message (rate limits and
 *   temporary unavailability, or a connection that never opened), so sending
 *   again cannot duplicate it;
 * - `rejected`: Meta refused it permanently (for example the customer
 *   service window closed or the token is invalid);
 * - `unknown`: the request may have been accepted (timeout, lost response,
 *   unexpected server error) and must not be repeated.
 */
export type SendOutcome =
  | { kind: "accepted"; messageId: string }
  | { kind: "retry"; code: string; retryAfterMs: number | null }
  | { kind: "rejected"; code: string }
  | { kind: "unknown"; code: string };

export type Recipient = { phone: string | null; userId: string | null };

export type GraphOptions = {
  baseUrl: string;
  version: string;
  phoneNumberId: string;
  accessToken: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

// Throughput, pair-rate and temporary-availability errors: Meta did not
// accept the message, and it may be sent again after a pause.
const retryableCodes = new Set([
  "1",
  "2",
  "4",
  "80007",
  "130429",
  "131016",
  "131056",
]);
// Errors raised before any byte reached Meta.
const notConnected = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

function causeCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export class GraphClient {
  private readonly options: Required<Omit<GraphOptions, "fetcher">> & {
    fetcher: typeof fetch;
  };
  constructor(options: GraphOptions) {
    this.options = {
      ...options,
      fetcher: options.fetcher ?? fetch,
      timeoutMs: options.timeoutMs ?? 15_000,
    };
  }

  private post(payload: object, signal?: AbortSignal) {
    const { baseUrl, version, phoneNumberId, accessToken, timeoutMs } =
      this.options;
    return this.options.fetcher(
      `${baseUrl}/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      },
    );
  }

  async sendText(
    recipient: Recipient,
    body: string,
    signal?: AbortSignal,
  ): Promise<SendOutcome> {
    let response: Response;
    try {
      response = await this.post(
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          // A reported number takes precedence; the business-scoped user id
          // addresses senders who hide their number.
          ...(recipient.phone
            ? { to: recipient.phone }
            : { recipient: recipient.userId }),
          type: "text",
          text: { preview_url: false, body },
        },
        signal,
      );
    } catch (error) {
      const code = causeCode(error);
      return code && notConnected.has(code)
        ? { kind: "retry", code: "connection", retryAfterMs: null }
        : { kind: "unknown", code: "transport" };
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const id = (parsed as { messages?: { id?: unknown }[] } | null)
        ?.messages?.[0]?.id;
      return typeof id === "string" && id.length > 0 && id.length <= 256
        ? { kind: "accepted", messageId: id }
        : { kind: "unknown", code: "malformed_response" };
    }
    const raw = (parsed as { error?: { code?: unknown } } | null)?.error?.code;
    const code =
      typeof raw === "number" && Number.isSafeInteger(raw)
        ? String(raw)
        : `http_${response.status}`;
    if (response.status === 429 || retryableCodes.has(code)) {
      const after = Number(response.headers.get("retry-after"));
      return {
        kind: "retry",
        code,
        retryAfterMs:
          Number.isFinite(after) && after > 0
            ? Math.min(after, 300) * 1000
            : null,
      };
    }
    // A server error without a recognized code may have accepted the message.
    if (response.status >= 500) return { kind: "unknown", code };
    return { kind: "rejected", code };
  }

  /**
   * Marks a received message as read and shows the typing indicator while
   * the answer is prepared (Meta stops it at the reply or after 25 seconds).
   * Best effort: a failure changes nothing else.
   */
  async markRead(messageId: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await this.post(
        {
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          typing_indicator: { type: "text" },
        },
        signal,
      );
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  }
}
