import { defineErrors } from "../../errors.js";

export const productErrors = defineErrors({
  PRODUCTS_PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "The product catalog is unavailable. Try again later.",
    category: "availability",
    retryable: true,
  },
});

export class ProductFailure extends Error {
  readonly code: keyof typeof productErrors;
  readonly boundary: Readonly<
    // Fixed adapter identifiers, never input.
    | { provider: string; stage: "interpretation" | "selection" }
    | {
        provider: "postgresql" | "oracle";
        stage: "connection" | "catalog" | "query" | "cleanup";
      }
  >;
  constructor(
    code: keyof typeof productErrors,
    boundary: ProductFailure["boundary"],
    cause?: unknown,
  ) {
    super(code, { cause });
    this.code = code;
    this.boundary = boundary;
  }
}
