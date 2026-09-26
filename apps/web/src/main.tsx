import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CredentialProvider, useCredential } from "./auth.js";
import { approvalApi, type ApprovalRequest, type Scope } from "./api.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccessTokenForm, ErrorNotice } from "./components.js";
import { DocumentationPage } from "./documentation.js";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 10_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function Shell() {
  const { token, setToken } = useCredential();
  const isDocumentation = useRouterState({
    select: (state) => state.location.pathname === "/docs",
  });
  function connect(value: string) {
    queryClient.clear();
    setToken(value);
  }
  function disconnect() {
    queryClient.clear();
    setToken(null);
  }
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" search={{ scope: "mine" }} className="brand">
            ORION<span> / APPROVAL REQUESTS</span>
          </Link>
          <span className="header-note">
            {isDocumentation ? "Living documentation" : "Reference workflow"}
          </span>
          <Link to="/docs" className="header-docs-link">
            Documentation
          </Link>
        </div>
      </header>
      <main className="main-content">
        {isDocumentation ? (
          <Outlet />
        ) : !token ? (
          <AccessTokenForm onConnect={connect} />
        ) : (
          <>
            <div className="session-bar">
              <span>Connected for this tab</span>
              <button
                type="button"
                className="button-text"
                onClick={disconnect}
              >
                Disconnect
              </button>
            </div>
            <Outlet />
          </>
        )}
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope: Scope; cursor?: string } => ({
    scope: search.scope === "reviewable" ? "reviewable" : "mine",
    ...(typeof search.cursor === "string" && search.cursor.length > 0
      ? { cursor: search.cursor }
      : {}),
  }),
  component: ListPage,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/requests/$id",
  component: DetailPage,
});
const documentationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/docs",
  component: DocumentationPage,
});
const routeTree = rootRoute.addChildren([
  listRoute,
  detailRoute,
  documentationRoute,
]);
const router = createRouter({ routeTree, defaultPreload: "intent" });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function ListPage() {
  const { token } = useCredential();
  const search = listRoute.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const key = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [search.scope, search.cursor]);
  const page = useQuery({
    queryKey: ["approval", "list", search.scope, search.cursor ?? ""],
    queryFn: () => approvalApi(token!).list(search.scope, search.cursor),
    enabled: !!token,
  });
  const create = useMutation({
    mutationFn: () =>
      approvalApi(token!).create(
        title.trim(),
        description.trim() || null,
        key.current,
      ),
    onSuccess: async (item) => {
      key.current = crypto.randomUUID();
      setTitle("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["approval", "list"] });
      await navigate({ to: "/requests/$id", params: { id: item.id } });
    },
  });
  function createRequest(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 ref={heading} tabIndex={-1}>
            Approval requests
          </h1>
          <p>Draft, submit, and decide requests through the Orion API.</p>
        </div>
      </div>
      <div className="two-column">
        <section className="panel" aria-labelledby="list-heading">
          <div className="section-heading">
            <h2 id="list-heading">Requests</h2>
            <button
              type="button"
              className="button-text"
              onClick={() => void page.refetch()}
              disabled={page.isFetching}
            >
              Refresh
            </button>
          </div>
          <nav aria-label="Request views" className="tabs">
            <Link
              to="/"
              search={{ scope: "mine" }}
              activeProps={{ "aria-current": "page" }}
              className={search.scope === "mine" ? "active" : ""}
            >
              My requests
            </Link>
            <Link
              to="/"
              search={{ scope: "reviewable" }}
              activeProps={{ "aria-current": "page" }}
              className={search.scope === "reviewable" ? "active" : ""}
            >
              For review
            </Link>
          </nav>
          {page.isPending ? (
            <p role="status">Loading requests…</p>
          ) : page.isError ? (
            <ErrorNotice error={page.error} />
          ) : page.data.items.length === 0 ? (
            <p className="empty-state">No requests in this view.</p>
          ) : (
            <ul className="request-list">
              {page.data.items.map((item) => (
                <li key={item.id}>
                  <Link to="/requests/$id" params={{ id: item.id }}>
                    <span className="request-title">{item.title}</span>
                    <span className="status-pill">{item.status}</span>
                    <small>
                      Updated {new Date(item.updatedAt).toLocaleString()}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {page.data && (
            <div className="pagination">
              {search.cursor && (
                <Link to="/" search={{ scope: search.scope }}>
                  First page
                </Link>
              )}
              {page.data.nextCursor && (
                <Link
                  to="/"
                  search={{ scope: search.scope, cursor: page.data.nextCursor }}
                >
                  Next page
                </Link>
              )}
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="create-heading">
          <p className="eyebrow">New request</p>
          <h2 id="create-heading">Start a draft</h2>
          <form className="form-stack" onSubmit={createRequest}>
            <label htmlFor="new-title">
              Title <span aria-hidden="true">*</span>
            </label>
            <input
              id="new-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
            <label htmlFor="new-description">Description</label>
            <textarea
              id="new-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={5}
            />
            <button
              type="submit"
              className="button-primary"
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create draft"}
            </button>
            {create.isError && (
              <ErrorNotice error={create.error} operation="create" />
            )}
          </form>
        </section>
      </div>
    </>
  );
}

type Action = "submit" | "approve" | "cancel" | "reject" | "edit";
function DetailPage() {
  const { token } = useCredential();
  const { id } = detailRoute.useParams();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useQuery({
    queryKey: ["approval", "detail", id],
    queryFn: () => approvalApi(token!).get(id),
    enabled: !!token,
  });
  useEffect(() => {
    if (request.isSuccess) heading.current?.focus();
  }, [id, request.isSuccess]);
  const mutation = useMutation({
    mutationFn: async ({
      action,
      item,
      title,
      description,
    }: {
      action: Action;
      item: ApprovalRequest;
      title?: string;
      description?: string | null;
    }) => {
      const api = approvalApi(token!);
      switch (action) {
        case "submit":
          return api.submit(id, item.version);
        case "approve":
          return api.approve(id, item.version);
        case "cancel":
          return api.cancel(id, item.version);
        case "reject":
          return api.reject(id, item.version, reason.trim());
        case "edit":
          return api.edit(id, item.version, title!, description ?? null);
      }
    },
    onSuccess: async (updated) => {
      qc.setQueryData(["approval", "detail", id], updated);
      await qc.invalidateQueries({ queryKey: ["approval", "list"] });
      setReason("");
      setMessage("Request updated.");
    },
    onError: () => setMessage(""),
  });
  function act(
    action: Action,
    item: ApprovalRequest,
    title?: string,
    description?: string | null,
  ) {
    mutation.reset();
    setMessage("");
    mutation.mutate({ action, item, title, description });
  }
  function edit(event: FormEvent<HTMLFormElement>, item: ApprovalRequest) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const rawTitle = fields.get("title");
    const rawDescription = fields.get("description");
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const description =
      typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (title) act("edit", item, title, description || null);
  }
  return (
    <>
      <p>
        <Link to="/" search={{ scope: "mine" }}>
          ← All requests
        </Link>
      </p>
      {request.isPending ? (
        <p role="status">Loading request…</p>
      ) : request.isError ? (
        <ErrorNotice error={request.error} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">Request {request.data.id}</p>
              <h1 ref={heading} tabIndex={-1}>
                {request.data.title}
              </h1>
              <p>
                <span className="status-pill">{request.data.status}</span> ·
                Version {request.data.version}
              </p>
            </div>
          </div>
          <div className="two-column">
            <section className="panel" aria-labelledby="details-heading">
              <h2 id="details-heading">Details</h2>
              <p className="description">
                {request.data.description || "No description provided."}
              </p>
              {request.data.rejectionReason && (
                <p>
                  <strong>Rejection reason:</strong>{" "}
                  {request.data.rejectionReason}
                </p>
              )}
              <dl className="metadata">
                <dt>Created</dt>
                <dd>{new Date(request.data.createdAt).toLocaleString()}</dd>
                <dt>Updated</dt>
                <dd>{new Date(request.data.updatedAt).toLocaleString()}</dd>
              </dl>
              {request.data.status === "DRAFT" && (
                <form
                  key={request.data.version}
                  className="form-stack edit-form"
                  onSubmit={(event) => edit(event, request.data)}
                >
                  <h3>Edit draft</h3>
                  <label htmlFor="edit-title">Title</label>
                  <input
                    id="edit-title"
                    name="title"
                    defaultValue={request.data.title}
                    maxLength={200}
                    required
                  />
                  <label htmlFor="edit-description">Description</label>
                  <textarea
                    id="edit-description"
                    name="description"
                    defaultValue={request.data.description ?? ""}
                    maxLength={2000}
                    rows={5}
                  />
                  <button type="submit" disabled={mutation.isPending}>
                    Save draft
                  </button>
                </form>
              )}
            </section>
            <section className="panel" aria-labelledby="actions-heading">
              <h2 id="actions-heading">Actions</h2>
              <p className="hint">
                The API verifies ownership, review capability, and current
                version for every action.
              </p>
              {request.data.status === "DRAFT" && (
                <div className="action-group">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={mutation.isPending}
                    onClick={() => act("submit", request.data)}
                  >
                    Submit for review
                  </button>
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => act("cancel", request.data)}
                  >
                    Cancel request
                  </button>
                </div>
              )}
              {request.data.status === "SUBMITTED" && (
                <>
                  <div className="action-group">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={mutation.isPending}
                      onClick={() => act("approve", request.data)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => act("cancel", request.data)}
                    >
                      Cancel request
                    </button>
                  </div>
                  <form
                    className="form-stack reject-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (reason.trim()) act("reject", request.data);
                    }}
                  >
                    <label htmlFor="reject-reason">Rejection reason</label>
                    <textarea
                      id="reject-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={2000}
                      required
                      rows={4}
                    />
                    <button type="submit" disabled={mutation.isPending}>
                      Reject with reason
                    </button>
                  </form>
                </>
              )}
              {!["DRAFT", "SUBMITTED"].includes(request.data.status) && (
                <p className="empty-state">
                  This request is complete. No further changes are available.
                </p>
              )}
              {mutation.isPending && <p role="status">Saving…</p>}
              {message && (
                <p role="status" className="notice notice-success">
                  {message}
                </p>
              )}
              {mutation.isError && (
                <ErrorNotice
                  error={mutation.error}
                  operation="write"
                  onReload={() => {
                    mutation.reset();
                    void request.refetch();
                  }}
                />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CredentialProvider>
        <RouterProvider router={router} />
      </CredentialProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
