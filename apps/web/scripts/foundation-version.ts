import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readFoundationVersion(root: string): {
  label: string;
  commit: string | null;
} {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(root, ".orion/project.json"), "utf8"),
    );
    if (!manifest || typeof manifest !== "object" || !("kind" in manifest))
      return { label: "Version unavailable", commit: null };
    if (manifest.kind === "project") {
      const foundation = "foundation" in manifest ? manifest.foundation : null;
      const baseline =
        foundation &&
        typeof foundation === "object" &&
        "baselineCommit" in foundation
          ? foundation.baselineCommit
          : null;
      if (typeof baseline !== "string" || !/^[a-f0-9]{40}$/.test(baseline))
        return { label: "Version unavailable", commit: null };
      // Project release tags describe the product, not its Orion baseline.
      return { label: `Baseline ${baseline.slice(0, 7)}`, commit: baseline };
    }
    if (manifest.kind !== "foundation")
      return { label: "Version unavailable", commit: null };
    const commit = git("rev-parse", "HEAD");
    const tag = git("tag", "--merged", commit, "--sort=-version:refname")
      .split("\n")
      .find((name) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(name));
    if (!tag) return { label: `${commit.slice(0, 7)} · unreleased`, commit };
    const released =
      git("rev-parse", `${tag}^{}`) === commit &&
      git("status", "--porcelain", "--untracked-files=normal") === "";
    return { label: released ? tag : `${tag} · unreleased`, commit };
  } catch {
    // Source archives can be built without Git history or release tags.
    return { label: "Version unavailable", commit: null };
  }
}
