import {
  permissionDeniedMessage,
  type MissingPermission,
} from "../../access.js";
import {
  selectionLabels,
  sourceCatalog,
  sourcesOf,
  type SourceSelection,
} from "../sales/sources.js";
import type { AgentCapability, AgentReply } from "./capabilities.js";

/**
 * Whether the person may use a capability with the selected source: the
 * capability permission, and the permission of at least one selected source
 * when the capability declares permissions per source.
 */
export function usableCapability(
  capability: AgentCapability,
  permissions: ReadonlySet<string>,
  source: SourceSelection,
): boolean {
  if (!permissions.has(capability.permission)) return false;
  const bySource = capability.sourcePermissions;
  if (!bySource) return true;
  return sourcesOf(source).some((item) => {
    const info = bySource[item];
    return !info || permissions.has(info.permission);
  });
}

/** The identified permissions the person would need for this selection. */
export function missingPermissions(
  capability: AgentCapability,
  permissions: ReadonlySet<string>,
  source: SourceSelection,
): MissingPermission[] {
  const bySource = capability.sourcePermissions;
  if (!bySource) return [];
  return sourcesOf(source).flatMap((item) => {
    const info = bySource[item];
    return info && !permissions.has(info.permission) ? [{ info }] : [];
  });
}

/**
 * The server-authored reply to a request for a capability the person may not
 * use here. It carries no business data, so any reader of the conversation
 * may read it again.
 */
export function deniedReply(
  capability: AgentCapability,
  permissions: ReadonlySet<string>,
  source: SourceSelection,
): AgentReply {
  const sources = sourcesOf(source);
  const where =
    source === "all"
      ? `nas fontes ${sources.map((item) => sourceCatalog[item].label).join(" e ")}`
      : `na fonte ${selectionLabels[source]}`;
  const subject = `usar ${capability.title.toLocaleLowerCase("pt-BR")} ${where}`;
  const missing = missingPermissions(capability, permissions, source);
  return {
    kind: "unavailable",
    capabilityId: null,
    message: missing.length
      ? permissionDeniedMessage(subject, missing)
      : `Você não tem permissão para ${subject}. Se precisar desse acesso, entre em contato com o suporte.`,
    result: null,
    suggestions: [],
  };
}
