import { useState } from "react";
import { AccessTokenForm, ErrorNotice } from "../components.js";
import { ApiFailure } from "../api.js";

export function Example({ id }: { id: string }) {
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
