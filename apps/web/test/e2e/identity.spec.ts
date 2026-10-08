import { test, expect, type Page, type Frame } from "@playwright/test";
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  freePort,
  startApi,
  startDatabase,
  startWeb,
  stopAll,
  type Stoppable,
} from "./stack.ts";

// Identity journeys on the real stack: migrated PostgreSQL, the emitted API, the
// web application, and a synthetic PDT Connect installation implementing the
// identity contract v1 (codes, PKCE, client authentication, identity, revoke).
const run = promisify(execFile);
const apiRoot = resolve(import.meta.dirname, "../../../api");
const pdtSubject = "37c261ad-a457-49c5-b578-456a1cc127d3";
const password = "uma frase de acesso segura";
let web = "";
let pdt = "";
let hostile = "";
let identityEnv: Record<string, string> = {};
const stacks: Stoppable[] = [];

function base32Decode(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const char of value) {
    current = (current << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secret: string, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const index = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(index) & 0x7fffffff) % 1_000_000).padStart(
    6,
    "0",
  );
}

function listen(server: Server, port: number): Promise<Stoppable> {
  return new Promise((ready) =>
    server.listen(port, "127.0.0.1", () =>
      ready({
        stop: () => new Promise<void>((done) => server.close(() => done())),
      }),
    ),
  );
}

