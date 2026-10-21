import { expect, test } from "vitest";
import { parseAdminSearch } from "../src/features/identity/admin-search.js";

const personId = "11111111-1111-4111-8111-111111111111";

test("person selection, search and an opaque page cursor round-trip without unrelated input", () => {
  expect(
    parseAdminSearch({
      pessoa: personId,
      busca: "Example Person",
      cursor: "opaque-page",
      accessToken: "synthetic-not-a-credential",
    }),
  ).toEqual({
    pessoa: personId,
    busca: "Example Person",
    cursor: "opaque-page",
  });
});

test("administration sections clear people-only navigation", () => {
  for (const secao of ["seguranca", "parametros"]) {
    expect(
      parseAdminSearch({
        secao,
        pessoa: personId,
        busca: "Example",
        cursor: "page",
        novo: true,
      }),
    ).toEqual({ secao });
  }
});

test("malformed route values cannot become a person selection or creation mode", () => {
  expect(
    parseAdminSearch({
      pessoa: "../../invalid",
      busca: ["name"],
      cursor: {},
      novo: "true",
      secao: "unknown",
    }),
  ).toEqual({});
  expect(parseAdminSearch({ novo: true })).toEqual({ novo: true });
});

test("search and cursor lengths match the existing list API bounds", () => {
  expect(
    parseAdminSearch({ busca: "a".repeat(200), cursor: "b".repeat(600) }),
  ).toEqual({ busca: "a".repeat(120), cursor: "b".repeat(500) });
});

test("the groups section keeps only a well-formed group selection", () => {
  expect(
    parseAdminSearch({ secao: "grupos", grupo: personId, pessoa: personId }),
  ).toEqual({ secao: "grupos", grupo: personId });
  expect(parseAdminSearch({ secao: "grupos", grupo: "../x" })).toEqual({
    secao: "grupos",
  });
});
