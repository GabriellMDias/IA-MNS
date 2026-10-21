// Local WhatsApp simulator for development, without Meta or a real number.
//
//   pnpm whatsapp:local setup    adds synthetic WhatsApp settings to the
//                                ignored root .env.local (never overwrites)
//   pnpm whatsapp:local graph    runs a loopback Graph API that prints the
//                                replies IA-MNS would send
//   pnpm whatsapp:local send --from +5511987654321 "Quanto vendemos ontem?"
//                                signs a webhook like Meta and posts it to the
//                                local API
//
// The sender must be the WhatsApp number an owner linked to a Person in
// Administração → Pessoas; any other number is ignored, exactly as in
// production. Synthetic secrets are generated locally and never printed.
// Real Meta credentials and numbers are human actions (PH-32 to PH-34).
import { createHmac, randomBytes } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";

const root = resolve(import.meta.dirname, "../../..");
const envFile = resolve(root, ".env.local");
const graphPort = 9311;
const phoneNumberId = "100000000000001";

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    from: { type: "string" },
    "user-id": { type: "string" },
    api: { type: "string", default: "http://127.0.0.1:3000" },
  },
});
const [command, ...words] = positionals;

async function readLocal(): Promise<string> {
  const stat = await lstat(envFile).catch(() => undefined);
  if (stat && (stat.isSymbolicLink() || !stat.isFile()))
    throw new Error(`Unsafe local file: ${envFile}`);
  return stat ? readFile(envFile, "utf8") : "";
}

async function setup() {
  const content = await readLocal();
  const existing = parseEnv(content);
  const desired: Record<string, string> = {
    IA_MNS_WHATSAPP_CHANNEL: "enabled",
    WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_ACCESS_TOKEN: `EAAlocal${randomBytes(24).toString("hex")}`,
    WHATSAPP_APP_SECRET: randomBytes(16).toString("hex"),
    WHATSAPP_VERIFY_TOKEN: randomBytes(24).toString("base64url"),
    WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${graphPort}`,
  };
  const added = Object.entries(desired).filter(
    ([name]) => existing[name] === undefined,
  );
  if (!added.length) {
    console.log("WhatsApp simulator settings already present in .env.local.");
    return;
  }
  await writeFile(
    envFile,
    `${content}${content && !content.endsWith("\n") ? "\n" : ""}# Local WhatsApp simulator (pnpm whatsapp:local)\n${added
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    `Added ${added.map(([name]) => name).join(", ")} to .env.local. Restart the API; IA-MNS identity and the database must be configured.`,
  );
}

function graph() {
  let next = 0;
  createServer((request, response) => {
    void (async () => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const payload = JSON.parse(body || "{}") as {
        status?: string;
        to?: string;
        recipient?: string;
        text?: { body?: string };
      };
      response.writeHead(200, { "content-type": "application/json" });
      if (payload.status === "read") {
        console.log("· mensagem marcada como lida (digitando…)");
        return response.end(JSON.stringify({ success: true }));
      }
      next += 1;
      console.log(
        `\n→ para ${payload.to ?? payload.recipient}:\n${payload.text?.body ?? ""}\n`,
      );
      response.end(
        JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: `wamid.local.${next}` }],
        }),
      );
    })();
  }).listen(graphPort, "127.0.0.1", () =>
    console.log(
      `Simulated Graph API on http://127.0.0.1:${graphPort}; replies appear here.`,
    ),
  );
}

async function send() {
  const env = parseEnv(await readLocal());
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret || env.WHATSAPP_PHONE_NUMBER_ID !== phoneNumberId)
    throw new Error("Run `pnpm whatsapp:local setup` first.");
  const api = new URL(options.api);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(api.hostname))
    throw new Error("The simulator only posts to a loopback API.");
  const from = options.from?.replace(/\D/g, "");
  const text = words.join(" ").trim();
  if ((!from && !options["user-id"]) || !text)
    throw new Error(
      'Usage: pnpm whatsapp:local send --from +5511987654321 "pergunta"',
    );
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "200000000000002",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5511900000000",
                phone_number_id: phoneNumberId,
              },
              messages: [
                {
                  ...(from ? { from } : {}),
                  ...(options["user-id"]
                    ? { from_user_id: options["user-id"] }
                    : {}),
                  id: `wamid.local.in.${randomBytes(8).toString("hex")}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const response = await fetch(new URL("/whatsapp/webhook", api), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
    body,
  });
  console.log(
    `Webhook answered ${response.status}. Unlinked numbers are ignored silently; the reply appears in the simulated Graph API.`,
  );
}

if (command === "setup") await setup();
else if (command === "graph") graph();
else if (command === "send") await send();
else
  throw new Error(
    "Usage: pnpm whatsapp:local setup | graph | send --from <number> <text>",
  );
