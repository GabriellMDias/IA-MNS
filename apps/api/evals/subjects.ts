import type { StructuredModel } from "../src/ai/model.js";
import {
  agentRouterVersion,
  createAgentPlanner,
} from "../src/features/agent/planner.js";
import {
  createModelInterpreter,
  salesInterpreterVersion,
} from "../src/features/sales/interpreter.js";
import { interpretation, salesRoute } from "./fixtures.js";
import type { EvalSubject } from "./harness.js";

/**
 * Replays each turn's reference fixtures through the real pipeline. It checks
 * everything deterministic around the model: routing rules, state, merging,
 * grounding, period resolution and compilation.
 */
export const scriptedSubject: EvalSubject = {
  id: "scripted",
  metadata: { router: "fixture", interpreter: "fixture" },
  applicable: (evalCase) =>
    evalCase.turns.every(
      (turn) =>
        turn.fixture?.interpretation !== undefined ||
        (turn.fixture?.route !== undefined &&
          turn.fixture.route.intent !== "capability"),
    )
      ? null
      : "missing fixtures",
  interpreter: (script) => ({
    interpret: () => {
      const fixture = script.turn().fixture?.interpretation;
      if (!fixture) throw new Error("No scripted interpretation for this turn");
      return Promise.resolve(interpretation(fixture));
    },
  }),
  router: (_capabilities, script) => ({
    route: () => Promise.resolve(script.turn().fixture?.route ?? salesRoute),
  }),
};

/** The production router and interpreter on a structured model. */
export function modelSubject(model: StructuredModel): EvalSubject {
  return {
    id: `${model.provider}:${model.model}`,
    metadata: {
      provider: model.provider,
      model: model.model,
      router: agentRouterVersion,
      interpreter: salesInterpreterVersion,
    },
    applicable: () => null,
    interpreter: () => createModelInterpreter(model),
    router: (capabilities) => createAgentPlanner(model, capabilities),
  };
}
