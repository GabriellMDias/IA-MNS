import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  ProductAnswer,
  ProductOptions,
} from "../src/features/products/results.js";
import "../src/features/products/products.css";
import type {
  ProductAnswer as ProductAnswerData,
  ProductOptions as ProductOptionsData,
} from "../src/features/products/api.js";

// Synthetic, fictional catalog values only.
const answer: ProductAnswerData = {
  kind: "products",
  source: "vrmaster",
  catalogVersion: "example/2026-10-11.1",
  total: 3,
  products: [
    {
      code: "101",
      description: "FRUTA EXEMPLO A KG",
      classification: "HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › A",
    },
    {
      code: "102",
      description: "FRUTA EXEMPLO B KG",
      classification: "HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › B",
    },
  ],
  criteria: [
    {
      dimension: "category",
      title: "classificação mercadológica",
      mode: "include",
      text: "fruta exemplo",
      values: ["HORTIFRUTI › FRUTAS › FRUTA EXEMPLO"],
      excluded: ["HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › DESIDRATADA"],
      interpretation: "Produtos classificados nos níveis escolhidos.",
    },
    {
      dimension: "weighable",
      title: "pesável",
      mode: "exclude",
      text: "pesáveis",
      values: [],
      excluded: [],
      interpretation: "Indicador do cadastro.",
    },
  ],
  sections: [{ label: "HORTIFRUTI", count: 3 }],
  notes: ["A lista inclui produtos ativos e inativos."],
};

test("a product answer shows how each criterion was understood and states a partial list", async () => {
  const screen = await render(<ProductAnswer answer={answer} />);
  await expect
    .element(
      screen.getByRole("group", { name: "Fonte: Pilar da Terra (VR Master)" }),
    )
    .toBeVisible();
  await expect
    .element(screen.getByText("classificação mercadológica: “fruta exemplo”"))
    .toBeVisible();
  await expect
    .element(
      screen.getByText("HORTIFRUTI › FRUTAS › FRUTA EXEMPLO › DESIDRATADA"),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Excluir pesável")).toBeVisible();
  await expect
    .element(screen.getByText("Primeiros 2 de 3 produtos, em ordem alfabética"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("cell", { name: "FRUTA EXEMPLO B KG" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("columnheader", { name: "Classificação" }))
    .toBeVisible();
});

test("a Sankhya product answer identifies its ERP source", async () => {
  const screen = await render(
    <ProductAnswer answer={{ ...answer, source: "sankhya" }} />,
  );
  await expect
    .element(screen.getByRole("group", { name: "Fonte: MNS (Sankhya)" }))
    .toBeVisible();
});

test("an empty product answer keeps the interpretation without a table", async () => {
  const screen = await render(
    <ProductAnswer
      answer={{ ...answer, total: 0, products: [], sections: [] }}
    />,
  );
  await expect.element(screen.getByRole("table")).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Produtos classificados nos níveis escolhidos."))
    .toBeVisible();
});

const options: ProductOptionsData = {
  kind: "product_options",
  source: "vrmaster",
  title: "comprador",
  text: "Costa",
  options: [
    { number: 1, label: "BRUNA COSTA" },
    { number: 2, label: "BRUNO COSTA" },
  ],
};

test("current options send the chosen number", async () => {
  const choose = vi.fn();
  const screen = await render(
    <ProductOptions options={options} onChoose={choose} />,
  );
  await screen.getByRole("button", { name: "2. BRUNO COSTA" }).click();
  expect(choose).toHaveBeenCalledWith(2);
});

test("options of earlier turns are text only", async () => {
  const historical = await render(<ProductOptions options={options} />);
  await expect.element(historical.getByText("1. BRUNA COSTA")).toBeVisible();
  await expect.element(historical.getByRole("button")).not.toBeInTheDocument();
});
