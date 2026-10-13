import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createConversation,
  uploadAttachment,
  deleteAttachment,
  setPreferences,
  type Attachment,
  type AttachmentUpload,
  type PresentationPreferences,
} from "./api.js";
import type { SalesSourceSelection } from "../sales/sources.js";
import { newRequestId } from "./request-id.js";

const defaults: PresentationPreferences = {
  language: "auto",
  detail: "auto",
  format: "auto",
};
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
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [approved, setApproved] = useState(false);
  const [selected, setSelected] = useState(preferences ?? defaults);
  const [fileKey, setFileKey] = useState(0);
  const attempted = useRef<{ key: string; id: string } | null>(null);
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
        if (!file || !approved || purpose.trim().length < 5)
          throw new Error("invalid_attachment");
        const mediaType = file.name.toLowerCase().endsWith(".csv")
          ? "text/csv"
          : file.type;
        if (
          !["text/plain", "text/csv", "image/png", "image/jpeg"].includes(
            mediaType,
          ) ||
          file.size > (mediaType.startsWith("text/") ? 48000 : 98304)
        )
          throw new Error("invalid_attachment");
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
  return (
    <details className="agent-materials">
      <summary>Anexos e preferências</summary>
      <div className="agent-materials-content">
        <p>
          Anexe TXT/CSV até 48 KB ou PNG/JPEG até 96 KB e um milhão de pixels. O
          conteúdo será usado nesta conversa quando necessário. Imagens permitem
          descrição; para analisar valores, prefira texto ou CSV.
        </p>
        {attachments.length > 0 && (
          <ul aria-label="Anexos desta conversa">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <span>{attachment.name}</span>{" "}
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => save.mutate({ remove: attachment.id })}
                >
                  Remover {attachment.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p>Remover um anexo também remove as respostas que dependem dele.</p>
        <label>
          Arquivo{" "}
          <input
            key={fileKey}
            type="file"
            accept=".txt,.csv,.png,.jpg,.jpeg"
            disabled={blocked || attachments.length >= 4}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <>
            <label>
              Finalidade da análise{" "}
              <input
                value={purpose}
                maxLength={300}
                disabled={blocked}
                onChange={(event) => setPurpose(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={approved}
                disabled={blocked}
                onChange={(event) => setApproved(event.target.checked)}
              />{" "}
              Confirmo que este arquivo contém apenas dados operacionais
              autorizados, sem credenciais nem dados pessoais restritos ou
              desnecessários.
            </label>
            <button
              type="button"
              disabled={blocked || !approved || purpose.trim().length < 5}
              onClick={() => save.mutate("upload")}
            >
              Adicionar à conversa
            </button>
          </>
        )}
        <fieldset disabled={blocked}>
          <legend>Preferências desta conversa</legend>
          <label>
            Idioma{" "}
            <select
              value={selected.language}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  language: event.target
                    .value as PresentationPreferences["language"],
                })
              }
            >
              <option value="auto">Automático</option>
              <option value="pt-BR">Português</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label>
            Detalhamento{" "}
            <select
              value={selected.detail}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  detail: event.target
                    .value as PresentationPreferences["detail"],
                })
              }
            >
              <option value="auto">Automático</option>
              <option value="concise">Conciso</option>
              <option value="detailed">Detalhado</option>
            </select>
          </label>
          <label>
            Formato{" "}
            <select
              value={selected.format}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  format: event.target
                    .value as PresentationPreferences["format"],
                })
              }
            >
              <option value="auto">Automático</option>
              <option value="prose">Texto contínuo</option>
              <option value="bullets">Tópicos</option>
            </select>
          </label>
          <button type="button" onClick={() => save.mutate("preferences")}>
            Salvar preferências
          </button>
        </fieldset>
        {save.isPending && <p role="status">Salvando…</p>}
        {save.error && (
          <p role="alert">
            Não foi possível salvar. Verifique acesso, formato, tamanho e
            conteúdo do arquivo, ou se a conversa está ocupada.
          </p>
        )}
      </div>
    </details>
  );
}
