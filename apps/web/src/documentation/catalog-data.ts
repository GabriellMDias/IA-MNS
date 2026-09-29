import manifestSource from "../generated/manifest.json";
import type { Kind, Manifest } from "./types.js";
export function folderLabel(value: string): string {
  const labels: Record<string, string> = {
    docs: "Project knowledge",
    apps: "Applications",
    packages: "Packages",
    adr: "Decisions (ADRs)",
    api: "API",
    generated: "Generated references",
  };
  return (
    labels[value] ??
    value
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}
export const manifest = manifestSource as Manifest;
export const byId = new Map(manifest.entries.map((entry) => [entry.id, entry]));
export const labels: Record<Kind, string> = {
  api: "API reference",
  database: "Data dictionary",
  component: "Components",
  repository: "Repository docs",
};
export const sections = [
  {
    id: "api",
    kind: "api",
    title: "API reference",
    summary: "Inspect contracts, understand responses, and try a request.",
    symbol: "↗",
  },
  {
    id: "database",
    kind: "database",
    title: "Data dictionary",
    summary: "Explore tables, data meaning, ownership, and constraints.",
    symbol: "▤",
  },
  {
    id: "components",
    kind: "component",
    title: "Components",
    summary: "Discover component APIs and try live, local examples.",
    symbol: "◫",
  },
  {
    id: "repository",
    kind: "repository",
    title: "Repository documentation",
    summary: "Read guides, architecture, decisions, and project policies.",
    symbol: "≡",
  },
] as const;
