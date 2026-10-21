import type { TurnView } from "../agent/contracts.js";
import type { DataScope } from "../../access.js";
import type { SourceSelection } from "../sales/sources.js";
import type {
  WhatsappAuthorization,
  WhatsappSender,
} from "../identity/service.js";

export type { WhatsappAuthorization, WhatsappSender };

/**
 * What the channel needs from identity: the authorization decision for a
 * signature-verified sender, made from trusted state on every call, and the
 * record of what an accepted message proved about the link.
 */
export interface WhatsappIdentity {
  authorize(sender: WhatsappSender): Promise<WhatsappAuthorization>;
  confirm(
    authorization: Extract<WhatsappAuthorization, { authorized: true }>,
  ): Promise<void>;
}

/**
 * What the channel needs from the corporate agent: the conversation a
 * message continues, and one turn submitted and awaited with the permissions
 * identity just computed. The agent applies its own permission checks,
 * capabilities, history and context exactly as on the web.
 */
export interface WhatsappAgent {
  conversation(
    owner: string,
    preferred: string | null,
    activeSince: Date,
  ): Promise<{ id: string; created: boolean }>;
  ask(
    actor: {
      id: string;
      permissions: ReadonlySet<string>;
      scopes: ReadonlyMap<string, DataScope>;
    },
    conversationId: string,
    requestId: string,
    question: string,
    source: SourceSelection,
    signal: AbortSignal,
  ): Promise<TurnView>;
}
