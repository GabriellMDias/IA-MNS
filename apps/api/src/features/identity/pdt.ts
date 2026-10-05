import { normalizeEmail } from "./domain.js";

// Client for the PDT Connect identity contract v1 (pdt-api guides/integration-identity.md).
// Authorization code + PKCE S256, confidential client headers, opaque 5-minute
// identity:read token, identity lookup and revocation. Not OpenID Connect.

export type PdtConfig = Readonly<{
  baseUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

export type PdtIdentity = Readonly<{
  issuer: string;
  subject: string;
  name: string | null;
  email: string | null;
  permissionCount: number;
  superAdmin: boolean;
}>;

export class PdtFailure extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`PDT identity: ${reason}`);
    this.name = "PdtFailure";
    this.reason = reason;
  }
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PdtIdentityClient {
  readonly config: PdtConfig;
  private readonly fetcher: typeof fetch;
  constructor(config: PdtConfig, fetcher: typeof fetch = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }

  authorizeUrl(state: string, codeChallenge: string): string {
    const url = new URL("/integrations/authorize", this.config.baseUrl);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  private headers() {
    return {
      "X-PDT-Client-Id": this.config.clientId,
      "X-PDT-Client-Secret": this.config.clientSecret,
    };
  }

  /**
   * Redeems a code server-side and returns the verified identity. The opaque
   * PDT token is revoked immediately; IA-MNS never keeps it.
   */
  async redeem(
    code: string,
    verifier: string,
    iss: string,
  ): Promise<PdtIdentity> {
    if (iss !== this.config.issuer) throw new PdtFailure("issuer_mismatch");
    if (!/^[A-Za-z0-9_-]{43}$/.test(code))
      throw new PdtFailure("malformed_code");
    const token = await this.call("/api/auth/integrations/token", {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: verifier,
      }),
    });
    if (token.status === 400 || token.status === 401)
      throw new PdtFailure("code_rejected");
    if (token.status !== 200)
      throw new Error(`PDT token endpoint status ${token.status}`);
    const tokenBody = (await token.json()) as {
      accessToken?: unknown;
      scope?: unknown;
    };
    if (
      typeof tokenBody.accessToken !== "string" ||
      tokenBody.scope !== "identity:read"
    )
      throw new Error("Unexpected PDT token response");
    const auth = {
      ...this.headers(),
      Authorization: `Bearer ${tokenBody.accessToken}`,
    };
    try {
      const response = await this.call("/api/auth/integrations/identity", {
        headers: auth,
      });
      if (response.status === 401) throw new PdtFailure("identity_unavailable");
      if (response.status !== 200)
        throw new Error(`PDT identity endpoint status ${response.status}`);
      const body = (await response.json()) as Record<string, unknown>;
      const user = body.user as Record<string, unknown> | undefined;
      const authorization = body.authorization as
        Record<string, unknown> | undefined;
      if (
        body.contractVersion !== 1 ||
        body.issuer !== this.config.issuer ||
        body.audience !== this.config.clientId ||
        body.authenticated !== true ||
        typeof body.subject !== "string" ||
        !uuid.test(body.subject) ||
        user?.activeStatus !== true
      )
        throw new PdtFailure("identity_binding_mismatch");
      return {
        issuer: this.config.issuer,
        subject: body.subject.toLowerCase(),
        name:
          typeof user.name === "string" && user.name.trim()
            ? user.name.trim().slice(0, 120)
            : null,
        email: normalizeEmail(user.email),
        permissionCount: Array.isArray(authorization?.permissions)
          ? authorization.permissions.length
          : 0,
        superAdmin: authorization?.superAdmin === true,
      };
    } finally {
      // Best effort; the token also expires within five minutes.
      await this.call("/api/auth/integrations/revoke", {
        method: "POST",
        headers: auth,
      }).catch(() => undefined);
    }
  }

  private call(path: string, init: RequestInit) {
    return this.fetcher(new URL(path, this.config.baseUrl), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  }
}
