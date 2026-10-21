import type { SourceSelection } from "../sales/sources.js";

/**
 * Channel commands. They start with "/" so ordinary questions are never
 * taken as commands; the sales source, like the web selector, is changed
 * only by an explicit choice and never inferred from a question.
 */
export type Command =
  | { kind: "new_conversation" }
  | { kind: "source"; source: SourceSelection | null }
  | { kind: "help" }
  | { kind: "unknown" };

const sources: Record<string, SourceSelection> = {
  sankhya: "sankhya",
  mns: "sankhya",
  vrmaster: "vrmaster",
  "vr-master": "vrmaster",
  vr: "vrmaster",
  pilar: "vrmaster",
  tudo: "all",
  todas: "all",
  ambas: "all",
};

export const sourceNames: Record<SourceSelection, string> = {
  sankhya: "MNS (Sankhya)",
  vrmaster: "Pilar da Terra (VR Master)",
  all: "Tudo (cada fonte separadamente)",
};

export function parseCommand(text: string): Command | null {
  if (!text.startsWith("/")) return null;
  const [name, ...rest] = text
    .slice(1)
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/\s+/);
  if (["nova", "novo", "nova-conversa"].includes(name))
    return { kind: "new_conversation" };
  if (name === "fonte")
    return { kind: "source", source: sources[rest.join("-")] ?? null };
  if (["ajuda", "help", "comandos"].includes(name)) return { kind: "help" };
  return { kind: "unknown" };
}

export function helpText(source: SourceSelection): string {
  return [
    "Converse comigo como no IA-MNS: pergunte, por exemplo, *quanto vendemos ontem?*",
    "",
    `Fonte de vendas atual: *${sourceNames[source]}*.`,
    "",
    "Comandos:",
    "• */fonte sankhya*, */fonte vrmaster* ou */fonte tudo*: escolhe a fonte das consultas de vendas.",
    "• */nova*: começa uma nova conversa.",
    "• */ajuda*: mostra esta mensagem.",
    "",
    "As conversas daqui também aparecem no IA-MNS na web.",
  ].join("\n");
}
