import { useEffect, useRef, useState } from "react";
import documentation from "./generated/documentation.json";
import { AccessTokenForm, ErrorNotice } from "./components.js";
import { ApiFailure } from "./api.js";
import openapiUrl from "../../../docs/generated/api/openapi.json?url";
import errorsUrl from "../../../docs/generated/api/errors.md?url";
import databaseUrl from "../../../docs/generated/database/approval-requests.md?url";
import componentsUrl from "../../../docs/generated/components/web.md?url";

const source = "https://github.com/GabriellMDias/Orion/blob/main/";
type Field = { name: string; type: string; required: boolean };

function FieldTable({ fields }: { fields: Field[] }) {
  if (!fields.length) return <p className="docs-muted">No fields declared.</p>;
  return (
    <div className="docs-table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Type and constraints</th>
            <th scope="col">Required</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <th scope="row">
                <code>{field.name}</code>
              </th>
              <td>
                <code>{field.type}</code>
              </td>
              <td>{field.required ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApiSection() {
  return (
    <section id="api" className="docs-section" aria-labelledby="api-title">
      <div className="docs-section-heading">
        <div>
          <p className="eyebrow">Executable contracts</p>
          <h2 id="api-title">API</h2>
          <p>
            {documentation.api.operations.length} operations from the generated
            OpenAPI {documentation.api.version} contract.
          </p>
        </div>
        <a href={openapiUrl}>OpenAPI 3.1 JSON ↗</a>
      </div>
      <p>
        Contracts and route metadata come from the{" "}
        <a
          href={`${source}apps/api/src/features/approval-requests/contracts.ts`}
        >
          API source
        </a>
        . Expected HTTP statuses are listed per operation; the public error
        registry below owns stable error codes. Authorization details are in the{" "}
        <a href={`${source}docs/domains/approval-request.md`}>
          domain specification
        </a>
        .
      </p>
      <nav aria-label="API operations" className="docs-chip-nav">
        {documentation.api.operations.map((operation) => (
          <a key={operation.operationId} href={`#${operation.operationId}`}>
            {operation.operationId}
          </a>
        ))}
      </nav>
      {documentation.api.operations.map((operation) => (
        <article
          id={operation.operationId}
          key={operation.operationId}
          className="docs-card"
        >
          <div className="docs-operation-heading">
            <span className="docs-method">{operation.method}</span>
            <code>{operation.path}</code>
          </div>
          <h3>{operation.operationId}</h3>
          <p>
            <strong>Authentication:</strong> {operation.authentication}
          </p>
          {operation.parameters.length > 0 && (
            <>
              <h4>Parameters</h4>
              <div className="docs-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Location</th>
                      <th scope="col">Type and constraints</th>
                      <th scope="col">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operation.parameters.map((parameter) => (
                      <tr key={`${parameter.in}-${parameter.name}`}>
                        <th scope="row">
                          <code>{parameter.name}</code>
                        </th>
                        <td>{parameter.in}</td>
                        <td>
                          <code>{parameter.type}</code>
                        </td>
                        <td>{parameter.required ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {operation.request && (
            <>
              <h4>JSON request body</h4>
              <FieldTable fields={operation.request.fields} />
            </>
          )}
          <h4>Responses</h4>
          <p className="docs-statuses">
            {operation.responses.map((response) => (
              <span key={response.status}>{response.status}</span>
            ))}
          </p>
          {operation.responses
            .filter(
              (response) =>
                response.status.startsWith("2") && response.fields.length > 0,
            )
            .map((response) => (
              <div key={response.status}>
                <h4>{response.status} JSON fields</h4>
                <FieldTable fields={response.fields} />
              </div>
            ))}
          <a href="#api-title" className="docs-back">
            Back to API ↑
          </a>
        </article>
      ))}
      <article id="errors" className="docs-card">
        <div className="docs-section-heading">
          <h3>Stable public errors</h3>
          <a href={errorsUrl}>AI-readable error registry ↗</a>
        </div>
        <p>
          These codes are registered by the API. An operation's status list does
          not imply every code at that status is possible for that operation.
        </p>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">HTTP</th>
                <th scope="col">Category</th>
                <th scope="col">Retryable</th>
                <th scope="col">Public message</th>
              </tr>
            </thead>
            <tbody>
              {documentation.api.errors.map((error) => (
                <tr key={error.Code}>
                  <th scope="row">
                    <code>{error.Code}</code>
                  </th>
                  <td>{error["HTTP status"]}</td>
                  <td>{error.Category}</td>
                  <td>{error.Retryable}</td>
                  <td>{error["Public message"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>Error envelope fields</h4>
        <FieldTable
          fields={
            documentation.api.operations
              .flatMap((operation) => operation.responses)
              .find((response) => response.status === "400")?.fields ?? []
          }
        />
      </article>
    </section>
  );
}

function DatabaseSection() {
  return (
    <section
      id="database"
      className="docs-section"
      aria-labelledby="database-title"
    >
      <div className="docs-section-heading">
        <div>
          <p className="eyebrow">Migrated PostgreSQL</p>
          <h2 id="database-title">Database &amp; data dictionary</h2>
        </div>
        <a href={databaseUrl}>AI-readable database reference ↗</a>
      </div>
      <p>
        Physical structure comes from a migrated database; meaning comes from{" "}
        <a href={`${source}apps/api/prisma/schema-metadata.json`}>
          schema-adjacent metadata
        </a>
        . Review the{" "}
        <a href={`${source}docs/database/schema-documentation.md`}>
          schema documentation policy
        </a>{" "}
        for ownership and generation rules.
      </p>
      {documentation.database.tables.map((table) => (
        <article key={table.name} className="docs-card">
          <h3>
            <code>{table.name}</code>
          </h3>
          <p>{table.description}</p>
          <dl className="docs-facts">
            <div>
              <dt>Owner</dt>
              <dd>{table.owner}</dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{table.classification}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{table.lifecycle}</dd>
            </div>
          </dl>
          <h4>Columns</h4>
          <div className="docs-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">PostgreSQL type</th>
                  <th scope="col">Null / default</th>
                  <th scope="col">Meaning</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Unit</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((column) => (
                  <tr key={column.Column}>
                    <th scope="row">
                      <code>{column.Column}</code>
                    </th>
                    <td>
                      <code>{column["PostgreSQL type"]}</code>
                    </td>
                    <td>
                      {column.Nullable === "yes" ? (
                        <>Nullable. {column["Null meaning"]}</>
                      ) : (
                        "Required"
                      )}
                      <br />
                      Default: {column.Default}
                    </td>
                    <td>{column.Meaning}</td>
                    <td>{column.Classification}</td>
                    <td>{column.Unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Constraints and indexes</h4>
          <div className="docs-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Object</th>
                  <th scope="col">Purpose</th>
                  <th scope="col">Physical definition</th>
                </tr>
              </thead>
              <tbody>
                {table.constraints.map((constraint) => (
                  <tr key={constraint.Object}>
                    <th scope="row">
                      <code>{constraint.Object}</code>
                    </th>
                    <td>{constraint.Purpose}</td>
                    <td>
                      <code>{constraint["Physical definition"]}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
      <article className="docs-card">
        <h3>Database enums</h3>
        <div className="docs-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Enum</th>
                <th scope="col">Values</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {documentation.database.enums.map((item) => (
                <tr key={item.Enum}>
                  <th scope="row">
                    <code>{item.Enum}</code>
                  </th>
                  <td>{item.Values}</td>
                  <td>{item.Meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function Example({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  switch (id) {
    case "access-token":
      return (
        <div className="docs-preview">
          <AccessTokenForm
            showLocalIdentity={false}
            onConnect={() =>
              setMessage(
                "Demonstration value discarded; no connection was made.",
              )
            }
          />
          {message && <p role="status">{message}</p>}
        </div>
      );
    case "version-conflict":
      return (
        <div className="docs-preview">
          <ErrorNotice
            error={
              new ApiFailure(
                409,
                "RESOURCE_VERSION_CONFLICT",
                "example",
                "Changed",
              )
            }
            onReload={() =>
              setMessage("Demonstration reload selected; no request was made.")
            }
          />
          {message && <p role="status">{message}</p>}
        </div>
      );
    default:
      return null;
  }
}

function ComponentsSection() {
  return (
    <section
      id="components"
      className="docs-section"
      aria-labelledby="components-title"
    >
      <div className="docs-section-heading">
        <div>
          <p className="eyebrow">Actual web source</p>
          <h2 id="components-title">Frontend components</h2>
        </div>
        <a href={componentsUrl}>AI-readable component reference ↗</a>
      </div>
      <p>
        These entries come from{" "}
        <a href={`${source}apps/web/src/components.tsx`}>exported components</a>{" "}
        and{" "}
        <a href={`${source}apps/web/src/components.docs.json`}>
          component-owned metadata
        </a>
        . Examples render the real components with synthetic, non-secret inputs.
      </p>
      {documentation.components.map((component) => (
        <article className="docs-card" key={component.name}>
          <h3>{component.name}</h3>
          <p>{component.summary}</p>
          <h4>Props</h4>
          <div className="docs-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Prop</th>
                  <th scope="col">Type</th>
                  <th scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {component.props.map((prop) => (
                  <tr key={prop.name}>
                    <th scope="row">
                      <code>{prop.name}</code>
                    </th>
                    <td>
                      <code>{prop.type}</code>
                    </td>
                    <td>{prop.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>States</h4>
          <ul>
            {component.states.map((state) => (
              <li key={state}>{state}</li>
            ))}
          </ul>
          <p>
            <strong>Accessibility:</strong> {component.accessibility}
          </p>
          <p>
            <strong>Usage:</strong> {component.usage}
          </p>
          <h4>Live examples</h4>
          {component.examples.map((example) => (
            <div key={example.id}>
              <h5>{example.label}</h5>
              <p>{example.description}</p>
              <Example id={example.id} />
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

export function DocumentationPage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Living Documentation · Orion";
    heading.current?.focus();
    return () => {
      document.title = previousTitle;
    };
  }, []);
  return (
    <div className="docs-layout">
      <aside className="docs-sidebar">
        <p className="eyebrow">Living documentation</p>
        <nav aria-label="Documentation sections">
          <a href="#api">API</a>
          <a href="#errors">Public errors</a>
          <a href="#database">Database &amp; dictionary</a>
          <a href="#components">Components</a>
        </nav>
        <div className="docs-sidebar-links">
          <a href={`${source}docs/domains/approval-request.md`}>
            Business specification ↗
          </a>
          <a href={`${source}docs/architecture/living-documentation.md`}>
            Documentation architecture ↗
          </a>
        </div>
      </aside>
      <div className="docs-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Current repository · generated facts</p>
            <h1 ref={heading} tabIndex={-1}>
              Orion living documentation
            </h1>
            <p>
              Explore the API contract, migrated data model, and components used
              by the reference workflow.
            </p>
          </div>
        </div>
        <ApiSection />
        <DatabaseSection />
        <ComponentsSection />
      </div>
    </div>
  );
}
