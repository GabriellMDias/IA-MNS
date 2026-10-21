import type { SourceSelection } from "../sales/sources.js";
import type { CorporateAgent, AgentActor } from "./application.js";
import type { TurnView } from "./contracts.js";
import { agentFailureCode, type FailureLogger } from "./failures.js";
import type { AgentChannel } from "./prisma-repository.js";
import { canReadReply } from "./evidence.js";
import { AgentFailure } from "./errors.js";

/**
 * The agent as another channel sees it: the conversation a channel message
 * continues and one awaited turn. It is the same agent instance, so turns
 * share the web's concurrency limit, lifecycle, permissions checks, history
 * and context; the channel is conversation metadata only.
 */
export function agentChannel(
  agent: CorporateAgent,
  channel: Exclude<AgentChannel, "web">,
  log: FailureLogger & { info(object: object, message: string): void },
) {
  return {
    canReadTurn: async (
      actor: AgentActor,
      conversationId: string,
      turnId: string,
    ): Promise<boolean> => {
      try {
        const turn = await agent.repository.turn(
          actor.id,
          conversationId,
          turnId,
        );
        return (
          turn.state === "completed" &&
          turn.reply !== null &&
          canReadReply(
            turn.reply,
            actor.permissions,
            agent.capabilities,
            actor.scopes,
          )
        );
      } catch (error) {
        if (
          error instanceof AgentFailure &&
          error.code === "AGENT_CONVERSATION_NOT_FOUND"
        )
          return false;
        throw error;
      }
    },
    conversation: (
      owner: string,
      preferred: string | null,
      activeSince: Date,
    ) =>
      agent.repository.channelConversation(
        owner,
        channel,
        preferred,
        activeSince,
      ),
    ask: (
      actor: AgentActor,
      conversationId: string,
      requestId: string,
      question: string,
      source: SourceSelection,
      signal: AbortSignal,
    ): Promise<TurnView> =>
      agent.ask(
        actor,
        conversationId,
        requestId,
        question,
        source,
        (error, turnId) => agentFailureCode(error, log, turnId),
        signal,
        // Allowlisted metadata only, as on the web.
        (trace, turnId) => log.info({ turnId, ai: trace }, "ai_turn_traced"),
      ),
  };
}
