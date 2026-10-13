import type { TraceRecorder } from "../../ai/trace.js";
import type { TSchema } from "typebox";
import type { SourceSelection } from "../sales/sources.js";
export type ProgressStage =
  | "thinking"
  | "interpreting_sales"
  | "querying_sales"
  | "interpreting_products"
  | "querying_products"
  | "organizing";
export type AgentReply = {
  kind: "conversation" | "answer" | "clarification" | "unavailable";
  message: string;
  capabilityId: string | null;
  result: unknown;
  suggestions: string[];
  /** Server-authored dependencies of all evidence used to compose this reply. */
  requiredPermissions?: string[];
  /** Preserve evidence in history without repeating its result card. */
  displayResult?: boolean;
  evidenceRefs?: string[];
  attachmentRefs?: string[];
  evidenceSnapshots?: {
    id: string;
    capabilityId: string | null;
    requiredPermissions: string[];
    result: unknown;
  }[];
};
export type CapabilityInput = {
  /** Stable owner supplied only by the authenticated agent. */
  actorId?: string;
  message: string;
  history: readonly { question: string; reply: AgentReply }[];
  context: unknown;
  /** Trusted, actor-owned contexts; a dependency still requires its permission. */
  contexts?: Readonly<Record<string, unknown>>;
  permissions?: ReadonlySet<string>;
  signal: AbortSignal;
  progress: (stage: ProgressStage) => Promise<void>;
  trace: TraceRecorder;
  /** The data source the person selected in the interface for this turn. */
  source: SourceSelection;
  /** Observes a failure the reply reports instead of failing the turn. */
  report?: (error: unknown) => void;
};
export type AgentActor = { id: string; permissions: ReadonlySet<string> };
export type AgentExchange = {
  id?: string;
  sequence?: number;
  source?: SourceSelection;
  finishedAt?: string | null;
  question: string;
  reply: AgentReply;
};
export type AgentTurnInput = Readonly<{
  actor: AgentActor;
  message: string;
  history: readonly AgentExchange[];
  contexts: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  progress: (stage: ProgressStage) => Promise<void>;
  trace: TraceRecorder;
  source: SourceSelection;
  report?: (error: unknown) => void;
  recall?: (beforeSequence: number) => Promise<readonly AgentExchange[]>;
}>;
export type CapabilityOutcome = {
  reply: AgentReply;
  context: unknown;
  /**
   * Bounded names of what the capability asked the user for (for example
   * "period"); routing offers the next message to it while it waits.
   */
  awaiting?: readonly string[] | null;
};
export type AgentTool = Readonly<{
  name: string;
  description: string;
  parameters: TSchema;
  execute: (
    args: unknown,
    input: CapabilityInput,
  ) => Promise<CapabilityOutcome>;
}>;
/** Implemented capabilities only. Descriptions never grant execution authority. */
export interface AgentCapability {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly examples: readonly string[];
  readonly permission: string;
  readonly tools?: readonly AgentTool[];
  /** False keeps tool-planned capabilities readable but out of legacy routing. */
  readonly legacyRouting?: boolean;
  /** Additional authorization for a composed capability's protected results. */
  canRead?(
    this: void,
    reply: AgentReply,
    permissions: ReadonlySet<string>,
  ): boolean;
  execute(this: void, input: CapabilityInput): Promise<CapabilityOutcome>;
  close(this: void): Promise<void>;
}
export const progressMessages: Readonly<Record<ProgressStage, string>> = {
  thinking: "Entendendo sua mensagem…",
  interpreting_sales: "Preparando a consulta…",
  querying_sales: "Consultando as vendas…",
  interpreting_products: "Interpretando o pedido de produtos…",
  querying_products: "Consultando o cadastro de produtos…",
  organizing: "Organizando os resultados…",
};
