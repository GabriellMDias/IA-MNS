import { failureMessage, type FailureOperation } from "./api-client.js";
import { useId, type ComponentProps, type ReactNode } from "react";
import "./components.css";

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`ui-button ui-button-${variant} ${className}`}
    >
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  className = "",
  "aria-describedby": describedBy,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const description =
    [describedBy, hint && `${inputId}-hint`, error && `${inputId}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="ui-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        className={`ui-input ${className}`}
        aria-describedby={description}
        aria-invalid={error ? true : props["aria-invalid"]}
      />
      {hint && (
        <span className="ui-field-hint" id={`${inputId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ui-field-error" id={`${inputId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  className = "",
  "aria-describedby": describedBy,
  children,
  ...props
}: ComponentProps<"select"> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const description =
    [describedBy, hint && `${selectId}-hint`, error && `${selectId}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="ui-field">
      <label htmlFor={selectId}>{label}</label>
      <select
        {...props}
        id={selectId}
        className={`ui-input ${className}`}
        aria-describedby={description}
        aria-invalid={error ? true : props["aria-invalid"]}
      >
        {children}
      </select>
      {hint && (
        <span className="ui-field-hint" id={`${selectId}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="ui-field-error" id={`${selectId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  back?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      {back && <div className="ui-page-back">{back}</div>}
      <div className="ui-page-heading">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="ui-page-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionCard({
  title,
  description,
  icon,
  children,
  className = "",
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      {...props}
      className={`ui-card ${className}`}
      aria-labelledby={titleId}
    >
      <header className="ui-card-heading">
        {icon && (
          <span className="ui-card-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function ErrorNotice({
  error,
  onReload,
  operation = "read",
  messages,
  reloadLabel = "Reload",
}: {
  error: unknown;
  onReload?: () => void;
  operation?: FailureOperation;
  messages?: Readonly<Record<string, string>>;
  reloadLabel?: string;
}) {
  return (
    <div role="alert" className="notice notice-error">
      <strong>{failureMessage(error, operation, messages)}</strong>
      {onReload && (
        <button type="button" onClick={onReload}>
          {reloadLabel}
        </button>
      )}
    </div>
  );
}
