import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConversationMaterials } from "../src/features/agent/materials.js";
import * as api from "../src/features/agent/api.js";
vi.mock("../src/features/agent/api.js", async (original) => ({
  ...(await original<typeof api>()),
  setPreferences: vi.fn(() =>
    Promise.resolve({ language: "en", detail: "concise", format: "prose" }),
  ),
  deleteAttachment: vi.fn(() => Promise.resolve({ deleted: true })),
}));

test("explicit conversation preferences save without changing data access or source", async () => {
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversationMaterials
        token={null}
        conversationId="synthetic-chat"
        source="sankhya"
        attachments={[]}
        disabled={false}
        onCreated={async () => {}}
      />
    </QueryClientProvider>,
  );
  await screen
    .getByRole("button", { name: "Anexos e preferências", exact: true })
    .click();
  await screen
    .getByRole("button", { name: /^Preferências da conversa/ })
    .click();
  await screen.getByRole("combobox", { name: /^Idioma/ }).selectOptions("en");
  await screen
    .getByRole("combobox", { name: /^Detalhamento/ })
    .selectOptions("concise");
  await screen
    .getByRole("combobox", { name: /^Formato/ })
    .selectOptions("prose");
  await screen.getByRole("button", { name: "Salvar preferências" }).click();
  await expect
    .poll(() => vi.mocked(api.setPreferences).mock.calls)
    .toEqual([
      [
        null,
        "synthetic-chat",
        { language: "en", detail: "concise", format: "prose" },
      ],
    ]);
});
test("attachment removal is explicit and busy conversations disable changes", async () => {
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversationMaterials
        token={null}
        conversationId="synthetic-chat"
        source="sankhya"
        attachments={[
          {
            id: "synthetic-file",
            name: "example.txt",
            mediaType: "text/plain",
            purpose: "Review this note",
            source: "sankhya",
          },
        ]}
        disabled={true}
        onCreated={async () => {}}
      />
    </QueryClientProvider>,
  );
  await screen
    .getByRole("button", { name: "Anexos e preferências", exact: true })
    .click();
  await screen.getByRole("button", { name: /^Anexos desta conversa/ }).click();
  await expect
    .element(screen.getByRole("button", { name: "Remover example.txt" }))
    .toBeDisabled();
  await expect
    .element(
      screen.getByText(
        "Remover um anexo também remove as respostas que dependem dele.",
      ),
    )
    .toBeVisible();
});

test("pending saves block material edits and a failure retains the preference draft", async () => {
  const pending = Promise.withResolvers<api.PresentationPreferences>();
  vi.mocked(api.setPreferences).mockReturnValueOnce(pending.promise);
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <ConversationMaterials
        token={null}
        conversationId="synthetic-chat"
        source="sankhya"
        attachments={[]}
        disabled={false}
        onCreated={async () => {}}
      />
    </QueryClientProvider>,
  );
  await screen
    .getByRole("button", { name: "Anexos e preferências", exact: true })
    .click();
  await screen
    .getByRole("button", { name: /^Preferências da conversa/ })
    .click();
  const language = screen.getByRole("combobox", {
    name: "Idioma",
    exact: true,
  });
  await language.selectOptions("es");
  await screen.getByRole("button", { name: "Salvar preferências" }).click();
  await expect.element(language).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Salvar preferências" }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Salvando…");
  pending.reject(new Error("synthetic_save_failure"));
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent(
      "Não foi possível salvar. Verifique acesso, formato, tamanho e conteúdo do arquivo, ou se a conversa está ocupada.",
    );
  await expect.element(language).toBeEnabled();
  await expect.element(language).toHaveValue("es");
});
