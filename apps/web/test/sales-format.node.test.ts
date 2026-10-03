import { expect, it } from "vitest";
import { formatSalesDecimal } from "../src/features/sales/format.js";
it("formats exact cents, carry and signs without Number rounding", () => {
  expect(formatSalesDecimal("9999999999999999.99", 2, true)).toBe(
    "9.999.999.999.999.999,99",
  );
  expect(formatSalesDecimal("9.999", 2, true)).toBe("10,00");
  expect(formatSalesDecimal("-0.005", 2, true)).toBe("-0,01");
  expect(formatSalesDecimal("0.300000000", 9)).toBe("0,3");
});
