import { Type, type Static } from "typebox";
import { crc32 } from "node:zlib";
import { Value } from "typebox/value";
import { redactModelText, safeModelText } from "../../ai/transmission-text.js";
import { AgentFailure } from "./errors.js";

const object = { additionalProperties: false };
export const attachmentMetadataSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    mediaType: Type.Union([
      Type.Literal("text/plain"),
      Type.Literal("text/csv"),
      Type.Literal("image/png"),
      Type.Literal("image/jpeg"),
    ]),
    purpose: Type.String({ minLength: 5, maxLength: 300 }),
    source: Type.Union([
      Type.Literal("sankhya"),
      Type.Literal("vrmaster"),
      Type.Literal("all"),
    ]),
  },
  object,
);
export const uploadAttachmentSchema = Type.Object(
  {
    ...attachmentMetadataSchema.properties,
    contentBase64: Type.String({ minLength: 4, maxLength: 131072 }),
    classification: Type.Literal("business_operational"),
    containsRestrictedData: Type.Literal(false),
  },
  object,
);
export type AttachmentMetadata = Static<typeof attachmentMetadataSchema>;
export type Attachment = AttachmentMetadata & { contentBase64: string };
export function attachmentMetadata(item: Attachment): AttachmentMetadata {
  const { id, name, mediaType, purpose, source } = item;
  return { id, name, mediaType, purpose, source };
}
const invalid = () => new AgentFailure("AGENT_ATTACHMENT_INVALID");

/** Image envelopes are bounded and stripped of metadata; no document code executes. */
function cleanImage(bytes: Buffer, mediaType: string): Buffer {
  const bounds = (width: number, height: number) => {
    if (
      !width ||
      !height ||
      width > 2048 ||
      height > 2048 ||
      width * height > 1048576
    )
      throw invalid();
  };
  if (mediaType === "image/png") {
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw invalid();
    const chunks = [bytes.subarray(0, 8)];
    let offset = 8,
      header = false,
      data = false,
      ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset),
        type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12) throw invalid();
      if (
        crc32(bytes.subarray(offset + 4, offset + 8 + length)) !==
        bytes.readUInt32BE(offset + 8 + length)
      )
        throw invalid();
      const chunk = bytes.subarray(offset, offset + length + 12);
      if (!header && type !== "IHDR") throw invalid();
      if (type === "IHDR") {
        if (header || length !== 13) throw invalid();
        bounds(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
        header = true;
      } else if (type === "IDAT") data = true;
      else if (type === "IEND") {
        if (length || !data) throw invalid();
        ended = true;
      } else if (
        !["PLTE", "tRNS"].includes(type) &&
        type[0] === type[0]?.toUpperCase()
      )
        throw invalid();
      if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type))
        chunks.push(chunk);
      offset += length + 12;
      if (ended) break;
    }
    if (!ended || offset !== bytes.length) throw invalid();
    return Buffer.concat(chunks);
  }
  if (
    bytes.readUInt16BE(0) !== 0xffd8 ||
    bytes.readUInt16BE(bytes.length - 2) !== 0xffd9
  )
    throw invalid();
  const segments = [bytes.subarray(0, 2)];
  let offset = 2,
    dimensions = false;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) throw invalid();
    const marker = bytes[offset + 1],
      length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) throw invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) throw invalid();
      bounds(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
      dimensions = true;
    }
    if (marker === 0xda) {
      if (!dimensions) throw invalid();
      segments.push(bytes.subarray(offset));
      return Buffer.concat(segments);
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      segments.push(bytes.subarray(offset, offset + length + 2));
    offset += length + 2;
  }
  throw invalid();
}

export function prepareAttachment(value: unknown): Attachment {
  if (!Value.Check(uploadAttachmentSchema, value)) throw invalid();
  const bytes = Buffer.from(value.contentBase64, "base64");
  if (
    bytes.toString("base64") !== value.contentBase64 ||
    bytes.length < 1 ||
    bytes.length > 98304 ||
    /[\\/]/u.test(value.name) ||
    [...value.name].some((character) => character.charCodeAt(0) < 32)
  )
    throw invalid();
  if (
    redactModelText(value.name) !== value.name ||
    redactModelText(value.purpose) !== value.purpose
  )
    throw invalid();
  let normalized: Buffer = bytes;
  if (value.mediaType.startsWith("text/")) {
    if (bytes.length > 48000) throw invalid();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw invalid();
    }
    if (!text.trim() || text.includes("\0") || redactModelText(text) !== text)
      throw invalid();
  } else {
    try {
      normalized = cleanImage(bytes, value.mediaType);
    } catch {
      throw invalid();
    }
  }
  return {
    ...attachmentMetadata(value),
    contentBase64: normalized.toString("base64"),
  };
}

export function loadAttachments(
  contexts: Readonly<Record<string, unknown>>,
): Attachment[] {
  if (contexts._attachments === undefined) return [];
  if (!Array.isArray(contexts._attachments) || contexts._attachments.length > 4)
    throw invalid();
  return contexts._attachments.map((item: unknown) => {
    if (!item || typeof item !== "object") throw invalid();
    return prepareAttachment({
      ...item,
      classification: "business_operational",
      containsRestrictedData: false,
    });
  });
}

export function attachmentEvidenceId(item: Attachment) {
  return `a_${item.id.replaceAll("-", "_")}`;
}
export function projectAttachment(item: Attachment) {
  const id = attachmentEvidenceId(item);
  const facts: Record<string, string> = {};
  const text = item.mediaType.startsWith("text/")
    ? Buffer.from(item.contentBase64, "base64").toString("utf8")
    : null;
  if (text !== null) {
    let index = 0;
    // Exact user-supplied occurrences, not verified ERP values or calculated totals.
    for (const match of text.matchAll(/-?\d[\d.,:/%-]*/gu)) {
      if (index >= 1000) break;
      facts[`${id}_n${index++}`] = match[0];
    }
  }
  return {
    id,
    metadata: attachmentMetadata(item),
    facts,
    text: text === null ? null : safeModelText(text, 48000),
    image:
      text === null
        ? {
            mediaType: item.mediaType as "image/png" | "image/jpeg",
            data: item.contentBase64,
          }
        : null,
    caveat:
      "Conteúdo fornecido pelo usuário, sem conciliação com o ERP. Valores lidos de imagens precisam de conferência; uma extração parcial não comprova totais.",
  };
}
