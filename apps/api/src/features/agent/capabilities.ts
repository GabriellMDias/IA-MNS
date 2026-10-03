export type ProgressStage =
  "thinking" | "interpreting_sales" | "querying_sales" | "organizing";
export type AgentReply = {
  kind: "conversation" | "answer" | "clarification" | "unavailable";
  message: string;
  capabilityId: string | null;
  result: unknown;
  suggestions: string[];
};
export type CapabilityInput = {
  message: string;
  history: readonly { question: string; reply: AgentReply }[];
  context: unknown;
  signal: AbortSignal;
  progress: (stage: ProgressStage) => Promise<void>;
};
/** Implemented capabilities only. Descriptions never grant execution authority. */
export interface AgentCapability {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly examples: readonly string[];
  readonly permission: string;
  execute(
    this: void,
    input: CapabilityInput,
  ): Promise<{ reply: AgentReply; context: unknown }>;
  close(this: void): Promise<void>;
}
export const progressMessages: Readonly<Record<ProgressStage, string>> = {
  thinking: "Entendendo sua mensagem…",
  interpreting_sales: "Preparando a consulta…",
  querying_sales: "Consultando as vendas…",
  organizing: "Organizando os resultados…",
};
