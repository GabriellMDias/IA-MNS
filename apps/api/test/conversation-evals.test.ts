import { describe, expect, it } from "vitest";
import {
  loadConversationDataset,
  runConversationEvaluation,
} from "../evals/conversation.js";

describe("curated synthetic conversational evaluation", () => {
  it("passes the corpus through the real tool loop and evidence projection", async () => {
    const dataset = await loadConversationDataset();
    const report = await runConversationEvaluation({ dataset });
    expect(
      report.failed,
      JSON.stringify(report.cases.filter((item) => !item.passed)),
    ).toBe(0);
    expect(report.passed).toBe(dataset.cases.length);
    expect(report.skipped).toBe(0);
    expect(
      report.cases
        .find((item) => item.id === "conversation/query-then-summary")
        ?.turns.map((turn) => turn.reads),
    ).toEqual([1, 0]);
    expect(
      report.cases.find(
        (item) => item.id === "conversation/tool-loop-hard-bound",
      )?.turns[0].modelCalls,
    ).toBe(7);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("9876.54");
    expect(serialized).not.toContain("R$ 9.876,54");
    expect(serialized).not.toContain("maçã");
  });

  it("makes subject applicability explicit for adversarial provider fixtures", async () => {
    const report = await runConversationEvaluation({
      caseIds: ["conversation/tool-loop-hard-bound"],
      model: {
        provider: "synthetic",
        model: "unused",
        invoke: () => {
          throw new Error("A skipped case must not invoke the provider");
        },
      },
    });
    expect(report).toMatchObject({
      subject: "model",
      passed: 0,
      failed: 0,
      skipped: 1,
    });
  });

  it("rejects an empty case selection", async () => {
    await expect(
      runConversationEvaluation({ caseIds: ["not-a-case"] }),
    ).rejects.toThrow("No conversational evaluation cases selected");
  });
});
