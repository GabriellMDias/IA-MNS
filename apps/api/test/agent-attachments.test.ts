import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  prepareAttachment,
  projectAttachment,
} from "../src/features/agent/attachments.js";
import { AgentRepository } from "../src/features/agent/prisma-repository.js";
import { withMigratedDatabase } from "../scripts/migrated-database.js";
import { createDatabase } from "../src/database.js";

const upload = (text = "Synthetic operational note: apples 42.50") => ({
  id: randomUUID(),
  name: "analysis.txt",
  mediaType: "text/plain",
  purpose: "Summarize this operational note",
  source: "sankhya",
  contentBase64: Buffer.from(text).toString("base64"),
  classification: "business_operational",
  containsRestrictedData: false,
});
it("bounds and classifies text before storage and keeps exact document facts separate from ERP evidence", () => {
  const prepared = prepareAttachment(upload());
  const evidence = projectAttachment(prepared);
  expect(Object.values(evidence.facts)).toEqual(["42.50"]);
  expect(evidence.caveat).toContain("sem conciliação");
  for (const value of [
    { ...upload(), contentBase64: "bad" },
    { ...upload(), mediaType: "application/pdf" },
    { ...upload(), containsRestrictedData: true },
    { ...upload(), classification: "personal" },
    { ...upload(), name: "../secret.txt" },
    upload("password=secret-value"),
    upload("person@example.invalid"),
    upload("x".repeat(48001)),
    {
      ...upload(),
      contentBase64: Buffer.from([255, 254, 255]).toString("base64"),
    },
  ])
    expect(() => prepareAttachment(value)).toThrow("AGENT_ATTACHMENT_INVALID");
});
it("checks image signatures, size and dimensions and strips ancillary metadata", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJklEQVR4nO3NMQ0AAAwDoPo33arYsQQMkB6LQCAQCAQCgUAg+BIMi1X0pjxKe0gAAAAASUVORK5CYII=",
    "base64",
  );
  const prepared = prepareAttachment({
    ...upload(),
    name: "chart.png",
    mediaType: "image/png",
    contentBase64: png.toString("base64"),
  });
  expect(projectAttachment(prepared).image?.mediaType).toBe("image/png");
  const huge = Buffer.from(png);
  huge.writeUInt32BE(3000, 16);
  const corrupt = Buffer.from(png);
  corrupt[45] ^= 1;
  for (const bytes of [
    huge,
    corrupt,
    png.subarray(0, 30),
    Buffer.concat([png, Buffer.from("extra")]),
  ]) {
    expect(() =>
      prepareAttachment({
        ...upload(),
        mediaType: "image/png",
        contentBase64: bytes.toString("base64"),
      }),
    ).toThrow("AGENT_ATTACHMENT_INVALID");
  }
});
it("enforces owner isolation, immutable upload replay, busy writes, preferences and deletion of derived prose", async () => {
  await withMigratedDatabase(async (url) => {
    const database = createDatabase(url);
    try {
      const repo = new AgentRepository(database);
      const chat = await repo.create("alice"),
        payload = upload();
      await expect(repo.attach("bob", chat.id, payload)).rejects.toThrow(
        "AGENT_CONVERSATION_NOT_FOUND",
      );
      await repo.attach("alice", chat.id, payload);
      await repo.attach("alice", chat.id, payload);
      await expect(
        repo.attach("alice", chat.id, {
          ...payload,
          purpose: "Different purpose",
        }),
      ).rejects.toThrow("AGENT_REQUEST_CONFLICT");
      await repo.preferences("alice", chat.id, {
        language: "en",
        detail: "concise",
        format: "prose",
      });
      const requestId = randomUUID();
      const claim = await repo.claim(
        "alice",
        chat.id,
        requestId,
        "Summarize",
        "sankhya",
      );
      await expect(
        repo.removeAttachment("alice", chat.id, payload.id),
      ).rejects.toThrow("AGENT_CONVERSATION_BUSY");
      await repo.finish("alice", chat.id, claim.turn.id, {
        reply: {
          kind: "answer",
          message: "Derived synthetic prose",
          result: null,
          capabilityId: null,
          suggestions: [],
          attachmentRefs: [payload.id],
        },
        contexts: claim.contexts,
      });
      let detail = await repo.detail("alice", chat.id);
      expect(detail.preferences).toEqual({
        language: "en",
        detail: "concise",
        format: "prose",
      });
      expect(detail.attachments).toHaveLength(1);
      expect(JSON.stringify(detail)).not.toContain(payload.contentBase64);
      await repo.removeAttachment("alice", chat.id, payload.id);
      detail = await repo.detail("alice", chat.id);
      expect(detail.attachments).toEqual([]);
      expect(detail.turns[0]).toMatchObject({
        reply: null,
        state: "interrupted",
        failureCode: "AGENT_EVIDENCE_REMOVED",
      });
      expect(
        (await repo.claim("alice", chat.id, requestId, "Summarize", "sankhya"))
          .fresh,
      ).toBe(false);
      await repo.remove("alice", chat.id);
      expect(await database.agentTurn.count()).toBe(0);
    } finally {
      await database.$disconnect();
    }
  });
}, 120000);
