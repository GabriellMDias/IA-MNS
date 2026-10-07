import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoStoredUserData } from "./storage.ts";
const id = "10000000-0000-4000-8000-000000000001";
const result = {
  query: {
    productSearch: "maçã",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    metric: "net_value",
    groupBy: "month",
    comparison: "none",
  },
  rows: [
    { period: "2026-07", product: null, unit: "BRL", value: "100.10" },
    { period: "2026-08", product: null, unit: "BRL", value: "200.20" },
  ],
  products: [{ code: "123", description: "MAÇÃ GALA" }],
  totals: [
    { unit: "BRL", value: "300.30", previousValue: null, changePercent: null },
  ],
  comparison: null,
  warnings: [],
};
// The second source of a "Tudo" answer, with figures that must never be added
// to the first source's.
const vrmasterResult = {
  ...result,
  rows: [{ period: "2026-07", product: null, unit: "BRL", value: "50.00" }],
  products: [],
  totals: [
    { unit: "BRL", value: "50.00", previousValue: null, changePercent: null },
  ],
};
function answerFor(source: string) {
  const section = (name: string) => ({
    source: name,
    status: "answered",
    reason: null,
    result: name === "vrmaster" ? vrmasterResult : result,
  });
  return {
    selection: source,
    sections:
      source === "all"
        ? [section("sankhya"), section("vrmaster")]
        : [section(source)],
  };
}
type Turn = {
  id: string;
  requestId: string;
  sequence: number;
  question: string;
  source: string;
  state: string;
  reply: unknown;
  events: { stage: string; message: string; at: string }[];
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
};
async function fixture(
  page: Page,
  options: {
    token?: boolean;
    fail?: boolean;
    unknown?: boolean;
    extra?: boolean;
  } = {},
) {
  const turns: Turn[] = [];
  const sources: (string | undefined)[] = [];
  let exists = false;
  let polls = 0;
  let requests = 0;
  const conversation = {
    id,
    title: "Conversa de teste",
    pinned: false,
    archived: false,
    updatedAt: "2026-10-01T15:00:00Z",
  };
  const extra = {
    ...conversation,
    id: "10000000-0000-4000-8000-000000000002",
    title: "Outra conversa",
  };
  let extraExists = options.extra ?? false;
  await page.route("**/api/agent/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path.endsWith("/status")) {
      await route.fulfill({
        json: {
          configured: true,
          accessMode: options.token ? "token" : "local",
          capabilities: [
            {
              id: "sales",
              title: "Consultas de vendas",
              description: "Consulte vendas",
              examples: ["Quanto vendi de maçã por mês nos últimos 3 meses?"],
            },
          ],
        },
      });
      return;
    }
    expect(request.headers()["x-ia-mns-client"]).toBe("web");
    if (path.endsWith("/conversations")) {
      if (method === "POST") {
        exists = true;
        await route.fulfill({ status: 201, json: conversation });
      } else
        await route.fulfill({
          json: {
            items:
              exists &&
              (new URL(request.url()).searchParams.get("scope") === "archived"
                ? conversation.archived
                : !conversation.archived &&
                  (new URL(request.url()).searchParams.get("scope") !==
                    "pinned" ||
                    conversation.pinned))
                ? [conversation, ...(extraExists ? [extra] : [])]
                : [],
            nextCursor: null,
          },
        });
      return;
    }
    if (path.endsWith("/search")) {
      const body = request.postDataJSON() as { query: string };
      const query = body.query.toLowerCase();
      await route.fulfill({
        json: {
          items:
            exists &&
            (conversation.title.toLowerCase().includes(query) ||
              turns.some((turn) => turn.question.toLowerCase().includes(query)))
              ? [conversation]
              : [],
          nextCursor: null,
        },
      });
      return;
    }
    if (method === "PATCH") {
      const target = path.includes(extra.id) ? extra : conversation;
      Object.assign(target, request.postDataJSON());
      await route.fulfill({ json: target });
      return;
    }
    if (method === "DELETE") {
      if (path.includes(extra.id)) {
        extraExists = false;
        await route.fulfill({ json: { deleted: true } });
        return;
      }
      exists = false;
      turns.splice(0);
      await route.fulfill({ json: { deleted: true } });
      return;
    }
    if (path.endsWith("/turns")) {
      requests++;
      const body = request.postDataJSON() as {
        message: string;
        requestId: string;
        source?: string;
      };
      sources.push(body.source);
      let turn = turns.find((item) => item.requestId === body.requestId);
      if (!turn) {
        turn = {
          id: crypto.randomUUID(),
          requestId: body.requestId,
          sequence: turns.length + 1,
          question: body.message,
          source: body.source ?? "sankhya",
          state: "running",
          reply: null,
          events: [],
          failureCode: null,
          createdAt: "2026-10-01T15:00:00Z",
          finishedAt: null,
        };
        turns.push(turn);
        polls = 0;
      }
      if (options.unknown && requests === 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ status: 202, json: turn });
      return;
    }
    const active = turns.at(-1);
    if (active?.state === "running") {
      polls++;
      if (polls === 1)
        active.events = [
          {
            stage: "thinking",
            message: "Entendendo sua mensagem…",
            at: "2026-10-01T15:00:00Z",
          },
        ];
      else if (polls === 2)
        active.events.push({
          stage: "querying_sales",
          message: "Consultando as vendas…",
          at: "2026-10-01T15:00:01Z",
        });
      else {
        active.state = options.fail ? "failed" : "completed";
        active.finishedAt = "2026-10-01T15:00:02Z";
        if (options.fail) active.failureCode = "SALES_PROVIDER_UNAVAILABLE";
        else
          active.reply = {
            kind: "answer",
            capabilityId: "sales",
            message: "Valor líquido vendido para maçã: R$ 300,30.",
            result: answerFor(active.source),
            suggestions: [],
          };
      }
    }
    await route.fulfill({ json: { conversation, turns, olderThan: null } });
  });
  return { turns, requests: () => requests, sources: () => sources };
}
const webUrl = () => process.env.ORION_E2E_WEB_URL!;
test("mobile conversation menus act on their row and leave the selected conversation intact", async ({
  page,
}) => {
  const state = await fixture(page, { extra: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(webUrl());
  await page.getByLabel("Sua mensagem").fill("Vendas neste mês");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Conversas", exact: true });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("button", { name: "Opções de Outra conversa" })
    .click();
  // The menu takes focus from its asynchronous toggle event; navigate only after it does.
  await expect(
    page.getByRole("menuitem", { name: "Renomear", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Excluir", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", {
    name: "Excluir esta conversa?",
  });
  await confirmation
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Outra conversa" }),
  ).toHaveCount(0);
  await expect(
    drawer.getByRole("link", { name: "Conversa de teste" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Fechar barra lateral" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(1);
  expect(state.requests()).toBe(1);
  await expectNoStoredUserData(page);
});
test("sidebar rail resizes, animates and organizes persistent conversation metadata without new agent calls", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(webUrl());
  await page.getByLabel("Sua mensagem").fill("Vendas de maçã neste mês");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  const separator = page.getByRole("separator", {
    name: "Largura da barra lateral",
  });
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "276");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(276);
  const bounds = (await separator.boundingBox())!;
  await page.mouse.move(bounds.x + 3, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(380, bounds.y + 100);
  await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow", "380");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(380);
  expect(
    await page
      .locator(".agent-workspace")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0.18s");
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(60);
  await expect(
    page.getByRole("button", { name: "Nova conversa" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pesquisar conversas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fixados", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agent-chat-header button")).toHaveCount(0);
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await page
    .getByRole("button", { name: "Opções de Conversa de teste" })
    .click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  await page.getByLabel("Nome da conversa").fill("Revisão mensal");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Revisão mensal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opções de Revisão mensal" }).click();
  await page.getByRole("menuitem", { name: "Fixar", exact: true }).click();
  await page.getByRole("button", { name: "Fixados", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Revisão mensal/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opções de Revisão mensal" }).click();
  await page.getByRole("menuitem", { name: "Arquivar", exact: true }).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Arquivadas", exact: true }).click();
  await page.getByRole("link", { name: /Revisão mensal/ }).click();
  await expect(page.getByLabel("Sua mensagem")).toBeDisabled();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Restaurar conversa", exact: true })
    .click();
  await expect(page.getByLabel("Sua mensagem")).toBeEnabled();
  await page.getByRole("button", { name: "Pesquisar conversas" }).click();
  await page.getByLabel("Título ou mensagem enviada").fill("maçã");
  await page
    .getByRole("navigation", { name: "Resultados da pesquisa" })
    .getByRole("button", { name: /Revisão mensal/ })
    .click();
  expect(page.url()).not.toContain("maç");
  await expect(page.getByRole("table")).toHaveCount(1);
  expect(state.requests()).toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Opções de Revisão mensal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Opções de Revisão mensal" }).click();
  await page.getByRole("menuitem", { name: "Desafixar", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".agent-workspace")
      .evaluate((element) => getComputedStyle(element).transitionDuration),
  ).toBe("0s");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expectNoStoredUserData(page);
});
test("corporate agent shows actual progress, persistent history, precise sales views and explicit deletion", async ({
  page,
}) => {
  await fixture(page);
  await page.goto(webUrl());
  await expect(
    page.getByRole("heading", { name: "Como posso ajudar hoje?" }),
  ).toBeVisible();
  await expect(page.getByText("Somente consulta", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Quanto vendi de maçã/ }).click();
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${id}(\\?.*)?$`));
  await expect(page.getByRole("status")).toContainText(
    "Entendendo sua mensagem",
  );
  await expect(page.getByRole("status")).toContainText("Consultando as vendas");
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(page.getByText("R$ 300,30", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gráfico", exact: true }).click();
  await expect(page.getByLabel("Vendas por mês")).toBeVisible();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await page.getByText("1 produto(s) identificado(s)").click();
  await expect(
    page.getByText("123 — MAÇÃ GALA", { exact: true }),
  ).toBeVisible();
  await expectNoStoredUserData(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Nova conversa" }).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByRole("link", { name: "Conversa de teste" }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.getByLabel("Sua mensagem").fill("E no ano passado?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("table")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Opções de Conversa de teste" })
    .click();
  await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Excluir esta conversa?",
  });
  await expect(confirmation).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await confirmation.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("table")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Opções de Conversa de teste" })
    .click();
  await page.getByRole("menuitem", { name: "Excluir", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${webUrl()}/(\\?.*)?$`));
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Conversa de teste" }),
  ).toHaveCount(0);
});
test("light/dark themes persist only a display preference and stay accessible on desktop/mobile and documentation", async ({
  page,
}) => {
  await fixture(page);
  // Light is the default even when the operating system prefers dark.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(webUrl());
  await expect(
    page.getByRole("heading", { name: "Como posso ajudar hoje?" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "../../test-results/agent-light-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "Como posso ajudar hoje?" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../../test-results/agent-dark-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Conversas", exact: true });
  await expect(drawer).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../../test-results/agent-sidebar-mobile.png",
  });
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conversas", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "../../test-results/agent-dark-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await page.getByRole("button", { name: "Ativar modo claro" }).click();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../../test-results/agent-light-mobile.png",
    fullPage: true,
  });
  await expectNoStoredUserData(page);
  await page.goto(`${webUrl()}/docs`);
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("the full-window notebook chat expands when history is collapsed and mobile history does not displace the composer", async ({
  page,
}) => {
  await fixture(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(webUrl());
  const workspace = page.getByRole("region", { name: "Agente IA-MNS" });
  const main = page.locator(".agent-main");
  const composer = page.locator(".agent-composer");
  await expect(
    page.getByRole("heading", { name: "Como posso ajudar hoje?" }),
  ).toBeVisible();
  expect(await workspace.boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 1366,
    height: 768,
  });
  const expandedWidth = (await main.boundingBox())!.width;
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await expect(
    page.getByRole("navigation", { name: "Conversas anteriores" }),
  ).not.toBeVisible();
  await expect
    .poll(async () => (await main.boundingBox())!.width - expandedWidth)
    .toBeGreaterThanOrEqual(195);
  expect((await composer.boundingBox())!.width).toBeGreaterThan(1000);
  await page.getByLabel("Sua mensagem").fill("Vendas neste mês");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Expandir barra lateral" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(
    page.getByRole("link", { name: "Conversa de teste" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(
    page.getByRole("button", { name: "Expandir barra lateral" }),
  ).toBeVisible();
  expect(await workspace.boundingBox()).toMatchObject({
    width: 1024,
    height: 600,
  });
  const notebookComposer = (await composer.boundingBox())!;
  expect(notebookComposer.y + notebookComposer.height).toBeLessThanOrEqual(600);
  expect(notebookComposer.y + notebookComposer.height).toBeGreaterThan(560);
  await page.screenshot({
    path: "../../test-results/agent-notebook-collapsed.png",
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("button", { name: "Conversas", exact: true }),
    ).toBeVisible();
    const before = (await composer.boundingBox())!;
    await page.getByRole("button", { name: "Conversas", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Conversas", exact: true });
    await expect(drawer).toBeVisible();
    expect(await composer.boundingBox()).toEqual(before);
    await drawer.getByRole("button", { name: "Fechar barra lateral" }).click();
    await expect(drawer).not.toBeVisible();
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(viewport);
    expect(before.y + before.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Conversas", exact: true })
    .getByRole("button", { name: "Nova conversa" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Conversas", exact: true }),
  ).not.toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${webUrl()}/(\\?.*)?$`));
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Conversas", exact: true })
    .getByRole("link", { name: "Conversa de teste" })
    .click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "Conversas", exact: true }),
  ).not.toBeVisible();
  await expectNoStoredUserData(page);
});
test("failed executions never fabricate results and unknown acceptance recovers the same request", async ({
  page,
}) => {
  const state = await fixture(page, { fail: true, unknown: true });
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", { value: undefined }),
  );
  await page.goto(webUrl());
  await page.getByLabel("Sua mensagem").fill("Vendas neste mês");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("alert")).toContainText("confirmar o envio");
  await page.getByRole("button", { name: "Verificar envio" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não consegui consultar as vendas",
  );
  await expect(page.getByRole("table")).toHaveCount(0);
  expect(state.requests()).toBe(2);
  expect(state.turns).toHaveLength(1);
  await expect(page.getByLabel("Sua mensagem")).toBeEnabled();
  await expectNoStoredUserData(page);
});
test("changing credentials clears confidential cached turns and missing setup stays explicit", async ({
  page,
}) => {
  await fixture(page, { token: true });
  await page.goto(webUrl());
  await expect(
    page.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeDisabled();
  await page.getByLabel("Token de acesso").fill("synthetic-token");
  await page.getByRole("button", { name: "Usar token" }).click();
  await page.getByLabel("Sua mensagem").fill("Vendas neste mês");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeDisabled();
  await expectNoStoredUserData(page);
  await page.unroute("**/api/agent/**");
  await page.goto(webUrl());
  await expect(page.getByRole("status")).toContainText(
    "O agente está indisponível",
  );
});
test("the source selector routes each question explicitly, keeps sources apart and works by keyboard on mobile", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(webUrl());
  const selector = page.getByRole("combobox", { name: "Fonte" });
  await expect(selector).toBeVisible();
  await expect(selector).toHaveValue("sankhya");
  await expect(selector.locator("option")).toHaveText([
    "MNS (Sankhya)",
    "Pilar da Terra (VR Master)",
    "Tudo",
  ]);
  // The selector sits right above the message box, inside a 375px screen.
  const box = (await selector.boundingBox())!;
  const input = (await page.getByLabel("Sua mensagem").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(input.y - (box.y + box.height)).toBeLessThan(40);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Keyboard selection; the question names another system, but the
  // selector decides.
  await selector.focus();
  await page.keyboard.press("ArrowDown");
  await expect(selector).toHaveValue("vrmaster");
  await page
    .getByLabel("Sua mensagem")
    .fill("Quanto vendi no Sankhya em setembro?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    page.getByRole("group", { name: "Fonte: Pilar da Terra (VR Master)" }),
  ).toBeVisible();
  expect(state.sources()).toEqual(["vrmaster"]);
  await expect(page.locator(".agent-turn-source")).toHaveText([
    "Fonte: Pilar da Terra (VR Master)",
  ]);

  // Changing the selector routes the next question; both sources appear
  // separately and nothing adds them.
  await selector.selectOption("all");
  await page.getByLabel("Sua mensagem").fill("E no mês passado?");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator(".agent-turn-source")).toHaveText([
    "Fonte: Pilar da Terra (VR Master)",
    "Fonte: Tudo",
  ]);
  expect(state.sources()).toEqual(["vrmaster", "all"]);
  const last = page.locator(".agent-turn").last();
  await expect(
    last.getByRole("group", { name: "Fonte: MNS (Sankhya)" }),
  ).toBeVisible();
  await expect(
    last.getByRole("group", { name: "Fonte: Pilar da Terra (VR Master)" }),
  ).toBeVisible();
  await expect(last.getByText("os valores não são somados")).toBeVisible();
  await expect(last.getByText("R$ 350,30")).toHaveCount(0);
  await expect(selector).toHaveValue("all");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The choice lives only in memory: nothing is stored and a reload starts
  // again from MNS (Sankhya).
  await expectNoStoredUserData(page);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Fonte" })).toHaveValue(
    "sankhya",
  );
});
