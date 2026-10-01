import { useState } from "react";
import { ErrorNotice } from "../components.js";
import { ApiFailure } from "../api-client.js";

export function Example({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  switch (id) {
    case "unavailable-reload":
      return (
        <div className="docs-preview">
          <ErrorNotice
            error={
              new ApiFailure(
                503,
                "SERVICE_UNAVAILABLE",
                "example",
                "The service is unavailable.",
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