/** Synthetic PDT: JSON contract endpoints, an auto-approving authorize page and an embedding host page. */
function pdtServer(clientSecret: string, redirectUri: string) {
  const codes = new Map<string, string>();
  const tokens = new Set<string>();
  const json = (
    response: import("node:http").ServerResponse,
    status: number,
    body: unknown,
  ) => {
    response.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(body));
  };
  const issue = (challenge: string, state: string) => {
    const code = randomBytes(32).toString("base64url");
    codes.set(code, challenge);
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    callback.searchParams.set("iss", pdt);
    return callback.toString();
  };
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", pdt);
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const clientOk =
        request.headers["x-pdt-client-id"] === "ia-mns" &&
        request.headers["x-pdt-client-secret"] === clientSecret;
      if (url.pathname === "/integrations/authorize") {
        // The real PDT shows its login and "Continuar"; this synthetic user is already signed in.
        response.writeHead(302, {
          location: issue(
            url.searchParams.get("code_challenge")!,
            url.searchParams.get("state")!,
          ),
        });
        return response.end();
      }
      if (
        url.pathname === "/api/auth/integrations/authorize" &&
        request.method === "POST"
      ) {
        if (request.headers.authorization !== "Bearer synthetic-pdt-session")
          return json(response, 401, {});
        const input = JSON.parse(body) as {
          client_id: string;
          redirect_uri: string;
          state: string;
          code_challenge: string;
        };
        if (input.client_id !== "ia-mns" || input.redirect_uri !== redirectUri)
          return json(response, 400, {});
        return json(response, 200, {
          redirectUrl: issue(input.code_challenge, input.state),
        });
      }
      if (url.pathname === "/api/auth/integrations/token") {
        const input = JSON.parse(body) as {
          code: string;
          code_verifier: string;
        };
        const challenge = codes.get(input.code);
        codes.delete(input.code);
        if (
          !clientOk ||
          !challenge ||
          createHash("sha256")
            .update(input.code_verifier)
            .digest("base64url") !== challenge
        )
          return json(response, 401, {});
        const token = randomBytes(32).toString("base64url");
        tokens.add(token);
        return json(response, 200, {
          accessToken: token,
          tokenType: "Bearer",
          expiresIn: 300,
          scope: "identity:read",
        });
      }
      const bearer = String(request.headers.authorization ?? "").slice(7);
      if (url.pathname === "/api/auth/integrations/identity") {
        if (!clientOk || !tokens.has(bearer)) return json(response, 401, {});
        return json(response, 200, {
          contractVersion: 1,
          issuer: pdt,
          subject: pdtSubject,
          audience: "ia-mns",
          authenticated: true,
          user: { id: 7, name: "Pessoa do PDT", activeStatus: true },
          authorization: { superAdmin: false, permissions: [] },
        });
      }
      if (url.pathname === "/api/auth/integrations/revoke") {
        tokens.delete(bearer);
        return json(response, clientOk ? 200 : 401, { revoked: true });
      }
      if (url.pathname === "/host") {
        // Minimal PDT host component: fixed IA-MNS origin, client and callback; PDT session from its own storage.
        response.writeHead(200, { "content-type": "text/html" });
        return response.end(`<!doctype html><title>PDT</title><iframe id="ia" title="IA-MNS" style="width:1200px;height:760px;border:0"></iframe>
<script>
localStorage.setItem("accessToken", "synthetic-pdt-session");
const frame = document.getElementById("ia");
const deny = new URLSearchParams(location.search).has("deny");
// Like the PDT screen: the initial theme in the embed URL, changes by message.
const theme = new URLSearchParams(location.search).get("theme");
frame.src = ${JSON.stringify(web)} + "/embed/pdt" + (theme ? "?theme=" + theme : "");
window.sendTheme = (value) => frame.contentWindow.postMessage({ v: 1, type: "ia-mns:host-theme", theme: value }, ${JSON.stringify(web)});
addEventListener("message", async (event) => {
  if (event.origin !== ${JSON.stringify(web)} || event.source !== frame.contentWindow) return;
  const d = event.data;
  if (!d || d.v !== 1 || d.type !== "ia-mns:auth-request" || d.provider !== "pdt") return;
  if (deny) return frame.contentWindow.postMessage({ v: 1, type: "ia-mns:auth-error", requestId: d.requestId, error: "pdt_login_required" }, ${JSON.stringify(web)});
  const r = await fetch("/api/auth/integrations/authorize", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("accessToken") },
    body: JSON.stringify({ client_id: "ia-mns", redirect_uri: ${JSON.stringify(redirectUri)}, state: d.state, code_challenge: d.code_challenge, code_challenge_method: "S256" }) });
  const u = new URL((await r.json()).redirectUrl);
  frame.contentWindow.postMessage({ v: 1, type: "ia-mns:auth-response", requestId: d.requestId, code: u.searchParams.get("code"), state: u.searchParams.get("state"), iss: u.searchParams.get("iss") }, ${JSON.stringify(web)});
});
</script>`);
      }
      json(response, 404, {});
    })();
  });
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const webPort = await freePort();
  const pdtPort = await freePort();
  const hostilePort = await freePort();
  web = `http://127.0.0.1:${webPort}`;
  pdt = `http://127.0.0.1:${pdtPort}`;
  hostile = `http://127.0.0.1:${hostilePort}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const redirectUri = `${web}/api/identity/pdt/callback`;
  stacks.push(await listen(pdtServer(clientSecret, redirectUri), pdtPort));
  stacks.push(
    await listen(
      createServer((request, response) => {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(
          `<!doctype html><iframe id="victim" title="victim" src="${web}${new URL(request.url ?? "/", hostile).searchParams.get("path") ?? "/"}"></iframe>`,
        );
      }),
      hostilePort,
    ),
  );
  const database = await startDatabase();
  stacks.push(database);
  identityEnv = {
    ORION_DATABASE_URL: database.runtimeUrl,
    IA_MNS_PUBLIC_ORIGIN: web,
    IA_MNS_IDENTITY_SIGNING_KEY: generateKeyPairSync("ec", {
      namedCurve: "P-256",
    })
      .privateKey.export({ type: "pkcs8", format: "der" })
      .toString("base64url"),
    IA_MNS_IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
    PDT_IDENTITY_BASE_URL: pdt,
    PDT_IDENTITY_ISSUER: pdt,
    PDT_IDENTITY_CLIENT_ID: "ia-mns",
    PDT_IDENTITY_CLIENT_SECRET: clientSecret,
    PDT_IDENTITY_REDIRECT_URI: redirectUri,
    PDT_EMBED_ORIGIN: pdt,
  };
  const api = await startApi({
    environment: "test",
    env: identityEnv,
    secrets: [clientSecret, database.runtimeUrl],
  });
  stacks.push(api);
  stacks.push(
    await startWeb({
      apiUrl: api.url,
      port: webPort,
      env: { ORION_WEB_EMBED_ANCESTORS: pdt },
    }),
  );
});
test.afterAll(async () => {
  await stopAll(stacks.reverse());
});

async function noCredentialStorage(page: Page | Frame) {
  const stored = await page.evaluate(() => {
    const read = (storage: Storage) =>
      Object.keys(storage).map((key) => `${key}=${storage.getItem(key)}`);
    try {
      return [...read(localStorage), ...read(sessionStorage)].join("\n");
    } catch {
      return "";
    }
  });
  expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]+\.|ia-mns-session/);
}

let totpSecret = "";

test("bootstrap creates the principal administrator with a mandatory second factor", async ({
  page,
}) => {
  const { stdout } = await run(
    process.execPath,
    ["--import", "tsx", "scripts/identity-bootstrap.ts"],
    {
      cwd: apiRoot,
      env: { ...process.env, ...identityEnv, ORION_ENV: "test" },
    },
  );
  const invitation = /http\S+#[A-Za-z0-9_-]+/.exec(stdout)![0];
  expect(new URL(invitation).pathname).toBe("/identidade/inicial");
  await page.goto(invitation);
  await expect(page).toHaveURL(`${web}/identidade/inicial`);
  await page.getByLabel("Nome").fill("Administradora MNS");
  await page.getByLabel("Usuário").fill("admin");
  await page.getByLabel("Senha (mínimo 12 caracteres)").fill(password);
  await page.getByLabel("Confirme a senha").fill(password);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page
    .getByRole("button", { name: "Configurar aplicativo autenticador" })
    .click();
  totpSecret = (await page.getByTestId("totp-secret").textContent())!;
  await page.getByLabel("Código de 6 dígitos").fill(totp(totpSecret));
  await page.getByRole("button", { name: "Ativar" }).click();
  await expect(
    page.getByRole("heading", { name: "Códigos de recuperação" }),
  ).toBeVisible();
  await expect(page.locator(".identity-codes li")).toHaveCount(10);
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();
  await expect(page).toHaveURL(`${web}/admin`);
  await expect(
    page.getByRole("button", { name: /Administradora MNS/ }),
  ).toBeVisible();
  await noCredentialStorage(page);
  // The invitation is single-use.
  await page.goto(invitation);
  await expect(page.getByRole("alert")).toContainText(
    "inválido, expirou ou já foi usado",
  );
});

test("embedded PDT Connect opens IA-MNS without a new login and keeps the session across reloads", async ({
  page,
  context,
}) => {
  await page.goto(`${pdt}/host?theme=dark`);
  const frame = page.frameLocator("iframe#ia");
  // First access creates the profile automatically: no registration step.
  await expect(frame.getByLabel("Sua mensagem")).toBeVisible();
  await expect(frame.getByText("Primeiro acesso")).toHaveCount(0);
  // The sidebar shows only the person; account entries live in its menu.
  await expect(
    frame.getByRole("button", { name: "Pessoa do PDT, menu da conta" }),
  ).toBeVisible();
  await expect(frame.getByRole("link", { name: "Minha conta" })).toHaveCount(0);
  const inner = page
    .frames()
    .find((item) => item.url().startsWith(`${web}/embed/pdt`))!;
  expect(new URL(inner.url()).pathname).toMatch(/^\/embed\/pdt\/?$/);
  await noCredentialStorage(inner);
  // The PDT theme: initial value in the embed URL, changes by message, never stored.
  const embeddedFrame = () =>
    page.frames().find((item) => item.url().startsWith(`${web}/embed/pdt`))!;
  const theme = () =>
    embeddedFrame().evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe("dark");
  await page.evaluate(() =>
    (window as unknown as { sendTheme(value: string): void }).sendTheme(
      "light",
    ),
  );
  await expect.poll(theme).toBe("light");
  await page.evaluate(() =>
    (window as unknown as { sendTheme(value: string): void }).sendTheme("neon"),
  );
  await page.waitForTimeout(300);
  expect(await theme()).toBe("light");
  // The host owns the theme: no IA-MNS theme control and nothing stored.
  await frame.getByRole("button", { name: /menu da conta$/ }).click();
  await expect(frame.getByRole("menuitem", { name: /^Tema/ })).toHaveCount(0);
  await expect(
    frame.getByRole("button", { name: /modo (claro|escuro)/ }),
  ).toHaveCount(0);
  expect(
    await embeddedFrame().evaluate(() => localStorage.getItem("ia-mns-theme")),
  ).toBeNull();
  await page.keyboard.press("Escape");
  // Reload: a silent new host proof, no provisioning question, no cookie for IA-MNS.
  await page.reload();
  await expect(
    page.frameLocator("iframe#ia").getByLabel("Sua mensagem"),
  ).toBeVisible();
  await expect(
    page.frameLocator("iframe#ia").getByText("Primeiro acesso"),
  ).toHaveCount(0);
  expect(
    (await context.cookies(web)).filter((cookie) =>
      cookie.name.startsWith("ia-mns-"),
    ),
  ).toEqual([]);
  // The account page stays inside the embedded surface.
  const embedded = page.frameLocator("iframe#ia");
  await embedded
    .getByRole("button", { name: "Pessoa do PDT, menu da conta" })
    .click();
  // Embedded sessions end with the host, so the menu offers no sign-out.
  await expect(embedded.getByRole("menuitem", { name: "Sair" })).toHaveCount(0);
  await embedded.getByRole("menuitem", { name: "Minha conta" }).click();
  await expect(
    page
      .frameLocator("iframe#ia")
      .getByRole("heading", { name: "Minha conta" }),
  ).toBeVisible();
  const account = page
    .frames()
    .find((item) => item.url().startsWith(`${web}/embed/pdt`))!;
  expect(new URL(account.url()).pathname).toBe("/embed/pdt/conta");
});

test("a host that refuses the proof gets one sign-in attempt and an explanation", async ({
  page,
}) => {
  let starts = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.endsWith("/identity/providers/pdt/start")
    )
      starts += 1;
  });
  await page.goto(`${pdt}/host?deny=1`);
  await expect(
    page
      .frameLocator("iframe#ia")
      .getByText("Entre no PDT Connect e abra o IA-MNS novamente."),
  ).toBeVisible();
  // A refused proof once restarted the handshake endlessly through a status refetch.
  await page.waitForTimeout(2_000);
  expect(starts).toBe(1);
});

test("direct PDT sign-in reaches the same Person, and local sign-in requires the second factor", async ({
  page,
  browser,
}) => {
  // Product screens require a signed-in person on the direct surface.
  await page.goto(`${web}/`);
  await expect(page).toHaveURL(`${web}/entrar`);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await page.screenshot({ path: "../../test-results/identity-sign-in.png" });
  // No public account creation on the sign-in screen.
  await expect(
    page.getByRole("button", { name: /criar|cadastr/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /criar|cadastr/i })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Entrar com PDT Connect" }).click();
  await expect(page).toHaveURL(`${web}/`);
  await expect(page.getByLabel("Sua mensagem")).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Aplicação" });
  await expect(sidebar.getByRole("link")).toHaveCount(0);
  await sidebar
    .getByRole("button", { name: "Pessoa do PDT, menu da conta" })
    .click();
  const menu = page.getByRole("menu", { name: "Menu da conta" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Minha conta",
    "Documentação",
    "Tema escuro",
    "Sair",
  ]);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.screenshot({
    path: "../../test-results/identity-account-menu.png",
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await sidebar
    .getByRole("button", { name: "Pessoa do PDT, menu da conta" })
    .click();
  await menu.getByRole("menuitem", { name: "Minha conta" }).click();
  // Each embedded handshake (first load and reload) is its own short session of the same Person.
  await expect(page.getByText(/Dentro do PDT Connect/)).toHaveCount(2);
  await expect(page.getByText("Endereço do IA-MNS")).toBeVisible();
  await expect(page.getByText("PDT Connect · Pessoa do PDT")).toBeVisible();
  // The session survives a reload through the rotating HttpOnly cookie only.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Minha conta" }),
  ).toBeVisible();
  await noCredentialStorage(page);

  const other = await browser.newContext();
  const admin = await other.newPage();
  await admin.goto(`${web}/entrar`);
  await admin.getByLabel("Usuário").fill("admin");
  await admin.getByLabel("Senha").fill("senha errada para teste");
  await admin.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(admin.getByRole("alert")).toHaveText(
    "Usuário ou senha inválidos.",
  );
  await admin.getByLabel("Senha").fill(password);
  await admin.getByRole("button", { name: "Entrar", exact: true }).click();
  await admin.getByLabel("Código de verificação").fill(totp(totpSecret, 1));
  await admin.getByRole("button", { name: "Verificar" }).click();
  await expect(admin.getByLabel("Sua mensagem")).toBeVisible();
  await admin.getByRole("button", { name: /, menu da conta$/ }).click();
  await admin.getByRole("menuitem", { name: "Administração" }).click();
  await admin.getByRole("button", { name: /Pessoa do PDT/ }).click();
  await expect(
    admin.getByText("Consultas de vendas (Sankhya e VR Master)"),
  ).toBeVisible();
  await expect(admin.getByText("não efetiva")).toBeVisible();
  // Only the owner creates people, optionally with a local invitation and
  // proof-based link invitations; each invitation is a one-time link.
  await admin.getByLabel("Nome", { exact: true }).fill("Pessoa Convidada");
  await admin
    .getByLabel("Convite para a pessoa vincular a conta do PDT Connect")
    .check();
  await admin.getByRole("button", { name: "Criar pessoa" }).click();
  await expect(
    admin.getByRole("heading", { name: "Pessoa Convidada" }),
  ).toBeVisible();
  await expect(
    admin.getByText(/\/identidade\/convite#enrollment=/),
  ).toBeVisible();
  const linkInvitation = (await admin
    .getByText(/\/identidade\/vincular#/)
    .textContent())!.replace(/^.*?(http\S+).*$/s, "$1");
  // Authentication policy: understandable settings, explicit risk acknowledgement.
  await admin
    .getByRole("navigation", { name: "Seções da administração" })
    .getByRole("link", { name: "Autenticação e segurança" })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Autenticação e segurança" }),
  ).toBeVisible();
  await expect(admin.getByLabel("Duração máxima de uma sessão")).toHaveValue(
    "720",
  );
  await admin
    .getByLabel("Duração máxima de uma sessão")
    .selectOption({ label: "30 dias — reduz a segurança" });
  await admin
    .getByLabel("Encerrar a sessão após inatividade")
    .selectOption({ label: "1 dia — reduz a segurança" });
  await expect(
    admin.getByText("Esta política reduz a segurança"),
  ).toBeVisible();
  const savePolicy = admin.getByRole("button", { name: "Salvar política" });
  await expect(savePolicy).toBeDisabled();
  await admin
    .getByLabel("Entendo os riscos e quero aplicar esta política")
    .check();
  await admin.screenshot({
    path: "../../test-results/identity-security-policy.png",
    fullPage: true,
  });
  await savePolicy.click();
  await expect(admin.getByText(/^Política salva\./)).toBeVisible();
  await expect(
    admin.getByText(/Duração máxima de uma sessão: 12 h → 30 dias/),
  ).toBeVisible();
  // Operational parameters on a phone: grouped product settings with friendly
  // names, validated before saving, applied at once and reversible.
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin
    .getByRole("navigation", { name: "Seções da administração" })
    .getByRole("link", { name: "Parâmetros" })
    .click();
  await expect(admin).toHaveURL(`${web}/admin?secao=parametros`);
  await expect(
    admin.getByRole("heading", { name: "Parâmetros", level: 2 }),
  ).toBeVisible();
  await expect(
    admin.getByRole("heading", { name: "Inteligência artificial" }),
  ).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Acesso" })).toBeVisible();
  // Product meaning only: no environment variable names or secrets.
  await expect(admin.getByText(/OPENAI_|IA_MNS_|SECRET|PASSWORD/)).toHaveCount(
    0,
  );
  await expect(admin.getByLabel("Registro de diagnóstico da IA")).toHaveValue(
    "metadata",
  );
  await expect(
    admin.getByRole("checkbox", {
      name: "Sankhya: Consultas de vendas (Sankhya e VR Master)",
    }),
  ).toBeChecked();
  const model = admin.getByLabel("Modelo de IA");
  const modelCard = admin.locator("form", { has: model });
  await expect(model).toHaveValue("gpt-6.1-sol");
  const saveModel = modelCard.getByRole("button", { name: "Salvar" });
  await expect(saveModel).toBeDisabled();
  await model.fill("modelo com espaço");
  await expect(modelCard.getByText(/sem espaços/)).toBeVisible();
  await expect(model).toHaveAttribute("aria-invalid", "true");
  await expect(saveModel).toBeDisabled();
  await model.fill("gpt-6.2-mini");
  await saveModel.click();
  await expect(modelCard.getByRole("status")).toHaveText(
    "Parâmetro salvo. Já está em vigor.",
  );
  await expect(
    modelCard.getByText(/^Definido pela administração \(Administradora MNS, /),
  ).toBeVisible();
  // The page fits the phone: no horizontal scrolling.
  expect(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await admin.screenshot({
    path: "../../test-results/identity-parameters-mobile.png",
    fullPage: true,
  });
  // A new request still shows the saved value.
  await admin.reload();
  await expect(admin.getByLabel("Modelo de IA")).toHaveValue("gpt-6.2-mini");
  await modelCard.getByRole("button", { name: "Restaurar padrão" }).click();
  await expect(modelCard.getByRole("status")).toHaveText(
    "Padrão restaurado. Já está em vigor.",
  );
  await expect(admin.getByLabel("Modelo de IA")).toHaveValue("gpt-6.1-sol");
  await expect(
    admin.getByText(/Modelo de IA: gpt-6\.1-sol → gpt-6\.2-mini/),
  ).toBeVisible();
  await expect(
    admin.getByText(
      /Modelo de IA: gpt-6\.2-mini → gpt-6\.1-sol \(padrão restaurado\)/,
    ),
  ).toBeVisible();
  await other.close();
  const invited = await browser.newContext();
  const invitedPage = await invited.newPage();
  await invitedPage.goto(linkInvitation);
  await expect(
    invitedPage.getByRole("button", {
      name: "Entrar com PDT Connect e vincular",
    }),
  ).toBeVisible();
  await expect(invitedPage.getByText(/Olá, Pessoa Convidada/)).toBeVisible();
  // The secret leaves the address bar as soon as the page reads it.
  expect(new URL(invitedPage.url()).hash).toBe("");
  await invited.close();
});

test("only the configured host may frame IA-MNS, and only its embedded routes", async ({
  page,
}) => {
  for (const path of ["/embed/pdt", "/", "/entrar"]) {
    await page.goto(`${hostile}/?path=${encodeURIComponent(path)}`);
    await page.waitForTimeout(500);
    const victim = page.frames().find((item) => item !== page.mainFrame());
    const rendered = await victim!
      .evaluate(() =>
        Boolean(document.querySelector("#root")?.childElementCount),
      )
      .catch(() => false);
    expect(rendered, path).toBe(false);
  }
});
