// Writes new IA-MNS identity keys to a new file readable only by its owner,
// for the deployment's secret store. Never prints key material and never
// overwrites a file: rotating keys is a deliberate operator decision.
import { writeFile } from "node:fs/promises";
import { generateIdentityKeys } from "../identity-keys.js";

const [flag, output, ...rest] = process.argv.slice(2);
if (flag !== "--output" || !output || rest.length) {
  process.stderr.write("Usage: identity-keys --output <new file>\n");
  process.exit(2);
}
try {
  const keys = generateIdentityKeys();
  await writeFile(
    output,
    Object.entries(keys)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
    { mode: 0o600, flag: "wx" },
  );
  process.stdout.write(
    `Identity keys written (${Object.keys(keys).join(", ")}); no key material displayed.\n`,
  );
} catch (error) {
  process.stderr.write(
    (error as NodeJS.ErrnoException).code === "EEXIST"
      ? "The output file already exists; nothing was written.\n"
      : "Identity keys could not be written; nothing was displayed.\n",
  );
  process.exitCode = 1;
}
