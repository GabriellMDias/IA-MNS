import { describe, expect, it, vi } from "vitest";
import { SalesChat } from "../src/features/sales/application.js";
import { emptySalesState } from "../src/features/sales/conversation-state.js";
import {
  comparisonQuery,
  type SalesData,
  type SalesQuery,
} from "../src/features/sales/domain.js";
import { SalesFailure } from "../src/features/sales/errors.js";
import type { SalesInterpreter } from "../src/features/sales/interpreter.js";
import type { Interpretation } from "../src/features/sales/interpretation.js";
import type { SalesReader } from "../src/features/sales/reader.js";
import {
  isSourceName,
  mentionedSources,
  selectionNotice,
  sourcesOf,
} from "../src/features/sales/sources.js";
import { interpretation } from "../evals/fixtures.js";

// Today is 2026-10-01 in Sao Paulo.
const now = () => new Date("2026-10-01T15:00:00Z");
const september = interpretation({
  measure: "net_value",
  period: { kind: "month", month: 9, year: 2026 },
});
function data(value: string, unit = "BRL"): SalesData {
  return {
    rows: [{ period: "total", product: null, unit, value }],
    products: [],
    missingWeight: false,
  };
}
function reader(value: string, unit = "BRL") {
  return {
    read: vi.fn((query: SalesQuery) =>
      Promise.resolve({
        current: data(value, unit),
        previous: comparisonQuery(query) ? data("1", unit) : null,
      }),
    ),
    close: vi.fn(() => Promise.resolve()),
  } satisfies SalesReader;
}
function setup(
  readings: Interpretation[] = [september],
  readers = { sankhya: reader("1000.10"), vrmaster: reader("250.20") },
) {
  const interpreter: SalesInterpreter = {
    interpret: vi.fn(() => Promise.resolve(readings.shift() ?? september)),
  };
  const chat = new SalesChat(interpreter, readers, undefined, now);
  const ask = (
    message: string,
    selection: "sankhya" | "vrmaster" | "all",
    state = emptySalesState,
    report?: (error: unknown) => void,
  ) =>
    chat.execute(
      message,
      "c",
      state,
      new AbortController().signal,
      undefined,
      undefined,
      { selection, report },
    );
  return { chat, readers, ask, interpreter };
}

describe("source catalog", () => {
  it("maps each selection to its sources in fixed order", () => {
    expect(sourcesOf("sankhya")).toEqual(["sankhya"]);
    expect(sourcesOf("vrmaster")).toEqual(["vrmaster"]);
    expect(sourcesOf("all")).toEqual(["sankhya", "vrmaster"]);
  });
  it("recognizes source names without treating IA-MNS as MNS", () => {
    expect(mentionedSources("Quanto vendi no VR Master?")).toEqual([
      "vrmaster",
    ]);
    expect(mentionedSources("vendas da Pilar da Terra e da MNS")).toEqual([
      "sankhya",
      "vrmaster",
    ]);
    expect(mentionedSources("Pergunta ao IA-MNS sobre maçã")).toEqual([]);
    expect(mentionedSources("vendas no vrmaster e no Sankhya")).toEqual([
      "sankhya",
      "vrmaster",
    ]);
    expect(isSourceName("Pilar da Terra")).toBe(true);
    expect(isSourceName("maçã da terra")).toBe(false);
  });
  it("builds a notice only when the text names another source", () => {
    expect(selectionNotice("vendas de maçã", "sankhya")).toBeNull();
    expect(selectionNotice("vendas na MNS", "sankhya")).toBeNull();
    expect(selectionNotice("vendas no VR Master", "sankhya")).toContain(
      "Consultei somente a fonte selecionada",
    );
    expect(selectionNotice("vendas no VR Master", "all")).toContain(
      "consultei as duas fontes",
    );
  });
});

