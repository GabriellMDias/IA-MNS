import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SalesAnswer, SalesResults } from "../src/features/sales/results.js";
import "../src/features/sales/sales.css";
import type { SalesResult } from "../src/features/sales/api.js";

const comparative: SalesResult = {
  query: {
    productSearch: "maçã",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    metric: "net_value",
    groupBy: "product",
    comparison: "previous_year",
  },
  rows: [],
  products: [],
  warnings: [],
  totals: [
    { unit: "BRL", value: "0", previousValue: "10", changePercent: "-100" },
  ],
  comparison: {
    startDate: "2025-07-01",
    endDate: "2025-09-30",
    rows: [
      { period: "total", product: "1 - MAÇÃ GALA", unit: "BRL", value: "10" },
    ],
  },
};
test("prior-only sales remain inspectable when the current period is empty", async () => {
  const screen = await render(<SalesResults result={comparative} />);
  await screen.getByText("Período comparado: 01/07/2025 a 30/09/2025").click();
  await expect
    .element(screen.getByRole("cell", { name: "R$ 10,00", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("01/07/2026 a 30/09/2026 · maçã"))
    .toBeVisible();
});
test("negative monthly adjustments stay signed in the table without positive-only bars", async () => {
  const screen = await render(
    <SalesResults
      result={{
        ...comparative,
        query: { ...comparative.query, groupBy: "month" },
        rows: [{ period: "2026-07", product: null, unit: "BRL", value: "-10" }],
      }}
    />,
  );
  await expect
    .element(screen.getByRole("button", { name: "Gráfico" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("cell", { name: "R$ -10,00", exact: true }))
    .toBeVisible();
});

test("mixed quantity units stay separate and cannot share a chart", async () => {
  const screen = await render(
    <SalesResults
      result={{
        query: {
          productSearch: null,
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          metric: "quantity",
          groupBy: "month",
          comparison: "none",
        },
        products: [],
        comparison: null,
        warnings: [],
        rows: [
          { period: "2026-07", product: null, unit: "KG", value: "10" },
          { period: "2026-07", product: null, unit: "CX", value: "3" },
        ],
        totals: [
          { unit: "KG", value: "10", previousValue: null, changePercent: null },
          { unit: "CX", value: "3", previousValue: null, changePercent: null },
        ],
      }}
    />,
  );
  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Gráfico" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("cell", { name: "10 KG", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("cell", { name: "3 CX", exact: true }))
    .toBeVisible();
});

const total = (value: string, unit = "BRL"): SalesResult => ({
  query: {
    productSearch: null,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    metric: unit === "BRL" ? "net_value" : "quantity",
    groupBy: "total",
    comparison: "none",
  },
  rows: [{ period: "total", product: null, unit, value }],
  products: [],
  comparison: null,
  warnings: [],
  totals: [{ unit, value, previousValue: null, changePercent: null }],
});
test("each source keeps its own labeled section and figures are never summed", async () => {
  const screen = await render(
    <SalesAnswer
      answer={{
        selection: "all",
        sections: [
          {
            source: "sankhya",
            status: "answered",
            reason: null,
            result: total("1000.10"),
          },
          {
            source: "vrmaster",
            status: "answered",
            reason: null,
            result: total("250.20"),
          },
        ],
      }}
    />,
  );
  const sankhya = screen.getByRole("group", { name: "Fonte: MNS (Sankhya)" });
  const vrmaster = screen.getByRole("group", {
    name: "Fonte: Pilar da Terra (VR Master)",
  });
  await expect
    .element(sankhya.getByRole("cell", { name: "R$ 1.000,10" }))
    .toBeVisible();
  await expect.element(sankhya.getByText("Valor líquido")).toBeVisible();
  await expect
    .element(vrmaster.getByRole("cell", { name: "R$ 250,20" }))
    .toBeVisible();
  await expect.element(vrmaster.getByText("Valor total")).toBeVisible();
  await expect
    .element(screen.getByText("os valores não são somados", { exact: false }))
    .toBeVisible();
  expect(document.body.textContent).not.toContain("1.250,30");
});
test("an unavailable source is explained beside the other source's result", async () => {
  const screen = await render(
    <SalesAnswer
      answer={{
        selection: "all",
        sections: [
          {
            source: "sankhya",
            status: "unavailable",
            reason: "provider_unavailable",
            result: null,
          },
          {
            source: "vrmaster",
            status: "answered",
            reason: null,
            result: total("3", "EMBALAGEM:4"),
          },
        ],
      }}
    />,
  );
  await expect
    .element(
      screen
        .getByRole("group", { name: "Fonte: MNS (Sankhya)" })
        .getByText("Não consegui consultar esta fonte agora", { exact: false }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("cell", { name: "3 (tipo de embalagem 4)" }))
    .toBeVisible();
});
