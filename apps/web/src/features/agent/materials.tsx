import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  SelectField,
  StatusBadge,
  TextField,
} from "../../components.js";
import {
  createConversation,
  uploadAttachment,
  deleteAttachment,
  setPreferences,
  type Attachment,
  type AttachmentUpload,
  type PresentationPreferences,
} from "./api.js";
import { sourceLabels, type SalesSourceSelection } from "../sales/sources.js";
import { newRequestId } from "./request-id.js";
import "./materials.css";

const defaults: PresentationPreferences = {
  language: "auto",
  detail: "auto",
  format: "auto",
};

function fileError(file: File | null): string | undefined {
  if (!file) return;
  const mediaType = file.name.toLowerCase().endsWith(".csv")
    ? "text/csv"
    : file.type;
  if (
    !["text/plain", "text/csv", "image/png", "image/jpeg"].includes(mediaType)
  )
    return "Escolha um arquivo TXT, CSV, PNG ou JPEG.";
  if (file.size > (mediaType.startsWith("text/") ? 48000 : 98304))
    return mediaType.startsWith("text/")
      ? "O arquivo de texto deve ter até 48 KB."
      : "A imagem deve ter até 96 KB.";
}

function MaterialIcon({
  kind,
}: {
  kind: "clip" | "file" | "settings" | "back" | "close" | "plus";
}) {
  const paths = {
    clip: "m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9M6 14l8-8",
    file: "M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h5",
    settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
    back: "m14 6-6 6 6 6",
    close: "m6 6 12 12M6 18 18 6",
    plus: "M12 5v14M5 12h14",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
/** Owned conversation material and explicit presentation settings; no implicit uploads. */
export function ConversationMaterials({
  token,
  conversationId,
  source,
  attachments,
  preferences,
  disabled,
  onCreated,
}: {
  token: string | null;
  conversationId?: string;
  source: SalesSourceSelection;
  attachments: Attachment[];
  preferences?: PresentationPreferences;
  disabled: boolean;
  onCreated: (id: string) => Promise<void>;
}) {
  const query = useQueryClient();
  const sectionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "files" | "preferences">("menu");
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [approved, setApproved] = useState(false);
  const [selected, setSelected] = useState(preferences ?? defaults);
  const [fileKey, setFileKey] = useState(0);
  const attempted = useRef<{ key: string; id: string } | null>(null);
  const place = useCallback(
    (targetView = view) => {
      if (!trigger.current || !panel.current) return;
      const anchor = (
        trigger.current.closest(".agent-composer") ?? trigger.current
      ).getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const width = Math.min(
        targetView === "menu" ? 320 : 600,
        viewportWidth - 24,
      );
      panel.current.style.width = `${width}px`;
      panel.current.style.left = `${Math.max(viewportLeft + 12, Math.min(anchor.left, viewportLeft + viewportWidth - width - 12))}px`;
      const above = anchor.top - viewportTop - 20;
      const below = viewportTop + viewportHeight - anchor.bottom - 20;
      const useAbove = above >= Math.min(240, below);
      panel.current.style.top = useAbove ? "auto" : `${anchor.bottom + 8}px`;
      panel.current.style.bottom = useAbove
        ? `${window.innerHeight - anchor.top + 8}px`
        : "auto";
      panel.current.style.maxHeight = `${Math.max(80, Math.min(560, useAbove ? above : below))}px`;
    },
    [view],
  );
  useLayoutEffect(() => {
    if (!open) return;
    place();
    if (view === "menu")
      panel.current
        ?.querySelector<HTMLButtonElement>(
          ".agent-materials-menu button:not(:disabled)",
        )
        ?.focus();
    else
      panel.current
        ?.querySelector<HTMLElement>(".agent-materials-title")
        ?.focus();
  }, [open, view, place]);
  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    const observer = new ResizeObserver(reposition);
    if (trigger.current)
      observer.observe(
        trigger.current.closest(".agent-composer") ?? trigger.current,
      );
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [open, place]);
  useEffect(() => {
    setSelected(preferences ?? defaults);
  }, [preferences]);
  useEffect(() => {
    setFile(null);
    setPurpose("");
    setApproved(false);
    setFileKey((key) => key + 1);
  }, [conversationId, token]);
  const refresh = async () => {
    await Promise.all([
      query.invalidateQueries({ queryKey: ["agent-detail"] }),
      query.invalidateQueries({ queryKey: ["agent-conversations"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async (
      action: "upload" | "preferences" | { remove: string },
    ) => {
      const id = conversationId ?? (await createConversation(token)).id;
      if (!conversationId) await onCreated(id);
      if (action === "preferences") await setPreferences(token, id, selected);
      else if (typeof action === "object")
        await deleteAttachment(token, id, action.remove);
      else {
        if (!file || !approved || purpose.trim().length < 5 || fileError(file))
          throw new Error("invalid_attachment");
        const mediaType = file.name.toLowerCase().endsWith(".csv")
          ? "text/csv"
          : file.type;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const contentBase64 = btoa(binary);
        const key = JSON.stringify([
          id,
          file.name,
          mediaType,
          contentBase64,
          purpose.trim(),
          source,
        ]);
        if (attempted.current?.key !== key)
          attempted.current = { key, id: newRequestId() };
        await uploadAttachment(token, id, {
          id: attempted.current.id,
          name: file.name,
          mediaType: mediaType as AttachmentUpload["mediaType"],
          contentBase64,
          purpose: purpose.trim(),
          source,
          classification: "business_operational",
          containsRestrictedData: false,
        });
        attempted.current = null;
        setFile(null);
        setPurpose("");
        setApproved(false);
        setFileKey((key) => key + 1);
      }
    },
    onSuccess: refresh,
  });
  const blocked = disabled || save.isPending;
  const validation = fileError(file);
  const customized = Object.values(preferences ?? defaults).some(
    (value) => value !== "auto",
  );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="agent-materials-trigger"
        aria-label="Anexos e preferências"
        title="Anexos e preferências"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={`${sectionId}-hint`}
        popoverTarget={`${sectionId}-panel`}
        data-active={
          attachments.length > 0 || customized || Boolean(file) || undefined
        }
        onClick={() => {
          if (!panel.current?.matches(":popover-open")) {
            setView("menu");
            place("menu");
          }
        }}
      >
        <MaterialIcon kind="plus" />
        {attachments.length > 0 && (
          <span className="agent-materials-count" aria-hidden="true">
            {attachments.length}
          </span>
        )}
      </button>
      <span id={`${sectionId}-hint`} className="agent-materials-sr-only">
        {attachments.length} de 4 anexos.{" "}
        {customized
          ? "Preferências personalizadas."
          : "Preferências automáticas."}{" "}
        {file ? "Arquivo selecionado aguardando envio." : ""}
      </span>
      {createPortal(
        <div
          ref={panel}
          id={`${sectionId}-panel`}
          popover="auto"
          role="dialog"
          aria-labelledby={`${sectionId}-title`}
          className="agent-materials"
          onToggle={() => {
            const visible = panel.current?.matches(":popover-open") ?? false;
            setOpen(visible);
            if (!visible && panel.current?.contains(document.activeElement))
              trigger.current?.focus();
          }}
        >
          <header className="agent-materials-header">
            {view !== "menu" && (
              <Button
                variant="ghost"
                aria-label="Voltar às opções de anexos e preferências"
                onClick={() => setView("menu")}
              >
                <MaterialIcon kind="back" />
              </Button>
            )}
            <h2
              id={`${sectionId}-title`}
              className="agent-materials-title"
              tabIndex={-1}
            >
              {view === "menu"
                ? "Adicionar à conversa"
                : view === "files"
                  ? "Anexos da conversa"
                  : "Preferências da conversa"}
            </h2>
            <Button
              variant="ghost"
              aria-label="Fechar anexos e preferências"
              onClick={() => {
                panel.current?.hidePopover();
                trigger.current?.focus();
              }}
            >
              <MaterialIcon kind="close" />
            </Button>
          </header>
          <div className="agent-materials-menu" hidden={view !== "menu"}>
            <button
              type="button"
              disabled={blocked || attachments.length >= 4}
              onClick={() => {
                setView("files");
                if (!file) fileInput.current?.click();
              }}
            >
              <MaterialIcon kind="clip" />
              <span>
                <strong>
                  {file ? "Continuar anexo" : "Adicionar arquivo"}
                </strong>
                <small>{file ? file.name : "TXT, CSV, PNG ou JPEG"}</small>
              </span>
            </button>
            {attachments.length > 0 && (
              <button type="button" onClick={() => setView("files")}>
                <MaterialIcon kind="file" />
                <span>
                  <strong>Anexos desta conversa</strong>
                  <small>Ver arquivos, finalidade e fonte</small>
                </span>
                <StatusBadge>{attachments.length}/4</StatusBadge>
              </button>
            )}
            <button type="button" onClick={() => setView("preferences")}>
              <MaterialIcon kind="settings" />
              <span>
                <strong>Preferências da conversa</strong>
                <small>Idioma, detalhamento e formato</small>
              </span>
              {customized && (
                <span
                  className="agent-materials-dot"
                  role="img"
                  aria-label="Personalizado"
                />
              )}
            </button>
          </div>
          <div className="agent-materials-content" hidden={view === "menu"}>
            <section
              className="agent-materials-section"
              hidden={view !== "files"}
              aria-labelledby={`${sectionId}-files`}
            >
              <div className="agent-materials-heading">
                <span className="agent-materials-icon">
                  <MaterialIcon kind="file" />
                </span>
                <div>
                  <h2 id={`${sectionId}-files`}>Arquivos da conversa</h2>
                  <p>Adicione contexto para a análise do IA-MNS.</p>
                </div>
                <StatusBadge>{attachments.length}/4</StatusBadge>
              </div>
              {attachments.length > 0 ? (
                <>
                  <ul
                    className="agent-materials-list"
                    aria-label="Anexos desta conversa"
                  >
                    {attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <MaterialIcon kind="file" />
                        <div>
                          <strong>{attachment.name}</strong>
                          <span>{attachment.purpose}</span>
                          <small>{sourceLabels[attachment.source]}</small>
                        </div>
                        <Button
                          variant="ghost"
                          disabled={blocked}
                          aria-label={`Remover ${attachment.name}`}
                          onClick={() => save.mutate({ remove: attachment.id })}
                        >
                          Remover
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <p className="agent-materials-note">
                    Remover um anexo também remove as respostas que dependem
                    dele.
                  </p>
                </>
              ) : (
                <p className="agent-materials-empty">
                  Nenhum anexo nesta conversa. Os arquivos adicionados ficam
                  disponíveis como contexto quando necessário.
                </p>
              )}
              <div className="agent-materials-picker">
                <TextField
                  ref={fileInput}
                  key={fileKey}
                  label="Arquivo"
                  type="file"
                  accept=".txt,.csv,.png,.jpg,.jpeg"
                  hint="TXT/CSV até 48 KB · PNG/JPEG até 96 KB e um milhão de pixels. Para analisar valores, prefira texto ou CSV."
                  error={validation}
                  disabled={blocked || attachments.length >= 4}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setApproved(false);
                    save.reset();
                  }}
                />
              </div>
              {attachments.length >= 4 && (
                <p className="agent-materials-note">
                  Limite de 4 anexos atingido. Remova um arquivo para adicionar
                  outro.
                </p>
              )}
              {file && (
                <div className="agent-materials-draft">
                  <div className="agent-materials-file-info">
                    <span>
                      {file.name} ·{" "}
                      {new Intl.NumberFormat("pt-BR").format(file.size)} bytes
                    </span>
                    <Button
                      variant="ghost"
                      disabled={blocked}
                      onClick={() => {
                        setFile(null);
                        setPurpose("");
                        setApproved(false);
                        setFileKey((key) => key + 1);
                        save.reset();
                      }}
                    >
                      Descartar seleção
                    </Button>
                  </div>
                  <TextField
                    label="Finalidade da análise"
                    placeholder="Ex.: resumir os pontos principais do relatório"
                    hint="Descreva o que deseja analisar (mínimo de 5 caracteres)."
                    value={purpose}
                    maxLength={300}
                    disabled={blocked}
                    onChange={(event) => setPurpose(event.target.value)}
                  />
                  <label className="agent-materials-consent">
                    <input
                      type="checkbox"
                      checked={approved}
                      disabled={blocked}
                      onChange={(event) => setApproved(event.target.checked)}
                    />
                    <span>
                      Confirmo que este arquivo contém apenas dados operacionais
                      autorizados, sem credenciais nem dados pessoais restritos
                      ou desnecessários.
                    </span>
                  </label>
                  <div className="agent-materials-upload-actions">
                    <span>Fonte: {sourceLabels[source]}</span>
                    <Button
                      loading={save.isPending && save.variables === "upload"}
                      disabled={
                        blocked ||
                        Boolean(validation) ||
                        !approved ||
                        purpose.trim().length < 5 ||
                        attachments.length >= 4
                      }
                      onClick={() => save.mutate("upload")}
                    >
                      Adicionar à conversa
                    </Button>
                  </div>
                </div>
              )}
            </section>
            <section
              className="agent-materials-section"
              hidden={view !== "preferences"}
              aria-labelledby={`${sectionId}-preferences`}
            >
              <div className="agent-materials-heading">
                <span className="agent-materials-icon">
                  <MaterialIcon kind="settings" />
                </span>
                <div>
                  <h2 id={`${sectionId}-preferences`}>
                    Preferências desta conversa
                  </h2>
                  <p>Escolha como deseja receber as respostas.</p>
                </div>
              </div>
              <div className="agent-materials-preferences">
                <SelectField
                  label="Idioma"
                  disabled={blocked}
                  value={selected.language}
                  onChange={(event) => {
                    save.reset();
                    setSelected({
                      ...selected,
                      language: event.target
                        .value as PresentationPreferences["language"],
                    });
                  }}
                >
                  <option value="auto">Automático</option>
                  <option value="pt-BR">Português</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </SelectField>
                <SelectField
                  label="Detalhamento"
                  disabled={blocked}
                  value={selected.detail}
                  onChange={(event) => {
                    save.reset();
                    setSelected({
                      ...selected,
                      detail: event.target
                        .value as PresentationPreferences["detail"],
                    });
                  }}
                >
                  <option value="auto">Automático</option>
                  <option value="concise">Conciso</option>
                  <option value="detailed">Detalhado</option>
                </SelectField>
                <SelectField
                  label="Formato"
                  disabled={blocked}
                  value={selected.format}
                  onChange={(event) => {
                    save.reset();
                    setSelected({
                      ...selected,
                      format: event.target
                        .value as PresentationPreferences["format"],
                    });
                  }}
                >
                  <option value="auto">Automático</option>
                  <option value="prose">Texto contínuo</option>
                  <option value="bullets">Tópicos</option>
                </SelectField>
              </div>
              <p className="agent-materials-note">
                No modo automático, o IA-MNS adapta a apresentação ao seu
                pedido. Estas escolhas valem apenas para esta conversa.
              </p>
              <div className="agent-materials-preference-actions">
                <Button
                  disabled={blocked}
                  loading={save.isPending && save.variables === "preferences"}
                  onClick={() => save.mutate("preferences")}
                >
                  Salvar preferências
                </Button>
              </div>
            </section>
            {save.isPending && (
              <p className="agent-materials-feedback" role="status">
                Salvando…
              </p>
            )}
            {save.isSuccess && (
              <p className="agent-materials-feedback" role="status">
                {save.variables === "preferences"
                  ? "Preferências salvas para esta conversa."
                  : save.variables === "upload"
                    ? "Arquivo adicionado à conversa."
                    : "Anexo e respostas dependentes removidos."}
              </p>
            )}
            {save.error && (
              <p
                className="agent-materials-feedback notice notice-error"
                role="alert"
              >
                Não foi possível salvar. Verifique acesso, formato, tamanho e
                conteúdo do arquivo, ou se a conversa está ocupada.
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
