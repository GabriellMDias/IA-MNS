import { execFileSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";

/** Same repository scope as the portal: tracked and non-ignored new documents. */
export async function markdownFiles(root: string): Promise<string[]> {
  const names = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  ).split("\0");
  const files: string[] = [];
  for (const name of new Set(names.filter((name) => name.endsWith(".md")))) {
    const absolute = path.join(root, name);
    try {
      // Git can retain paths below a directory replaced by a symlink/junction.
      // Match the portal's guard before reading any document outside Git.
      for (
        let parent = name;
        parent !== ".";
        parent = path.posix.dirname(parent)
      ) {
        if ((await lstat(path.join(root, parent))).isSymbolicLink())
          throw new Error(`Symlink is not a documentation input: ${name}`);
      }
      if ((await lstat(absolute)).isFile()) files.push(absolute);
    } catch (error) {
      // A tracked deletion is no longer an input; inbound links still fail.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files.sort();
}
