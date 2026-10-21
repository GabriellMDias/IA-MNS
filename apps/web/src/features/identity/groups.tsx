import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  listPersons,
  setGroupGrant,
  setGroupMember,
  updateGroup,
  type GroupDetail,
} from "./api.js";
import { identityMessage, isFailure } from "./messages.js";
import { PermissionGrants } from "./permissions.js";
import {
  Button,
  SectionCard,
  StatusBadge,
  TextField,
} from "../../components.js";
import { Avatar } from "./navigation.js";

function NewGroup({
  token,
  onCreated,
}: {
  token: string;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createGroup(token, {
        name,
        description: description.trim() ? description : null,
      }),
    onSuccess: (created) => {
      setName("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["identity-groups"] });
      onCreated(created.groupId);
    },
  });
  return (
    <form
      className="identity-form admin-group-create"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <TextField
        label="Nome do novo grupo"
        id="identity-new-group"
        value={name}
        minLength={2}
        maxLength={80}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label="Descrição (opcional)"
        id="identity-new-group-description"
        value={description}
        maxLength={300}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Button type="submit" loading={create.isPending}>
        Criar grupo
      </Button>
      {create.error && <p role="alert">{identityMessage(create.error)}</p>}
    </form>
  );
}

/** Finds an active Person to add; the API refuses disabled ones. */
function AddMember({
  token,
  members,
  busy,
  onAdd,
}: {
  token: string;
  members: readonly string[];
  busy: boolean;
  onAdd: (personId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const candidates = useQuery({
    queryKey: ["identity-persons", token, query],
    queryFn: ({ signal }) => listPersons(token, query, undefined, signal),
    enabled: query.trim().length >= 2,
  });
  return (
    <div className="identity-picker">
      <TextField
        label="Adicionar pessoa ao grupo"
        type="search"
        placeholder="Buscar por nome ou usuário"
        id="identity-group-member-search"
        value={query}
        maxLength={120}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="identity-list">
        {candidates.data?.items
          .filter((item) => !members.includes(item.id))
          .map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.displayName}</strong>
                {item.status === "disabled" ? " · desativada" : ""}
              </span>
              <Button
                variant="secondary"
                disabled={busy || item.status !== "active"}
                onClick={() => onAdd(item.id)}
              >
                Adicionar
              </Button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function GroupNames({
  group,
  busy,
  onSave,
}: {
  group: GroupDetail["group"];
  busy: boolean;
  onSave: (name: string, description: string | null) => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  return (
    <form
      className="identity-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, description.trim() ? description : null);
      }}
    >
      <TextField
        label="Nome"
        id="identity-group-name"
        value={name}
        minLength={2}
        maxLength={80}
        required
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label="Descrição"
        id="identity-group-description"
        value={description}
        maxLength={300}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={busy}>
        Salvar nome e descrição
      </Button>
    </form>
  );
}

function GroupView({
  token,
  groupId,
  onDeleted,
}: {
  token: string;
  groupId: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useQuery({
    queryKey: ["identity-group", token, groupId],
    queryFn: ({ signal }) => getGroup(token, groupId, signal),
  });
  const action = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["identity-group"] });
      void queryClient.invalidateQueries({ queryKey: ["identity-groups"] });
      // Members' effective access changes with the group.
      void queryClient.invalidateQueries({ queryKey: ["identity-person"] });
    },
  });
  if (detail.isPending) return <p role="status">Carregando…</p>;
  if (detail.error || !detail.data)
    return <p role="alert">{identityMessage(detail.error)}</p>;
  const { group, catalog, restrictionsAvailable } = detail.data;
  return (
    <div className="admin-detail">
      <SectionCard
        title={group.name}
        description={
          group.description ??
          "Todas as pessoas do grupo recebem as permissões do grupo."
        }
        className="admin-person-summary"
      >
        <div className="admin-person-status">
          <StatusBadge>
            {group.members.length === 1
              ? "1 pessoa"
              : `${group.members.length} pessoas`}
          </StatusBadge>
        </div>
      </SectionCard>
      {action.error && (
        <p role="alert" className="admin-notice admin-notice-error">
          {isFailure(action.error, "IDENTITY_RECENT_AUTHENTICATION_REQUIRED")
            ? "Confirme sua identidade em Minha conta (senha e código) e repita a alteração."
            : identityMessage(action.error)}
        </p>
      )}
      <SectionCard
        title="Permissões do grupo"
        description="Cada pessoa do grupo recebe estas permissões, somadas às suas concessões individuais. Uma concessão sem restrição vale para todos os dados da fonte."
      >
        <PermissionGrants
          token={token}
          catalog={catalog}
          grants={group.grants}
          restrictionsAvailable={restrictionsAvailable}
          busy={action.isPending}
          onGrant={(permission, restrictions) =>
            action.mutate(() =>
              setGroupGrant(token, group.id, permission, true, restrictions),
            )
          }
          onRevoke={(permission) =>
            action.mutate(() =>
              setGroupGrant(token, group.id, permission, false),
            )
          }
        />
      </SectionCard>
      <div className="admin-detail-grid">
        <SectionCard title="Pessoas do grupo">
          {group.members.length ? (
            <ul className="identity-list">
              {group.members.map((member) => (
                <li key={member.personId} className="admin-group-member">
                  <span>
                    <Avatar name={member.displayName} />{" "}
                    <strong>{member.displayName}</strong>
                    {member.status === "disabled" ? " · desativada" : ""}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(() =>
                        setGroupMember(token, group.id, member.personId, false),
                      )
                    }
                  >
                    Remover do grupo
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-muted">Nenhuma pessoa neste grupo.</p>
          )}
          <AddMember
            token={token}
            members={group.members.map((member) => member.personId)}
            busy={action.isPending}
            onAdd={(personId) =>
              action.mutate(() =>
                setGroupMember(token, group.id, personId, true),
              )
            }
          />
        </SectionCard>
        <SectionCard title="Dados do grupo">
          <GroupNames
            key={group.version}
            group={group}
            busy={action.isPending}
            onSave={(name, description) =>
              action.mutate(() =>
                updateGroup(token, group.id, {
                  name,
                  description,
                  version: group.version,
                }),
              )
            }
          />
          {confirmDelete ? (
            <p className="identity-warning">
              As pessoas do grupo perdem as permissões dele imediatamente.{" "}
              <Button
                variant="danger"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate(async () => {
                    await deleteGroup(token, group.id);
                    onDeleted();
                  })
                }
              >
                Excluir grupo
              </Button>{" "}
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
            </p>
          ) : (
            <div className="identity-actions">
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                Excluir grupo
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/** Owner management of groups whose grants every member holds. */
export function GroupsPanel({
  token,
  selected,
}: {
  token: string;
  selected: string | undefined;
}) {
  const navigate = useNavigate();
  const groups = useQuery({
    queryKey: ["identity-groups", token],
    queryFn: ({ signal }) => listGroups(token, signal),
  });
  const current = selected ?? groups.data?.items[0]?.id;
  const select = (groupId?: string) =>
    void navigate({
      to: "/admin",
      search: { secao: "grupos", ...(groupId ? { grupo: groupId } : {}) },
    });
  return (
    <div className="admin-people-layout">
      <SectionCard title="Grupos" className="admin-directory">
        {groups.isPending && (
          <p role="status" className="admin-muted">
            Carregando grupos…
          </p>
        )}
        {groups.error && <p role="alert">{identityMessage(groups.error)}</p>}
        {groups.data && !groups.data.items.length && (
          <p className="admin-muted">
            Nenhum grupo ainda. Crie um grupo para liberar as mesmas permissões
            a várias pessoas.
          </p>
        )}
        <ul className="admin-person-list">
          {groups.data?.items.map((group) => (
            <li key={group.id}>
              <Button
                variant="ghost"
                className={current === group.id ? "is-selected" : ""}
                aria-pressed={current === group.id}
                onClick={() => select(group.id)}
              >
                <span className="admin-person-list-copy">
                  <strong>{group.name}</strong>
                  <span>
                    {group.members === 1
                      ? "1 pessoa"
                      : `${group.members} pessoas`}
                    {group.permissions.length
                      ? ` · ${group.permissions.length} ${group.permissions.length === 1 ? "permissão" : "permissões"}`
                      : ""}
                  </span>
                </span>
              </Button>
            </li>
          ))}
        </ul>
        <NewGroup token={token} onCreated={select} />
      </SectionCard>
      <div className="admin-workspace">
        {current ? (
          <GroupView
            key={current}
            token={token}
            groupId={current}
            onDeleted={() => select()}
          />
        ) : (
          !groups.isPending && (
            <SectionCard
              title="Grupos de permissões"
              description="Agrupe pessoas que precisam das mesmas permissões, como uma equipe comercial de uma filial, e conceda as permissões uma vez ao grupo."
            />
          )
        )}
      </div>
    </div>
  );
}
