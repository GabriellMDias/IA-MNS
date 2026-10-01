import {
  freePort,
  startApi,
  startDatabase,
  startIssuer,
  startWeb,
  stopAll,
  type Stoppable,
} from "../stack.ts";

export type ApprovalRequestsStack = {
  webUrl: string;
  apiUrl: string;
  ownerToken: string;
  reviewerToken: string;
  stop(): Promise<void>;
};

/**
 * The Approval Request reference workflow on a disposable migrated database
 * with synthetic owner and reviewer identities. Foundation-only.
 */
export async function startApprovalRequestsStack({
  tokenLifetime = "15m",
  apiEnvironment = "test",
  onUnexpectedExit,
}: {
  tokenLifetime?: string;
  apiEnvironment?: "development" | "test";
  onUnexpectedExit?: (error: Error) => void;
} = {}): Promise<ApprovalRequestsStack> {
  const resources: Stoppable[] = [];
  let shuttingDown = false;
  const stop = async () => {
    shuttingDown = true;
    await stopAll(resources.toReversed());
  };
  try {
    const database = await startDatabase();
    resources.push(database);
    const webPort = await freePort();
    const issuer = await startIssuer({
      identities: {
        owner: { scope: "" },
        reviewer: { scope: "approval:review" },
      },
      browserOrigin: `http://127.0.0.1:${webPort}`,
      tokenLifetime,
    });
    resources.push(issuer);
    const secrets = [
      database.migrationUrl,
      database.runtimeUrl,
      ...Object.values(issuer.tokens),
    ];
    const api = await startApi({
      environment: apiEnvironment,
      env: {
        ORION_DATABASE_URL: database.runtimeUrl,
        ORION_TOKEN_ISSUER: issuer.issuer,
        ORION_TOKEN_AUDIENCE: issuer.audience,
        ORION_TOKEN_JWKS_URL: issuer.jwksUrl,
      },
      secrets,
    });
    resources.push(api);
    const web = await startWeb({
      apiUrl: api.url,
      identityUrl: issuer.url,
      port: webPort,
      secrets,
    });
    resources.push(web);
    if (onUnexpectedExit) {
      const report = (error: Error) => {
        if (!shuttingDown) onUnexpectedExit(error);
      };
      api.service.onFailure(report);
      web.service.onFailure(report);
    }
    return {
      webUrl: web.url,
      apiUrl: api.url,
      ownerToken: issuer.tokens.owner,
      reviewerToken: issuer.tokens.reviewer,
      stop,
    };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Setup and cleanup failed.",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
