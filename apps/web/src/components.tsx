import { failureMessage, type FailureOperation } from "./api-client.js";

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