describe("source selection", () => {
  it("queries only Sankhya when MNS (Sankhya) is selected", async () => {
    const { ask, readers } = setup();
    const turn = await ask("Quanto vendi em setembro?", "sankhya");
    expect(readers.sankhya.read).toHaveBeenCalledTimes(1);
    expect(readers.vrmaster.read).not.toHaveBeenCalled();
    expect(turn.reply.answer).toMatchObject({
      selection: "sankhya",
      sections: [{ source: "sankhya", status: "answered" }],
    });
    expect(turn.reply.message).toMatch(/^MNS \(Sankhya\): Valor líquido/);
    expect(turn.reply.answer?.sections[0].result?.warnings[0]).toContain(
      "DTNEG",
    );
  });
  it("queries only VRMaster when Pilar da Terra (VR Master) is selected", async () => {
    const { ask, readers } = setup();
    const turn = await ask("Quanto vendi em setembro?", "vrmaster");
    expect(readers.vrmaster.read).toHaveBeenCalledTimes(1);
    expect(readers.sankhya.read).not.toHaveBeenCalled();
    const [section] = turn.reply.answer!.sections;
    expect(section).toMatchObject({ source: "vrmaster", status: "answered" });
    expect(section.result?.totals).toEqual([
      {
        unit: "BRL",
        value: "250.20",
        previousValue: null,
        changePercent: null,
      },
    ]);
    expect(section.result?.warnings[0]).toContain("valortotal");
    expect(turn.reply.message).toContain(
      "Pilar da Terra (VR Master): Valor total vendido",
    );
    expect(turn.reply.suggestions).not.toContain("E o peso vendido?");
  });
  it("queries both sources for Tudo and keeps them separate without a sum", async () => {
    const { ask, readers } = setup();
    const turn = await ask("Quanto vendi em setembro?", "all");
    expect(readers.sankhya.read).toHaveBeenCalledTimes(1);
    expect(readers.vrmaster.read).toHaveBeenCalledTimes(1);
    expect(readers.sankhya.read.mock.calls[0][0]).toEqual(
      readers.vrmaster.read.mock.calls[0][0],
    );
    const sections = turn.reply.answer!.sections;
    expect(sections.map((section) => section.source)).toEqual([
      "sankhya",
      "vrmaster",
    ]);
    expect(sections.map((section) => section.result?.totals[0].value)).toEqual([
      "1000.10",
      "250.20",
    ]);
    // 1000.10 + 250.20 must never appear as a combined figure.
    expect(turn.reply.message).not.toContain("1.250,30");
    expect(JSON.stringify(turn.reply.answer)).not.toContain("1250.3");
    expect(turn.reply.message).toContain("R$ 1.000,10");
    expect(turn.reply.message).toContain("R$ 250,20");
    expect(turn.reply.message).toContain("os valores não são somados");
  });
  it("keeps the Sankhya result when VRMaster fails in Tudo", async () => {
    const { ask, readers } = setup();
    readers.vrmaster.read.mockRejectedValueOnce(
      new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
    );
    const report = vi.fn();
    const turn = await ask(
      "Quanto vendi em setembro?",
      "all",
      undefined,
      report,
    );
    expect(turn.reply.answer?.sections).toMatchObject([
      { source: "sankhya", status: "answered", reason: null },
      {
        source: "vrmaster",
        status: "unavailable",
        reason: "provider_unavailable",
        result: null,
      },
    ]);
    expect(turn.reply.message).toContain("R$ 1.000,10");
    expect(turn.reply.message).toContain(
      "Pilar da Terra (VR Master): não consegui consultar esta fonte agora",
    );
    expect(report).toHaveBeenCalledWith(expect.any(SalesFailure));
  });
  it("keeps the VRMaster result when Sankhya fails in Tudo", async () => {
    const { ask, readers } = setup();
    readers.sankhya.read.mockRejectedValueOnce(
      new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
    );
    const turn = await ask("Quanto vendi em setembro?", "all");
    expect(turn.reply.answer?.sections).toMatchObject([
      { source: "sankhya", status: "unavailable" },
      { source: "vrmaster", status: "answered" },
    ]);
    expect(turn.reply.message).toContain("R$ 250,20");
  });
  it("fails the turn when every source of Tudo fails", async () => {
    const { ask, readers } = setup();
    readers.sankhya.read.mockRejectedValueOnce(
      new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
    );
    readers.vrmaster.read.mockRejectedValueOnce(
      new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
    );
    await expect(ask("Quanto vendi em setembro?", "all")).rejects.toThrow(
      "SALES_PROVIDER_UNAVAILABLE",
    );
  });
  it("routes the next query by the changed selection, keeping the analysis", async () => {
    const lastMonth = interpretation({
      relation: "refine",
      period: { kind: "previous", unit: "month" },
    });
    const { ask, readers } = setup([september, lastMonth]);
    const first = await ask("Quanto vendi em setembro?", "sankhya");
    const second = await ask("E no mês passado?", "vrmaster", first.state);
    expect(readers.sankhya.read).toHaveBeenCalledTimes(1);
    expect(readers.vrmaster.read).toHaveBeenCalledTimes(1);
    expect(readers.vrmaster.read.mock.calls[0][0]).toMatchObject({
      metric: "net_value",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
    expect(second.reply.answer?.sections[0].source).toBe("vrmaster");
  });
  it("never lets the message text switch or add a source", async () => {
    const { ask, readers } = setup();
    const turn = await ask("Quanto vendi no VR Master em setembro?", "sankhya");
    expect(readers.vrmaster.read).not.toHaveBeenCalled();
    expect(readers.sankhya.read).toHaveBeenCalledTimes(1);
    expect(turn.reply.answer?.selection).toBe("sankhya");
    expect(turn.reply.message).toMatch(
      /^Sua mensagem menciona Pilar da Terra \(VR Master\), mas a fonte selecionada é MNS \(Sankhya\)/,
    );
  });
  it("drops a source name the model placed in the product filter", async () => {
    const { ask, readers } = setup([
      interpretation({
        measure: "net_value",
        filters: { product: "Pilar da Terra" },
        period: { kind: "month", month: 9, year: 2026 },
      }),
    ]);
    await ask("Quanto vendi na Pilar da Terra em setembro?", "vrmaster");
    expect(readers.vrmaster.read.mock.calls[0][0].productSearch).toBeNull();
  });
  it("fails safely when VRMaster alone is unavailable or not configured", async () => {
    const { ask, readers } = setup();
    readers.vrmaster.read.mockRejectedValueOnce(
      new SalesFailure("SALES_PROVIDER_UNAVAILABLE"),
    );
    await expect(ask("Quanto vendi em setembro?", "vrmaster")).rejects.toThrow(
      "SALES_PROVIDER_UNAVAILABLE",
    );
    expect(readers.sankhya.read).not.toHaveBeenCalled();
    const unconfigured = setup(undefined, {
      sankhya: reader("1"),
    } as never);
    await expect(
      unconfigured.ask("Quanto vendi em setembro?", "vrmaster"),
    ).rejects.toThrow("SALES_NOT_CONFIGURED");
    const partial = await unconfigured.ask("Quanto vendi em setembro?", "all");
    expect(partial.reply.answer?.sections[1]).toMatchObject({
      source: "vrmaster",
      status: "unavailable",
      reason: "not_configured",
    });
  });
  it("reports weight as unavailable in VRMaster without querying it", async () => {
    const weight = interpretation({
      measure: "weight",
      period: { kind: "month", month: 9, year: 2026 },
    });
    const only = setup([weight]);
    const turn = await only.ask("Qual o peso vendido em setembro?", "vrmaster");
    expect(only.readers.vrmaster.read).not.toHaveBeenCalled();
    expect(turn.reply.kind).toBe("unsupported");
    expect(turn.reply.message).toContain("o peso vendido não está disponível");
    expect(turn.state.active?.query.metric).toBe("weight");
    const both = setup([weight], {
      sankhya: reader("12.5", "PESOLIQ"),
      vrmaster: reader("1"),
    });
    const mixed = await both.ask("Qual o peso vendido em setembro?", "all");
    expect(both.readers.vrmaster.read).not.toHaveBeenCalled();
    expect(mixed.reply.answer?.sections).toMatchObject([
      { source: "sankhya", status: "answered" },
      { source: "vrmaster", status: "unsupported", reason: "measure" },
    ]);
  });
  it("labels VRMaster quantities by packaging type without mixing them", async () => {
    const quantity = interpretation({
      measure: "quantity",
      period: { kind: "month", month: 9, year: 2026 },
    });
    const vr = {
      read: vi.fn(() =>
        Promise.resolve({
          current: {
            rows: [
              {
                period: "total",
                product: null,
                unit: "EMBALAGEM:1",
                value: "3",
              },
              {
                period: "total",
                product: null,
                unit: "EMBALAGEM:4",
                value: "2.5",
              },
            ],
            products: [],
            missingWeight: false,
          },
          previous: null,
        }),
      ),
      close: vi.fn(() => Promise.resolve()),
    };
    const { ask } = setup([quantity], { sankhya: reader("1"), vrmaster: vr });
    const turn = await ask("Quantas unidades vendi em setembro?", "vrmaster");
    expect(turn.reply.answer?.sections[0].result?.totals).toHaveLength(2);
    expect(turn.reply.message).toContain("3 (tipo de embalagem 1)");
    expect(turn.reply.message).toContain("2,5 (tipo de embalagem 4)");
  });
});
