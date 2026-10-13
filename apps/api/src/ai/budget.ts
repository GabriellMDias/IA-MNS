import { AsyncLocalStorage } from "node:async_hooks";
import { ModelFailure, type ModelInvocation } from "./model.js";

type Budget = {
  calls: number;
  tokens: number;
  reserved: number;
  maximumCalls: number;
  maximumTokens: number;
};
const budgets = new AsyncLocalStorage<Budget>();

/** Includes nested domain interpreters; every model adapter participates. */
export function withModelBudget<T>(
  work: () => Promise<T>,
  maximumCalls = 10,
  maximumTokens = 120000,
): Promise<T> {
  return budgets.run(
    { calls: 0, tokens: 0, reserved: 0, maximumCalls, maximumTokens },
    work,
  );
}
export function reserveModelCall(reservedTokens = 0) {
  const budget = budgets.getStore();
  if (!budget) return;
  if (
    !Number.isSafeInteger(reservedTokens) ||
    reservedTokens < 0 ||
    budget.calls >= budget.maximumCalls ||
    budget.tokens >= budget.maximumTokens ||
    budget.reserved + reservedTokens > budget.maximumTokens
  )
    throw new ModelFailure("budget");
  budget.calls++;
  budget.reserved += reservedTokens;
}
export function recordModelUsage(invocation: ModelInvocation) {
  const budget = budgets.getStore();
  if (!budget) return;
  budget.tokens +=
    (invocation.inputTokens ?? 0) + (invocation.outputTokens ?? 0);
  if (budget.tokens > budget.maximumTokens) throw new ModelFailure("budget");
}
