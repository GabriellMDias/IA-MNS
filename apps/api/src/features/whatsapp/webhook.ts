import { createHmac, timingSafeEqual } from "node:crypto";
import {
  whatsappIdPattern,
  whatsappUserIdPattern,
} from "../identity/whatsapp.js";

/**
 * Meta signs every webhook payload with the app secret: HMAC-SHA256 of the
 * exact request bytes, sent as `X-Hub-Signature-256: sha256=<hex>`. The
 * comparison is constant time; anything malformed is simply invalid.
 */
export function validSignature(
  body: Buffer,
  header: unknown,
  appSecret: string,
): boolean {
  if (typeof header !== "string" || !/^sha256=[0-9a-fA-F]{64}$/.test(header))
    return false;
  const expected = createHmac("sha256", appSecret).update(body).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** A message sent to the IA-MNS number, as far as this version uses it. */
export type InboundEvent = Readonly<{
  messageId: string;
  /** Sender number (digits) when Meta reports it. */
  phone: string | null;
  /** Business-scoped user identifier when Meta reports it. */
  userId: string | null;
  sentAt: Date;
  kind: "text" | "unsupported";
  text: string | null;
}>;

/** Delivery state of a message IA-MNS sent. */
export type StatusEvent = Readonly<{
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  /** First Meta error code of a failed status. */
  errorCode: string | null;
}>;

export type Notification = {
  messages: InboundEvent[];
  statuses: StatusEvent[];
  /** Changes for another number or account, or of other fields; ignored. */
  ignored: number;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
const statuses = ["sent", "delivered", "read", "failed"] as const;

/**
 * Reads a signature-verified notification defensively. Only `messages`
 * changes of the configured number (and account, when configured) count;
 * malformed items are skipped, never trusted. Group messages are ignored:
 * this channel answers individuals only.
 */
export function readNotification(
  body: unknown,
  account: { phoneNumberId: string; businessAccountId?: string },
): Notification {
  const result: Notification = { messages: [], statuses: [], ignored: 0 };
  const root = record(body);
  if (root?.object !== "whatsapp_business_account") {
    result.ignored++;
    return result;
  }
  for (const entryValue of list(root.entry)) {
    const entry = record(entryValue);
    if (
      !entry ||
      (account.businessAccountId !== undefined &&
        entry.id !== account.businessAccountId)
    ) {
      result.ignored++;
      continue;
    }
    for (const changeValue of list(entry.changes)) {
      const change = record(changeValue);
      const value = record(change?.value);
      const metadata = record(value?.metadata);
      if (
        change?.field !== "messages" ||
        !value ||
        metadata?.phone_number_id !== account.phoneNumberId
      ) {
        result.ignored++;
        continue;
      }
      for (const item of list(value.messages)) {
        const message = record(item);
        const messageId = text(message?.id, 256);
        const seconds = Number(message?.timestamp);
        const phone = text(message?.from, 15);
        const userId = text(message?.from_user_id, 140);
        if (
          !message ||
          !messageId ||
          message.group_id !== undefined ||
          !Number.isSafeInteger(seconds) ||
          seconds <= 0
        ) {
          result.ignored++;
          continue;
        }
        const validPhone =
          phone && whatsappIdPattern.test(phone) ? phone : null;
        const validUser =
          userId && whatsappUserIdPattern.test(userId) ? userId : null;
        if (!validPhone && !validUser) {
          result.ignored++;
          continue;
        }
        const body =
          message.type === "text"
            ? text(record(message.text)?.body, 4096)
            : null;
        result.messages.push({
          messageId,
          phone: validPhone,
          userId: validUser,
          sentAt: new Date(seconds * 1000),
          kind: body === null ? "unsupported" : "text",
          text: body,
        });
      }
      for (const item of list(value.statuses)) {
        const status = record(item);
        const providerMessageId = text(status?.id, 256);
        const state = statuses.find(
          (candidate) => candidate === status?.status,
        );
        if (!providerMessageId || !state) {
          result.ignored++;
          continue;
        }
        const code = record(list(status?.errors)[0])?.code;
        result.statuses.push({
          providerMessageId,
          status: state,
          errorCode:
            typeof code === "number" && Number.isSafeInteger(code)
              ? String(code)
              : null,
        });
      }
    }
  }
  return result;
}
