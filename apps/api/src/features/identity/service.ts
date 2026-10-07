import type { AccessTokenIssuer } from "./tokens.js";
import type {
  ExternalAccount,
  IdentityRepository,
  OwnershipTransfer,
  PersonSnapshot,
  SessionRecord,
  TicketPurpose,
} from "./repository.js";
import type { PdtIdentityClient } from "./pdt.js";
import { PdtFailure } from "./pdt.js";
import type { SankhyaIdentityConnector } from "./sankhya.js";
import { SankhyaFailure } from "./sankhya.js";
import type { SankhyaDirectory, SankhyaUser } from "./sankhya-directory.js";
import { IdentityFailure } from "./errors.js";
import {
  ADMIN_PERMISSION,
  defaultSecurityPolicy,
  effectivePermissions,
  effectivePolicy,
  lifetimes,
  policyLimits,
  policyProblems,
  policyWarnings,
  rememberDeviceDaysFor,
  secondFactorRequired,
  normalizeDisplayName,
  normalizeLogin,
  passwordProblem,
  type Assurance,
  type PermissionDescriptor,
  type Provider,
  type ProviderGrant,
  type SecurityPolicy,
  type SessionMethod,
  type Surface,
} from "./domain.js";
import {
  burnPasswordCheck,
  hashPassword,
  matchTotp,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  pkceChallenge,
  randomSecret,
  recoveryCodes,
  seal,
  sha256,
  unseal,
  verifyPassword,
  base32Encode,
} from "./secrets.js";

export type Intent = "login" | "link" | "reauth" | "invite";
export type SignInMethod = "local" | Provider;
export type Authenticated = {
  kind: "authenticated";
  accessToken: string;
  expiresIn: number;
  /** Only for direct sessions; delivered as an HttpOnly cookie, never JSON. */
  refreshToken: string | null;
  sessionId: string;
  /** This sign-in created the Person automatically (first access). */
  provisioned: boolean;
  /** Provider linked by this sign-in (link invitation), if any. */
  linked: Provider | null;
  /** The sign-in proved a suggested profile during a pending first access. */
  resumeFirstAccess: boolean;
  /** Absolute end of a direct session (refresh cookie lifetime). */
  sessionExpiresAt: Date | null;
  /** New remembered-browser token, delivered only as an HttpOnly cookie. */
  rememberDevice: { token: string; days: number } | null;
};
/**
 * Why a first access stopped before creating a Person: another active Person
 * reported the same e-mail through another system (`candidate`), or the
 * browser is already signed in to a profile (`signed_in`).
 */
export type ProvisionReason = "candidate" | "signed_in";
export type FlowOutcome =
  | Authenticated
  | {
      kind: "mfa_required";
      challenge: string;
      /** Days this browser may be remembered after the code; 0 = not offered. */
      rememberDeviceDays: number;
    }
  | { kind: "mfa_enrollment_required"; challenge: string }
  | {
      kind: "provision_required";
      ticket: string;
      provider: Provider;
      label: string | null;
      reason: ProvisionReason;
      methods: SignInMethod[];
    }
  | { kind: "merge_available"; ticket: string; provider: Provider }
  | { kind: "linked"; provider: Provider }
  | { kind: "reauthenticated" };

export type IdentityProviders = {
  pdt?: {
    client: PdtIdentityClient;
    embedOrigin: string | null;
    /** The registered callback is on this IA-MNS origin, where the direct flow's binding cookie lives. */
    directCallback: boolean;
  };
  sankhya?: {
    /** Session-assertion sign-in; absent until the Om add-on is configured. */
    connector?: SankhyaIdentityConnector;
    issuer: string;
    authorizeUrl: string | null;
    embedOrigin: string | null;
    /** Read-only lookup of real Sankhya users for owner-attested links. */
    directory?: SankhyaDirectory;
  };
};

type Clock = () => Date;
type StartOptions = {
  /** Token of an owner-issued link invitation (`invite` intent). */
  invitation?: string | undefined;
  /** Person already signed in on this browser when a `login` flow starts. */
  signedInPersonId?: string | null;
  /** Return to the pending first access after signing in (direct surface). */
  resumeFirstAccess?: boolean;
};

/** Identity application operations. Transport-independent; no Fastify types. */
export class IdentityService {
  private readonly repository: IdentityRepository;
  private readonly issuer: AccessTokenIssuer;
  readonly catalog: readonly PermissionDescriptor[];
  readonly policy: readonly ProviderGrant[];
  private readonly encryptionKey: Buffer;
  readonly providers: IdentityProviders;
  private readonly transfer: OwnershipTransfer;
  private readonly production: boolean;
  private readonly now: Clock;
  private policyCache: { value: SecurityPolicy; at: number } | null = null;
  constructor(
    repository: IdentityRepository,
    issuer: AccessTokenIssuer,
    catalog: readonly PermissionDescriptor[],
    policy: readonly ProviderGrant[],
    encryptionKey: Buffer,
    providers: IdentityProviders,
    transfer: OwnershipTransfer,
    production: boolean,
    now: Clock = () => new Date(),
  ) {
    this.repository = repository;
    this.issuer = issuer;
    this.catalog = catalog;
    this.policy = policy;
    this.encryptionKey = encryptionKey;
    this.providers = providers;
    this.transfer = transfer;
    this.production = production;
    this.now = now;
  }

  // ---------------- authentication policy ----------------
  /**
   * The enforced authentication policy (stored or default, with production
   * guarantees). Cached briefly; a change made through this process applies
   * at once, other API instances follow within the cache period.
   */
  async securityPolicy(): Promise<SecurityPolicy> {
    const at = Date.now();
    if (this.policyCache && at - this.policyCache.at < 15_000)
      return this.policyCache.value;
    const stored = await this.repository.policy();
    const value = effectivePolicy(
      stored
        ? {
            sessionMaxMinutes: stored.sessionMaxMinutes,
            idleTimeoutMinutes: stored.idleTimeoutMinutes,
            recentAuthMinutes: stored.recentAuthMinutes,
            adminRecentAuthMinutes: stored.adminRecentAuthMinutes,
            mfaRequirement: stored.mfaRequirement,
            rememberDeviceDays: stored.rememberDeviceDays,
          }
        : defaultSecurityPolicy,
      this.production,
    );
    this.policyCache = { value, at };
    return value;
  }

  /** Whether people can sign in (prove an account) with this provider. */
  signInAvailable(provider: Provider): boolean {
    return provider === "pdt"
      ? Boolean(this.providers.pdt)
      : Boolean(this.providers.sankhya?.connector);
  }

  /**
   * Whether the direct URL can offer this provider: Sankhya also needs the
   * add-on authorize page; embedded sign-in only needs the connector.
   */
  directSignInAvailable(provider: Provider): boolean {
    return provider === "pdt"
      ? this.signInAvailable("pdt") &&
          Boolean(this.providers.pdt?.directCallback)
      : this.signInAvailable("sankhya") &&
          Boolean(this.providers.sankhya?.authorizeUrl);
  }

  directoryAvailable(): boolean {
    return Boolean(this.providers.sankhya?.directory);
  }

  // ---------------- sessions and tokens ----------------
  permissionsOf(snapshot: PersonSnapshot): string[] {
    return effectivePermissions({
      catalog: this.catalog,
      policy: this.policy,
      grants: snapshot.grants.map((item) => item.permission),
      linkedProviders: snapshot.links.map((item) => item.provider),
      roles: snapshot.roles,
    });
  }

  private async open(
    personId: string,
    method: SessionMethod,
    surface: Surface,
    assurance: Assurance,
    provisioned = false,
  ): Promise<Authenticated> {
    const now = this.now();
    const direct = surface === "direct";
    const refreshToken = direct ? randomSecret() : null;
    // Direct sessions follow the administrable policy; embedded sessions stay
    // short and renew silently through a new host proof.
    const policy = await this.securityPolicy();
    const absoluteMs = direct
      ? policy.sessionMaxMinutes * 60_000
      : lifetimes.embeddedSessionMs;
    const idleMs = direct
      ? Math.min(policy.idleTimeoutMinutes * 60_000, absoluteMs)
      : lifetimes.embeddedSessionMs;
    const session = await this.repository.createSession({
      personId,
      method,
      surface,
      assurance,
      refreshHash: refreshToken ? sha256(refreshToken) : null,
      now,
      expiresAt: new Date(now.getTime() + absoluteMs),
      idleExpiresAt: new Date(now.getTime() + idleMs),
    });
    await this.repository.audit("session.started", personId, personId, {
      method,
      surface,
      assurance,
    });
    return {
      ...(await this.tokenFor(session)),
      refreshToken,
      provisioned,
      sessionExpiresAt: direct ? session.expiresAt : null,
    };
  }

  private async tokenFor(session: SessionRecord): Promise<Authenticated> {
    const snapshot = await this.repository.snapshot(session.personId);
    if (!snapshot || snapshot.status !== "active")
      throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
    const token = await this.issuer.issue({
      personId: session.personId,
      sessionId: session.id,
      permissions: this.permissionsOf(snapshot),
      assurance: session.assurance,
      authTime: session.authTime,
    });
    return {
      kind: "authenticated",
      ...token,
      refreshToken: null,
      sessionId: session.id,
      provisioned: false,
      linked: null,
      resumeFirstAccess: false,
      sessionExpiresAt: null,
      rememberDevice: null,
    };
  }

  /** Validates an IA-MNS session for identity endpoints (revocation is immediate here). */
  async activeSession(sessionId: string | undefined): Promise<SessionRecord> {
    if (!sessionId) throw new IdentityFailure("IDENTITY_SESSION_EXPIRED");
    const session = await this.repository.session(sessionId);
    const now = this.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.personStatus !== "active"
    )
      throw new IdentityFailure("IDENTITY_SESSION_EXPIRED");
    return session;
  }

  /**
   * Renews a direct session. `active` reports user activity since the last
   * renewal; only activity postpones the inactivity deadline. A concurrent
   * renewal by another tab of the same browser receives a token without a new
   * credential (`refreshToken: null`); the browser keeps the winner's cookie.
   */
  async refresh(refreshToken: string, active = true): Promise<Authenticated> {
    const next = randomSecret();
    const policy = await this.securityPolicy();
    const rotated = await this.repository.rotateRefresh({
      refreshHash: sha256(refreshToken),
      nextHash: sha256(next),
      now: this.now(),
      idleMs: policy.idleTimeoutMinutes * 60_000,
      active,
      graceMs: lifetimes.refreshRaceGraceMs,
    });
    if (!("sessionId" in rotated)) {
      if (rotated.result === "reused")
        await this.repository.audit("session.refresh_reuse", null, null, {});
      throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
    }
    const session = await this.activeSession(rotated.sessionId);
    return {
      ...(await this.tokenFor(session)),
      refreshToken: rotated.result === "rotated" ? next : null,
      sessionExpiresAt: rotated.expiresAt,
    };
  }

  /** The Person signed in on this browser (direct-surface refresh cookie), if any. */
  async signedInPerson(
    refreshToken: string | undefined,
  ): Promise<string | null> {
    return refreshToken
      ? this.repository.personOfRefresh(sha256(refreshToken), this.now())
      : null;
  }

  async logout(sessionId: string) {
    const session = await this.repository.session(sessionId);
    if (
      session &&
      (await this.repository.revokeSession(sessionId, "logout", this.now()))
    )
      await this.repository.audit(
        "session.logout",
        session.personId,
        session.personId,
        {},
      );
  }

  /**
   * Sensitive changes need a sign-in or confirmation within the policy window:
   * `account` for one's own credentials and links, `admin` for administration.
   */
  private async requireRecent(
    session: SessionRecord,
    kind: "account" | "admin" = "account",
  ) {
    const policy = await this.securityPolicy();
    const minutes =
      kind === "admin"
        ? policy.adminRecentAuthMinutes
        : policy.recentAuthMinutes;
    if (this.now().getTime() - session.authTime.getTime() > minutes * 60_000)
      throw new IdentityFailure("IDENTITY_RECENT_AUTHENTICATION_REQUIRED");
  }

  // ---------------- local sign-in ----------------
  async loginLocal(
    loginInput: string,
    password: string,
    surface: Surface,
    rememberedDevice?: string,
  ): Promise<FlowOutcome> {
    const login = normalizeLogin(loginInput);
    const credential = login
      ? await this.repository.credentialByLogin(login)
      : null;
    const now = this.now();
    if (!credential) {
      await burnPasswordCheck(password);
      await this.repository.audit("login.local_failed", null, null, {
        reason: "unknown_login",
      });
      throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
    }
    const locked =
      credential.lockedUntil !== null && credential.lockedUntil > now;
    const valid = await verifyPassword(password, credential.passwordHash);
    if (locked || !valid || credential.person.status !== "active") {
      if (!locked && !valid)
        await this.repository.recordFailure(credential.personId, now);
      await this.repository.audit(
        "login.local_failed",
        null,
        credential.personId,
        {
          reason: locked ? "locked" : !valid ? "password" : "disabled",
        },
      );
      throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
    }
    const policy = await this.securityPolicy();
    const owner = await this.isOwner(credential.personId);
    if (credential.totpEnabledAt) {
      const rememberDays = this.rememberDays(policy, owner, surface);
      if (
        rememberDays > 0 &&
        rememberedDevice &&
        (await this.repository.useRememberedDevice(
          credential.personId,
          sha256(rememberedDevice),
          new Date(now.getTime() - rememberDays * 24 * 3600_000),
          now,
        ))
      ) {
        await this.repository.recordSuccess(credential.personId);
        await this.repository.audit(
          "login.remembered_device",
          credential.personId,
          credential.personId,
          {},
        );
        // A remembered browser skips the code but is not a strong session:
        // second-factor management still asks for the code.
        return this.open(credential.personId, "local", surface, "single");
      }
      const challenge = randomSecret();
      await this.repository.createTicket({
        purpose: "mfa",
        tokenHash: sha256(challenge),
        personId: credential.personId,
        payload: { surface },
        expiresAt: new Date(now.getTime() + lifetimes.mfaTicketMs),
      });
      return {
        kind: "mfa_required",
        challenge,
        rememberDeviceDays: rememberDays,
      };
    }
    if (secondFactorRequired(policy, owner)) {
      // The policy requires a second factor this person has not set up yet:
      // the password alone opens no session, only the enrollment.
      const challenge = randomSecret();
      await this.repository.createTicket({
        purpose: "mfa_enrollment",
        tokenHash: sha256(challenge),
        personId: credential.personId,
        payload: { surface },
        expiresAt: new Date(now.getTime() + lifetimes.totpSetupMs),
      });
      return { kind: "mfa_enrollment_required", challenge };
    }
    await this.repository.recordSuccess(credential.personId);
    return this.open(credential.personId, "local", surface, "single");
  }

  private async isOwner(personId: string): Promise<boolean> {
    return Boolean(
      (await this.repository.snapshot(personId))?.roles.includes("owner"),
    );
  }

  private rememberDays(
    policy: SecurityPolicy,
    owner: boolean,
    surface: Surface,
  ): number {
    return rememberDeviceDaysFor(policy, owner, surface === "direct");
  }

  /** Sign-in enrollment required by the policy: returns the secret once. */
  async startSignInEnrollment(challenge: string) {
    const now = this.now();
    const ticket = await this.repository.peekTicket(
      "mfa_enrollment",
      sha256(challenge),
      now,
    );
    if (!ticket?.personId) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const credential = await this.repository.credentialOf(ticket.personId);
    if (!credential || credential.totpEnabledAt)
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const secret = newTotpSecret();
    const setup = randomSecret();
    await this.repository.createTicket({
      purpose: "totp_setup",
      tokenHash: sha256(setup),
      personId: ticket.personId,
      payload: {
        sealed: seal(this.encryptionKey, secret),
        enrollment: sha256(challenge),
      },
      expiresAt: ticket.expiresAt,
    });
    return {
      setup,
      secret: base32Encode(secret),
      otpauthUri: otpauthUri(secret, credential.login),
    };
  }

  /** Confirms the enrollment code, enables the factor and opens a strong session. */
  async completeSignInEnrollment(
    challenge: string,
    setup: string,
    code: string,
  ) {
    const now = this.now();
    const enrollment = await this.repository.peekTicket(
      "mfa_enrollment",
      sha256(challenge),
      now,
    );
    const pending = await this.repository.peekTicket(
      "totp_setup",
      sha256(setup),
      now,
    );
    if (
      !enrollment?.personId ||
      !pending ||
      pending.personId !== enrollment.personId ||
      pending.payload.enrollment !== sha256(challenge)
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const sealed = String(pending.payload.sealed);
    const step = matchTotp(
      unseal(this.encryptionKey, sealed),
      code.trim(),
      now.getTime(),
      null,
    );
    if (step === null) throw new IdentityFailure("IDENTITY_INVALID_CODE");
    const consumed = await this.repository.consumeTicket(
      "mfa_enrollment",
      sha256(challenge),
      now,
    );
    if (
      !consumed ||
      !(await this.repository.consumeTicket("totp_setup", sha256(setup), now))
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const personId = enrollment.personId;
    const codes = recoveryCodes();
    await this.repository.enableTotp(
      personId,
      sealed,
      step,
      codes.map((item) => sha256(normalizeRecoveryCode(item))),
      now,
    );
    await this.repository.recordSuccess(personId);
    await this.repository.audit("mfa.enabled", personId, personId, {
      atSignIn: true,
    });
    return {
      recoveryCodes: codes,
      ...(await this.open(
        personId,
        "local",
        surfaceOf(consumed.payload.surface),
        "mfa",
      )),
    };
  }

  /** Verifies a TOTP or single-use recovery code for a Person. */
  private async verifySecondFactor(
    personId: string,
    code: string,
  ): Promise<boolean> {
    const credential = await this.repository.credentialOf(personId);
    if (!credential?.totpSecret || !credential.totpEnabledAt) return false;
    const now = this.now();
    if (/^\d{6}$/.test(code.trim())) {
      const step = matchTotp(
        unseal(this.encryptionKey, credential.totpSecret),
        code.trim(),
        now.getTime(),
        credential.totpLastStep === null
          ? null
          : Number(credential.totpLastStep),
      );
      return (
        step !== null && (await this.repository.acceptTotpStep(personId, step))
      );
    }
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return false;
    const used = await this.repository.consumeRecoveryCode(
      personId,
      sha256(normalized),
      now,
    );
    if (used)
      await this.repository.audit(
        "mfa.recovery_code_used",
        personId,
        personId,
        {},
      );
    return used;
  }

  async completeMfa(
    challenge: string,
    code: string,
    rememberDevice = false,
  ): Promise<Authenticated> {
    const now = this.now();
    const ticket = await this.repository.peekTicket(
      "mfa",
      sha256(challenge),
      now,
    );
    if (!ticket?.personId) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const credential = await this.repository.credentialOf(ticket.personId);
    if (credential?.lockedUntil && credential.lockedUntil > now)
      throw new IdentityFailure("IDENTITY_INVALID_CODE");
    if (!(await this.verifySecondFactor(ticket.personId, code))) {
      await this.repository.recordFailure(ticket.personId, now);
      await this.repository.audit(
        "login.mfa_failed",
        null,
        ticket.personId,
        {},
      );
      throw new IdentityFailure("IDENTITY_INVALID_CODE");
    }
    const consumed = await this.repository.consumeTicket(
      "mfa",
      sha256(challenge),
      now,
    );
    if (!consumed) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    await this.repository.recordSuccess(ticket.personId);
    const surface = surfaceOf(consumed.payload.surface);
    const authenticated = await this.open(
      ticket.personId,
      "local",
      surface,
      "mfa",
    );
    const days = this.rememberDays(
      await this.securityPolicy(),
      await this.isOwner(ticket.personId),
      surface,
    );
    if (!rememberDevice || days === 0) return authenticated;
    const token = randomSecret();
    await this.repository.rememberDevice(ticket.personId, sha256(token), now);
    await this.repository.audit(
      "mfa.device_remembered",
      ticket.personId,
      ticket.personId,
      { days },
    );
    return { ...authenticated, rememberDevice: { token, days } };
  }

  /** Step-up for local credentials: password plus second factor when enrolled. */
  async reauthenticateLocal(
    sessionId: string,
    password: string,
    code: string | undefined,
  ) {
    const session = await this.activeSession(sessionId);
    const credential = await this.repository.credentialOf(session.personId);
    if (!credential)
      throw new IdentityFailure("IDENTITY_LOCAL_CREDENTIAL_REQUIRED");
    const now = this.now();
    if (credential.lockedUntil && credential.lockedUntil > now)
      throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
    const passwordOk = await verifyPassword(password, credential.passwordHash);
    const factorOk = credential.totpEnabledAt
      ? code !== undefined &&
        passwordOk &&
        (await this.verifySecondFactor(session.personId, code))
      : true;
    if (!passwordOk || !factorOk) {
      await this.repository.recordFailure(session.personId, now);
      throw new IdentityFailure("IDENTITY_INVALID_CREDENTIALS");
    }
    await this.repository.recordSuccess(session.personId);
    const assurance: Assurance = credential.totpEnabledAt
      ? "mfa"
      : session.assurance;
    await this.repository.stepUp(session.id, assurance, now);
    await this.repository.audit(
      "session.reauthenticated",
      session.personId,
      session.personId,
      { method: "local" },
    );
    return this.tokenFor({ ...session, assurance, authTime: now });
  }

  // ---------------- external providers ----------------
  private requireSignIn(provider: Provider) {
    if (!this.signInAvailable(provider))
      throw new IdentityFailure("IDENTITY_METHOD_UNAVAILABLE");
  }

  /**
   * Flow context: the Person already signed in on this browser for `login`, the
   * session for link/reauth, or the pending invitation for `invite`.
   */
  private async intentContext(
    provider: Provider,
    intent: Intent,
    sessionId: string | undefined,
    options: StartOptions,
  ): Promise<Record<string, unknown>> {
    const invitation = options.invitation;
    if (intent === "login")
      return {
        ...(options.signedInPersonId
          ? { signedInPersonId: options.signedInPersonId }
          : {}),
        ...(options.resumeFirstAccess ? { resumeFirstAccess: true } : {}),
      };
    if (intent === "invite") {
      const ticket = invitation
        ? await this.repository.peekTicket(
            "link_invitation",
            sha256(invitation),
            this.now(),
          )
        : null;
      if (!ticket?.personId || ticket.payload.provider !== provider)
        throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
      return { invitation: sha256(invitation!) };
    }
    const session = await this.activeSession(sessionId);
    return { personId: session.personId, sessionId: session.id };
  }

  /** Direct surface: returns the provider URL; `binding` goes into a browser cookie. */
  async startDirect(
    provider: Provider,
    intent: Intent,
    sessionId: string | undefined,
    options: StartOptions = {},
  ) {
    this.requireSignIn(provider);
    if (!this.directSignInAvailable(provider))
      throw new IdentityFailure("IDENTITY_METHOD_UNAVAILABLE");
    const context = await this.intentContext(
      provider,
      intent,
      sessionId,
      options,
    );
    const state = randomSecret();
    const binding = randomSecret();
    const nonce = randomSecret();
    const verifier = randomSecret(48);
    const now = this.now();
    await this.repository.createTicket({
      purpose: provider === "pdt" ? "pdt_login" : "sankhya_login",
      tokenHash: sha256(state),
      payload: {
        intent,
        surface: "direct",
        binding: sha256(binding),
        nonce,
        verifier,
        ...context,
      },
      expiresAt: new Date(now.getTime() + lifetimes.providerFlowMs),
    });
    let url: string;
    if (provider === "pdt")
      url = this.providers.pdt!.client.authorizeUrl(
        state,
        pkceChallenge(verifier),
      );
    else {
      const authorize = this.providers.sankhya!.authorizeUrl;
      if (!authorize) throw new IdentityFailure("IDENTITY_METHOD_UNAVAILABLE");
      const target = new URL(authorize);
      target.searchParams.set("state", state);
      target.searchParams.set("nonce", nonce);
      url = target.toString();
    }
    return { url, binding };
  }

  /** Embedded surface: the browser keeps `pendingId` in memory instead of a cookie. */
  async startEmbedded(
    provider: Provider,
    intent: Intent,
    sessionId: string | undefined,
    options: StartOptions = {},
  ) {
    this.requireSignIn(provider);
    const context = await this.intentContext(
      provider,
      intent,
      sessionId,
      options,
    );
    const pendingId = randomSecret();
    const state = randomSecret();
    const nonce = randomSecret();
    const verifier = randomSecret(48);
    const now = this.now();
    await this.repository.createTicket({
      purpose: provider === "pdt" ? "pdt_login" : "sankhya_login",
      tokenHash: sha256(pendingId),
      payload: {
        intent,
        surface: provider,
        state,
        nonce,
        verifier,
        ...context,
      },
      expiresAt: new Date(now.getTime() + lifetimes.providerFlowMs),
    });
    return provider === "pdt"
      ? {
          pendingId,
          state,
          codeChallenge: pkceChallenge(verifier),
          clientId: this.providers.pdt!.client.config.clientId,
          redirectUri: this.providers.pdt!.client.config.redirectUri,
          hostOrigin: this.providers.pdt!.embedOrigin,
        }
      : {
          pendingId,
          nonce,
          hostOrigin: this.providers.sankhya!.embedOrigin,
        };
  }

  async completePdt(input: {
    lookup:
      { state: string; binding: string } | { pendingId: string; state: string };
    code: string;
    iss: string;
  }): Promise<FlowOutcome> {
    this.requireSignIn("pdt");
    const ticket = await this.consumeFlow("pdt_login", input.lookup);
    let identity;
    try {
      identity = await this.providers.pdt!.client.redeem(
        input.code,
        String(ticket.payload.verifier),
        input.iss,
      );
    } catch (error) {
      if (error instanceof PdtFailure) {
        await this.repository.audit("login.external_rejected", null, null, {
          provider: "pdt",
          reason: error.reason,
        });
        throw new IdentityFailure("IDENTITY_PROOF_REJECTED", error);
      }
      throw new IdentityFailure("IDENTITY_PROVIDER_UNAVAILABLE", error);
    }
    return this.resolveExternal(ticket.payload, {
      provider: "pdt",
      issuer: identity.issuer,
      subject: identity.subject,
      label: identity.name,
      email: identity.email,
    });
  }

  async completeSankhya(input: {
    lookup:
      | { state: string; binding: string }
      | { pendingId: string; state?: undefined };
    assertion: string;
  }): Promise<FlowOutcome> {
    this.requireSignIn("sankhya");
    const ticket = await this.consumeFlow("sankhya_login", input.lookup);
    let identity;
    try {
      identity = await this.providers.sankhya!.connector!.verify(
        input.assertion,
        String(ticket.payload.nonce),
      );
    } catch (error) {
      if (error instanceof SankhyaFailure) {
        await this.repository.audit("login.external_rejected", null, null, {
          provider: "sankhya",
          reason: error.reason,
        });
        throw new IdentityFailure("IDENTITY_PROOF_REJECTED", error);
      }
      throw error;
    }
    if (
      !(await this.repository.useAssertion(
        sha256(identity.jti),
        identity.expiresAt,
      ))
    ) {
      await this.repository.audit("login.external_rejected", null, null, {
        provider: "sankhya",
        reason: "replayed",
      });
      throw new IdentityFailure("IDENTITY_PROOF_REJECTED");
    }
    return this.resolveExternal(ticket.payload, {
      provider: "sankhya",
      issuer: identity.issuer,
      subject: identity.subject,
      label: identity.name,
      email: identity.email,
    });
  }

  private async consumeFlow(
    purpose: TicketPurpose,
    lookup:
      | { state: string; binding: string }
      | { pendingId: string; state?: string },
  ) {
    const key = "pendingId" in lookup ? lookup.pendingId : lookup.state;
    const ticket = await this.repository.consumeTicket(
      purpose,
      sha256(String(key)),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    if ("binding" in lookup) {
      if (
        ticket.payload.binding !== sha256(lookup.binding) ||
        ticket.payload.surface !== "direct"
      )
        throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    } else if (
      lookup.state !== undefined &&
      ticket.payload.state !== lookup.state
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    return ticket;
  }

  /** A Person whose only sign-in method is `linkId`, so proving it proves the whole profile. */
  private async absorbable(personId: string, linkId: string) {
    const snapshot = await this.repository.snapshot(personId);
    return Boolean(
      snapshot &&
      snapshot.status === "active" &&
      !snapshot.roles.includes("owner") &&
      snapshot.local === null &&
      snapshot.grants.length === 0 &&
      snapshot.links.length === 1 &&
      snapshot.links[0].id === linkId,
    );
  }

  private linkFailure(result: string) {
    if (result === "linked_elsewhere")
      throw new IdentityFailure("IDENTITY_LINK_CONFLICT");
    if (result === "provider_taken")
      throw new IdentityFailure("IDENTITY_PROVIDER_ALREADY_LINKED");
  }

  /**
   * Maps a verified external identity to a Person. A link is created only from a
   * proof in the right context (signed-in Person, invitation) or by owner
   * directory attestation; an e-mail match is a hint that stops automatic
   * creation, never evidence to link or merge.
   */
  private async resolveExternal(
    payload: Record<string, unknown>,
    identity: ExternalAccount,
  ): Promise<FlowOutcome> {
    const intent = payload.intent as Intent;
    const surface = surfaceOf(payload.surface);
    const now = this.now();
    const existing = await this.repository.findByLink(
      identity.provider,
      identity.issuer,
      identity.subject,
    );
    if (intent === "invite") {
      const invitation = await this.repository.peekTicket(
        "link_invitation",
        String(payload.invitation),
        now,
      );
      if (
        !invitation?.personId ||
        invitation.payload.provider !== identity.provider
      )
        throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
      const target = invitation.personId;
      if ((await this.repository.personStatus(target)) !== "active")
        throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
      if (existing && existing.person.id !== target) {
        // The account already signed in on its own (automatic first access).
        // The proof plus the owner's invitation consolidate that profile, but
        // only when it holds nothing except this account.
        if (!(await this.absorbable(existing.person.id, existing.id)))
          throw new IdentityFailure("IDENTITY_LINK_CONFLICT");
        this.mergeFailure(
          (
            await this.repository.merge({
              sourceId: existing.person.id,
              targetId: target,
              absorbableBy: { linkId: existing.id },
              transfer: this.transfer,
              now,
            })
          ).result,
        );
        await this.repository.audit(
          "person.merged",
          invitation.createdBy,
          target,
          {
            mode: "invitation",
            source: existing.person.id,
            provider: identity.provider,
          },
        );
      } else if (!existing) {
        this.linkFailure(
          await this.repository.addLink({ personId: target, ...identity }),
        );
        await this.repository.audit(
          "link.added",
          invitation.createdBy,
          target,
          {
            provider: identity.provider,
            via: "invitation",
          },
        );
      }
      await this.repository.consumeTicket(
        "link_invitation",
        String(payload.invitation),
        now,
      );
      return {
        ...(await this.open(target, identity.provider, surface, "single")),
        linked: identity.provider,
      };
    }
    if (intent === "link" || intent === "reauth") {
      const personId = String(payload.personId);
      const session = await this.activeSession(String(payload.sessionId));
      if (session.personId !== personId)
        throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
      if (intent === "reauth") {
        if (existing?.person.id !== personId)
          throw new IdentityFailure("IDENTITY_PROOF_REJECTED");
        await this.repository.touchLink(
          existing.id,
          identity.label,
          identity.email,
          now,
        );
        await this.repository.stepUp(session.id, session.assurance, now);
        await this.repository.audit(
          "session.reauthenticated",
          personId,
          personId,
          { method: identity.provider },
        );
        return { kind: "reauthenticated" };
      }
      await this.requireRecent(session);
      if (existing && existing.person.id !== personId) {
        // The person proved both profiles. Offer consolidation only when the other
        // profile holds nothing but this account; anything else needs the owner.
        if (!(await this.absorbable(existing.person.id, existing.id)))
          throw new IdentityFailure("IDENTITY_LINK_CONFLICT");
        const ticket = randomSecret();
        await this.repository.createTicket({
          purpose: "merge",
          tokenHash: sha256(ticket),
          personId,
          payload: {
            sourcePersonId: existing.person.id,
            linkId: existing.id,
            sessionId: session.id,
            provider: identity.provider,
          },
          expiresAt: new Date(now.getTime() + lifetimes.provisionTicketMs),
        });
        return {
          kind: "merge_available",
          ticket,
          provider: identity.provider,
        };
      }
      this.linkFailure(
        await this.repository.addLink({ personId, ...identity }),
      );
      await this.repository.audit("link.added", personId, personId, {
        provider: identity.provider,
      });
      return { kind: "linked", provider: identity.provider };
    }
    if (existing) {
      if (existing.person.status !== "active")
        throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
      await this.repository.touchLink(
        existing.id,
        identity.label,
        identity.email,
        now,
      );
      return {
        ...(await this.open(
          existing.person.id,
          identity.provider,
          surface,
          "single",
        )),
        resumeFirstAccess: payload.resumeFirstAccess === true,
      };
    }
    let reason: ProvisionReason | null =
      typeof payload.signedInPersonId === "string" ? "signed_in" : null;
    let methods: SignInMethod[] = [];
    if (!reason && identity.email) {
      // A profile that already has an account of this provider cannot also
      // own this one (one link per provider), so it is not a candidate.
      const candidates = (
        await this.repository.candidatesByEmail(identity.email, {
          provider: identity.provider,
          issuer: identity.issuer,
        })
      ).filter((item) => !item.methods.includes(identity.provider));
      if (candidates.length) {
        reason = "candidate";
        methods = [...new Set(candidates.flatMap((item) => item.methods))]
          .filter(
            (method) => method === "local" || this.signInAvailable(method),
          )
          .sort();
      }
    }
    if (!reason) {
      const { personId, created } = await this.createFromAccount(identity);
      if (created)
        await this.repository.audit("person.provisioned", personId, personId, {
          provider: identity.provider,
          automatic: true,
        });
      if ((await this.repository.personStatus(personId)) !== "active")
        throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
      return this.open(personId, identity.provider, surface, "single", created);
    }
    const ticket = randomSecret();
    await this.repository.createTicket({
      purpose: "provision",
      tokenHash: sha256(ticket),
      payload: { ...identity, surface, reason, methods },
      expiresAt: new Date(now.getTime() + lifetimes.provisionTicketMs),
    });
    return {
      kind: "provision_required",
      ticket,
      provider: identity.provider,
      label: identity.label,
      reason,
      methods,
    };
  }

  private createFromAccount(identity: ExternalAccount) {
    const displayName =
      normalizeDisplayName(identity.label ?? "") ??
      (identity.provider === "pdt"
        ? "Usuário PDT Connect"
        : `Usuário Sankhya ${identity.subject}`);
    return this.repository.createPersonWithLink({ displayName, ...identity });
  }

  /** What a pending first access is about, without consuming it. */
  async inspectProvision(ticketValue: string) {
    const ticket = await this.repository.peekTicket(
      "provision",
      sha256(ticketValue),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const payload = ticket.payload as {
      provider: Provider;
      label: string | null;
      reason: ProvisionReason;
      methods: SignInMethod[];
    };
    return {
      provider: payload.provider,
      label: payload.label,
      reason: payload.reason,
      methods: payload.methods,
    };
  }

  /** The person states the suggested profile is not theirs: create a separate Person. */
  async provisionCreate(ticketValue: string): Promise<Authenticated> {
    const ticket = await this.repository.consumeTicket(
      "provision",
      sha256(ticketValue),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const payload = ticket.payload as ExternalAccount & {
      surface: Surface;
      reason: ProvisionReason;
    };
    const { personId, created } = await this.createFromAccount({
      provider: payload.provider,
      issuer: payload.issuer,
      subject: payload.subject,
      label: payload.label,
      email: payload.email ?? null,
    });
    if (created)
      await this.repository.audit("person.provisioned", personId, personId, {
        provider: payload.provider,
        automatic: false,
        reason: payload.reason,
      });
    if ((await this.repository.personStatus(personId)) !== "active")
      throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
    return this.open(
      personId,
      payload.provider,
      payload.surface,
      "single",
      created,
    );
  }

  /** Attaches the verified identity to the Person the person signed in to as proof. */
  async provisionLink(
    ticketValue: string,
    sessionId: string,
  ): Promise<FlowOutcome> {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    const ticket = await this.repository.consumeTicket(
      "provision",
      sha256(ticketValue),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const payload = ticket.payload as ExternalAccount;
    this.linkFailure(
      await this.repository.addLink({
        personId: session.personId,
        provider: payload.provider,
        issuer: payload.issuer,
        subject: payload.subject,
        label: payload.label,
        email: payload.email ?? null,
      }),
    );
    await this.repository.audit(
      "link.added",
      session.personId,
      session.personId,
      { provider: payload.provider, via: "first_access" },
    );
    return { kind: "linked", provider: payload.provider };
  }

  /** Consolidates a profile the person just proved, which held only that account. */
  async mergeSelf(
    ticketValue: string,
    sessionId: string,
  ): Promise<{ kind: "linked"; provider: Provider }> {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    const ticket = await this.repository.peekTicket(
      "merge",
      sha256(ticketValue),
      this.now(),
    );
    // Only the session that proved both profiles can confirm; others cannot burn it.
    if (
      !ticket ||
      ticket.personId !== session.personId ||
      ticket.payload.sessionId !== session.id ||
      !(await this.repository.consumeTicket(
        "merge",
        sha256(ticketValue),
        this.now(),
      ))
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const sourceId = String(ticket.payload.sourcePersonId);
    const result = await this.repository.merge({
      sourceId,
      targetId: session.personId,
      absorbableBy: { linkId: String(ticket.payload.linkId) },
      transfer: this.transfer,
      now: this.now(),
    });
    this.mergeFailure(result.result);
    await this.repository.audit(
      "person.merged",
      session.personId,
      session.personId,
      { mode: "proof", source: sourceId },
    );
    return { kind: "linked", provider: ticket.payload.provider as Provider };
  }

  private mergeFailure(result: string) {
    if (result === "merged") return;
    if (result === "busy") throw new IdentityFailure("IDENTITY_MERGE_BUSY");
    if (result === "provider_conflict")
      throw new IdentityFailure("IDENTITY_PROVIDER_ALREADY_LINKED");
    if (result === "not_found")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    throw new IdentityFailure("IDENTITY_MERGE_NOT_ALLOWED");
  }

  // ---------------- bootstrap and invitations ----------------
  async createBootstrapTicket(breakGlass: boolean): Promise<string> {
    if (!breakGlass && (await this.repository.ownerExists()))
      throw new Error(
        "An active owner already exists; use break-glass explicitly",
      );
    const token = randomSecret();
    const now = this.now();
    await this.repository.createTicket({
      purpose: "bootstrap",
      tokenHash: sha256(token),
      payload: { breakGlass },
      expiresAt: new Date(now.getTime() + lifetimes.bootstrapTicketMs),
    });
    await this.repository.audit("bootstrap.issued", null, null, { breakGlass });
    return token;
  }

  async inspectInvitation(
    purpose: "bootstrap" | "enrollment" | "reset" | "link",
    token: string,
  ) {
    const ticket = await this.repository.peekTicket(
      purpose === "link" ? "link_invitation" : purpose,
      sha256(token),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    if (
      purpose === "bootstrap" &&
      ticket.payload.breakGlass !== true &&
      (await this.repository.ownerExists())
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const snapshot = ticket.personId
      ? await this.repository.snapshot(ticket.personId)
      : null;
    const provider = ticket.payload.provider;
    return {
      displayName: snapshot?.displayName ?? null,
      provider: provider === "pdt" || provider === "sankhya" ? provider : null,
    };
  }

  private validateLocal(loginInput: string, password: string) {
    const login = normalizeLogin(loginInput);
    if (!login) throw new IdentityFailure("IDENTITY_INVALID_LOGIN");
    if (passwordProblem(password, login))
      throw new IdentityFailure("IDENTITY_WEAK_PASSWORD");
    return login;
  }

  async completeBootstrap(
    token: string,
    displayNameInput: string,
    loginInput: string,
    password: string,
  ) {
    const displayName = normalizeDisplayName(displayNameInput);
    if (!displayName) throw new IdentityFailure("IDENTITY_INVALID_NAME");
    const login = this.validateLocal(loginInput, password);
    if (await this.repository.credentialByLogin(login))
      throw new IdentityFailure("IDENTITY_LOGIN_TAKEN");
    const hash = await hashPassword(password);
    const ticket = await this.repository.consumeTicket(
      "bootstrap",
      sha256(token),
      this.now(),
    );
    if (!ticket) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    if (
      ticket.payload.breakGlass !== true &&
      (await this.repository.ownerExists())
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const personId = await this.repository.createPerson(displayName);
    if (
      (await this.repository.createLocalCredential(personId, login, hash)) ===
      "login_taken"
    ) {
      await this.repository.setStatus(personId, "disabled");
      throw new IdentityFailure("IDENTITY_LOGIN_TAKEN");
    }
    await this.repository.addRole(personId, "owner", null);
    await this.repository.audit("bootstrap.completed", personId, personId, {
      breakGlass: ticket.payload.breakGlass === true,
    });
    return this.open(personId, "bootstrap", "direct", "single");
  }

  /** Completes an owner-issued enrollment or reset: (re)creates the local credential. */
  async completeInvitation(
    purpose: "enrollment" | "reset",
    token: string,
    loginInput: string,
    password: string,
  ) {
    const login = this.validateLocal(loginInput, password);
    const hash = await hashPassword(password);
    const ticket = await this.repository.consumeTicket(
      purpose,
      sha256(token),
      this.now(),
    );
    if (!ticket?.personId) throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const snapshot = await this.repository.snapshot(ticket.personId);
    if (snapshot?.status !== "active")
      throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
    if (snapshot.local) throw new IdentityFailure("IDENTITY_ALREADY_ENROLLED");
    if (
      (await this.repository.createLocalCredential(
        ticket.personId,
        login,
        hash,
      )) === "login_taken"
    )
      throw new IdentityFailure("IDENTITY_LOGIN_TAKEN");
    await this.repository.audit(
      `credential.${purpose}_completed`,
      ticket.personId,
      ticket.personId,
      {},
    );
    // When the policy requires a second factor, the new password opens no
    // session until the authenticator is set up, as at any other sign-in.
    if (
      secondFactorRequired(
        await this.securityPolicy(),
        snapshot.roles.includes("owner"),
      )
    ) {
      const challenge = randomSecret();
      await this.repository.createTicket({
        purpose: "mfa_enrollment",
        tokenHash: sha256(challenge),
        personId: ticket.personId,
        payload: { surface: "direct" },
        expiresAt: new Date(this.now().getTime() + lifetimes.totpSetupMs),
      });
      return { kind: "mfa_enrollment_required" as const, challenge };
    }
    return this.open(ticket.personId, "enrollment", "direct", "single");
  }

  // ---------------- self-service ----------------
  async me(sessionId: string) {
    const session = await this.activeSession(sessionId);
    const snapshot = await this.repository.snapshot(session.personId);
    if (!snapshot) throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    const policy = await this.securityPolicy();
    return {
      rememberedDevices: await this.repository.rememberedDevices(
        session.personId,
        new Date(
          this.now().getTime() - policy.rememberDeviceDays * 24 * 3600_000,
        ),
      ),
      session,
      snapshot,
      permissions: this.permissionsOf(snapshot),
      sessions: await this.repository.listSessions(
        session.personId,
        this.now(),
      ),
    };
  }

  async rename(sessionId: string, displayNameInput: string) {
    const session = await this.activeSession(sessionId);
    const displayName = normalizeDisplayName(displayNameInput);
    if (!displayName) throw new IdentityFailure("IDENTITY_INVALID_NAME");
    await this.repository.updateDisplayName(session.personId, displayName);
  }

  /**
   * Adds a local password as another method of the signed-in Person, or changes
   * it (recent authentication). Never creates a Person: there is no public
   * self-registration.
   */
  async setPassword(
    sessionId: string,
    password: string,
    loginInput: string | undefined,
  ) {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    const credential = await this.repository.credentialOf(session.personId);
    const now = this.now();
    if (credential) {
      if (passwordProblem(password, credential.login))
        throw new IdentityFailure("IDENTITY_WEAK_PASSWORD");
      await this.repository.setPassword(
        session.personId,
        await hashPassword(password),
        now,
      );
      await this.repository.revokePersonSessions(
        session.personId,
        "password_changed",
        now,
        session.id,
      );
      await this.repository.forgetDevices(session.personId, now);
      await this.repository.audit(
        "credential.password_changed",
        session.personId,
        session.personId,
        {},
      );
      return;
    }
    const login = this.validateLocal(loginInput ?? "", password);
    if (
      (await this.repository.createLocalCredential(
        session.personId,
        login,
        await hashPassword(password),
      )) === "login_taken"
    )
      throw new IdentityFailure("IDENTITY_LOGIN_TAKEN");
    await this.repository.audit(
      "credential.local_created",
      session.personId,
      session.personId,
      {},
    );
  }

  async startTotpSetup(sessionId: string) {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    const credential = await this.repository.credentialOf(session.personId);
    if (!credential)
      throw new IdentityFailure("IDENTITY_LOCAL_CREDENTIAL_REQUIRED");
    const secret = newTotpSecret();
    const setup = randomSecret();
    await this.repository.createTicket({
      purpose: "totp_setup",
      tokenHash: sha256(setup),
      personId: session.personId,
      payload: {
        sealed: seal(this.encryptionKey, secret),
        sessionId: session.id,
      },
      expiresAt: new Date(this.now().getTime() + lifetimes.totpSetupMs),
    });
    return {
      setup,
      secret: base32Encode(secret),
      otpauthUri: otpauthUri(secret, credential.login),
    };
  }

  async confirmTotpSetup(sessionId: string, setup: string, code: string) {
    const session = await this.activeSession(sessionId);
    const now = this.now();
    const ticket = await this.repository.peekTicket(
      "totp_setup",
      sha256(setup),
      now,
    );
    if (
      !ticket ||
      ticket.personId !== session.personId ||
      ticket.payload.sessionId !== session.id
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const sealed = String(ticket.payload.sealed);
    const step = matchTotp(
      unseal(this.encryptionKey, sealed),
      code.trim(),
      now.getTime(),
      null,
    );
    if (step === null) throw new IdentityFailure("IDENTITY_INVALID_CODE");
    if (
      !(await this.repository.consumeTicket("totp_setup", sha256(setup), now))
    )
      throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
    const codes = recoveryCodes();
    await this.repository.enableTotp(
      session.personId,
      sealed,
      step,
      codes.map((item) => sha256(normalizeRecoveryCode(item))),
      now,
    );
    await this.repository.stepUp(session.id, "mfa", now);
    await this.repository.audit(
      "mfa.enabled",
      session.personId,
      session.personId,
      {},
    );
    return {
      recoveryCodes: codes,
      ...(await this.tokenFor({ ...session, assurance: "mfa", authTime: now })),
    };
  }

  async disableTotp(sessionId: string) {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    if (session.assurance !== "mfa")
      throw new IdentityFailure("IDENTITY_STRONG_AUTHENTICATION_REQUIRED");
    const snapshot = await this.repository.snapshot(session.personId);
    if (snapshot?.roles.includes("owner"))
      throw new IdentityFailure("IDENTITY_ACCESS_DENIED");
    if (secondFactorRequired(await this.securityPolicy(), false))
      throw new IdentityFailure("IDENTITY_TOTP_REQUIRED");
    await this.repository.disableTotp(session.personId);
    await this.repository.forgetDevices(session.personId, this.now());
    await this.repository.stepUp(session.id, "single", session.authTime);
    await this.repository.audit(
      "mfa.disabled",
      session.personId,
      session.personId,
      {},
    );
  }

  async regenerateRecoveryCodes(sessionId: string) {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    if (session.assurance !== "mfa")
      throw new IdentityFailure("IDENTITY_STRONG_AUTHENTICATION_REQUIRED");
    const codes = recoveryCodes();
    await this.repository.replaceRecoveryCodes(
      session.personId,
      codes.map((item) => sha256(normalizeRecoveryCode(item))),
    );
    await this.repository.audit(
      "mfa.recovery_codes_regenerated",
      session.personId,
      session.personId,
      {},
    );
    return codes;
  }

  async unlink(sessionId: string, linkId: string) {
    const session = await this.activeSession(sessionId);
    await this.requireRecent(session);
    const removed = await this.repository.removeLink(
      session.personId,
      linkId,
      true,
    );
    if (removed.result === "not_found")
      throw new IdentityFailure("IDENTITY_LINK_NOT_FOUND");
    if (removed.result === "last_method")
      throw new IdentityFailure("IDENTITY_LAST_METHOD");
    await this.repository.audit(
      "link.removed",
      session.personId,
      session.personId,
      { provider: removed.provider },
    );
  }

  async revokeOwnSession(sessionId: string, target: string) {
    const session = await this.activeSession(sessionId);
    if (
      !(await this.repository.revokeSession(
        target,
        "revoked_by_person",
        this.now(),
        session.personId,
      ))
    )
      throw new IdentityFailure("IDENTITY_SESSION_NOT_FOUND");
    await this.repository.audit(
      "session.revoked",
      session.personId,
      session.personId,
      {},
    );
  }

  // ---------------- owner administration ----------------
  async requireOwner(
    sessionId: string | undefined,
    mutation: boolean,
  ): Promise<SessionRecord> {
    const session = await this.activeSession(sessionId);
    const snapshot = await this.repository.snapshot(session.personId);
    if (!snapshot?.roles.includes("owner"))
      throw new IdentityFailure("IDENTITY_ACCESS_DENIED");
    // Administration needs a session confirmed with the second factor unless a
    // non-production policy turned the requirement off.
    if (
      (await this.securityPolicy()).mfaRequirement !== "none" &&
      session.assurance !== "mfa"
    )
      throw new IdentityFailure("IDENTITY_STRONG_AUTHENTICATION_REQUIRED");
    if (mutation) await this.requireRecent(session, "admin");
    return session;
  }

  private async requireActivePerson(personId: string) {
    if ((await this.repository.personStatus(personId)) !== "active")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
  }

  async listPersons(
    sessionId: string,
    query: string | undefined,
    cursor: string | undefined,
  ) {
    await this.requireOwner(sessionId, false);
    let position: { name: string; id: string } | undefined;
    if (cursor) {
      try {
        const parsed = JSON.parse(
          Buffer.from(cursor, "base64url").toString("utf8"),
        ) as unknown;
        if (
          !Array.isArray(parsed) ||
          typeof parsed[0] !== "string" ||
          typeof parsed[1] !== "string"
        )
          throw new Error();
        position = { name: parsed[0], id: parsed[1] };
      } catch {
        throw new IdentityFailure("IDENTITY_FLOW_EXPIRED");
      }
    }
    const { rows, more } = await this.repository.listPersons(
      query?.trim() || undefined,
      position,
      30,
    );
    const last = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        status: row.status as "active" | "disabled",
        owner: row.roles.some((item) => item.role === "owner"),
        providers: row.externalIdentities.map(
          (item) => item.provider as Provider,
        ),
        login: row.localCredential?.login ?? null,
      })),
      nextCursor:
        more && last
          ? Buffer.from(JSON.stringify([last.displayName, last.id])).toString(
              "base64url",
            )
          : null,
    };
  }

  async personDetail(sessionId: string, personId: string) {
    await this.requireOwner(sessionId, false);
    const snapshot = await this.repository.snapshot(personId);
    if (!snapshot || snapshot.status === "merged")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    return {
      snapshot,
      permissions: this.permissionsOf(snapshot),
      sessions: await this.repository.listSessions(personId, this.now()),
      audit: await this.repository.auditFor(personId, 30),
    };
  }

  /** Issues a one-time invitation, replacing any pending one of the same kind. */
  private async invitation(
    purpose: "enrollment" | "reset" | "link_invitation",
    personId: string,
    actor: string,
    provider?: Provider,
  ) {
    const token = randomSecret();
    const now = this.now();
    if (purpose === "link_invitation")
      await this.repository.invalidateTickets(
        personId,
        ["link_invitation"],
        now,
        (payload) => payload.provider === provider,
      );
    else
      await this.repository.invalidateTickets(
        personId,
        ["enrollment", "reset"],
        now,
      );
    await this.repository.createTicket({
      purpose,
      tokenHash: sha256(token),
      personId,
      payload: provider ? { provider } : {},
      createdBy: actor,
      expiresAt: new Date(now.getTime() + lifetimes.invitationTicketMs),
    });
    return token;
  }

  private directory() {
    const sankhya = this.providers.sankhya;
    if (!sankhya?.directory)
      throw new IdentityFailure("IDENTITY_DIRECTORY_UNAVAILABLE");
    return { directory: sankhya.directory, issuer: sankhya.issuer };
  }

  /** Reads a real Sankhya user that can still sign in; never trusts a typed identifier. */
  private async directoryUser(codusu: string): Promise<SankhyaUser> {
    const { directory } = this.directory();
    let user;
    try {
      user = await directory.find(codusu);
    } catch (error) {
      throw new IdentityFailure("IDENTITY_PROVIDER_UNAVAILABLE", error);
    }
    if (!user) throw new IdentityFailure("IDENTITY_EXTERNAL_ACCOUNT_NOT_FOUND");
    if (user.accessExpired)
      throw new IdentityFailure("IDENTITY_EXTERNAL_ACCOUNT_INACTIVE");
    return user;
  }

  /** Owner search of the Sankhya user directory, showing existing IA-MNS links. */
  async searchSankhyaDirectory(sessionId: string, query: string) {
    await this.requireOwner(sessionId, false);
    const { directory, issuer } = this.directory();
    let users;
    try {
      users = await directory.search(query);
    } catch (error) {
      throw new IdentityFailure("IDENTITY_PROVIDER_UNAVAILABLE", error);
    }
    return Promise.all(
      users.map(async (user) => {
        const link = await this.repository.findByLink(
          "sankhya",
          issuer,
          user.codusu,
        );
        return {
          ...user,
          linkedTo:
            link && link.person.status !== "merged"
              ? {
                  personId: link.person.id,
                  displayName: link.person.displayName,
                }
              : null,
        };
      }),
    );
  }

  private async attachDirectoryUser(
    actor: string,
    personId: string,
    user: SankhyaUser,
  ) {
    const { issuer } = this.directory();
    this.linkFailure(
      await this.repository.addLink({
        personId,
        provider: "sankhya",
        issuer,
        subject: user.codusu,
        label: user.name ?? user.login,
        email: user.email,
        establishedBy: "directory",
        linkedBy: actor,
      }),
    );
    await this.repository.audit("link.added", actor, personId, {
      provider: "sankhya",
      via: "directory",
    });
  }

  /** Owner attestation: associates a real Sankhya user selected from the directory. */
  async linkSankhyaFromDirectory(
    sessionId: string,
    personId: string,
    codusu: string,
  ) {
    const session = await this.requireOwner(sessionId, true);
    await this.requireActivePerson(personId);
    await this.attachDirectoryUser(
      session.personId,
      personId,
      await this.directoryUser(codusu),
    );
  }

  /**
   * Owner creates a Person with any combination of: a local enrollment
   * invitation, a Sankhya user selected from the directory, and proof-based
   * link invitations for providers whose sign-in is available.
   */
  async createPerson(
    sessionId: string,
    input: {
      displayName: string;
      localInvitation: boolean;
      sankhyaCodusu?: string | undefined;
      linkInvitations: readonly Provider[];
    },
  ) {
    const session = await this.requireOwner(sessionId, true);
    const displayName = normalizeDisplayName(input.displayName);
    if (!displayName) throw new IdentityFailure("IDENTITY_INVALID_NAME");
    const invitations = [...new Set(input.linkInvitations)];
    for (const provider of invitations) this.requireSignIn(provider);
    if (input.sankhyaCodusu !== undefined && invitations.includes("sankhya"))
      throw new IdentityFailure("IDENTITY_PROVIDER_ALREADY_LINKED");
    // Validate the external account before creating anything.
    const sankhyaUser =
      input.sankhyaCodusu === undefined
        ? null
        : await this.directoryUser(input.sankhyaCodusu);
    if (
      sankhyaUser &&
      (await this.repository.findByLink(
        "sankhya",
        this.directory().issuer,
        sankhyaUser.codusu,
      ))
    )
      throw new IdentityFailure("IDENTITY_LINK_CONFLICT");
    const personId = await this.repository.createPerson(displayName);
    await this.repository.audit(
      "person.created",
      session.personId,
      personId,
      {},
    );
    if (sankhyaUser)
      await this.attachDirectoryUser(session.personId, personId, sankhyaUser);
    const enrollmentToken = input.localInvitation
      ? await this.invitation("enrollment", personId, session.personId)
      : null;
    const linkInvitations: { provider: Provider; token: string }[] = [];
    for (const provider of invitations)
      linkInvitations.push({
        provider,
        token: await this.invitation(
          "link_invitation",
          personId,
          session.personId,
          provider,
        ),
      });
    return { personId, enrollmentToken, linkInvitations };
  }

  /** One-time link for the person to prove a PDT or Sankhya account for this profile. */
  async issueLinkInvitation(
    sessionId: string,
    personId: string,
    provider: Provider,
  ) {
    const session = await this.requireOwner(sessionId, true);
    this.requireSignIn(provider);
    const snapshot = await this.repository.snapshot(personId);
    if (!snapshot || snapshot.status !== "active")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    if (snapshot.links.some((link) => link.provider === provider))
      throw new IdentityFailure("IDENTITY_PROVIDER_ALREADY_LINKED");
    const token = await this.invitation(
      "link_invitation",
      personId,
      session.personId,
      provider,
    );
    await this.repository.audit(
      "link.invitation_issued",
      session.personId,
      personId,
      { provider },
    );
    return token;
  }

  /** One-time invitation for an existing Person to create a local password. */
  async issueEnrollment(sessionId: string, personId: string) {
    const session = await this.requireOwner(sessionId, true);
    const snapshot = await this.repository.snapshot(personId);
    if (!snapshot || snapshot.status !== "active")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    if (snapshot.local) throw new IdentityFailure("IDENTITY_ALREADY_ENROLLED");
    const token = await this.invitation(
      "enrollment",
      personId,
      session.personId,
    );
    await this.repository.audit(
      "credential.enrollment_issued",
      session.personId,
      personId,
      {},
    );
    return token;
  }

  /** Owner-confirmed consolidation of two profiles of the same individual. */
  async adminMerge(sessionId: string, targetId: string, sourceId: string) {
    const session = await this.requireOwner(sessionId, true);
    const result = await this.repository.merge({
      sourceId,
      targetId,
      transfer: this.transfer,
      now: this.now(),
    });
    this.mergeFailure(result.result);
    await this.repository.audit("person.merged", session.personId, targetId, {
      mode: "owner",
      source: sourceId,
    });
  }

  async setGrant(
    sessionId: string,
    personId: string,
    permission: string,
    granted: boolean,
  ) {
    const session = await this.requireOwner(sessionId, true);
    if (
      permission === ADMIN_PERMISSION ||
      !this.catalog.some((item) => item.permission === permission)
    )
      throw new IdentityFailure("IDENTITY_UNKNOWN_PERMISSION");
    await this.requireActivePerson(personId);
    if (granted)
      await this.repository.addGrant(personId, permission, session.personId);
    else await this.repository.removeGrant(personId, permission);
    await this.repository.audit(
      granted ? "grant.added" : "grant.removed",
      session.personId,
      personId,
      { permission },
    );
  }

  async setOwner(sessionId: string, personId: string, owner: boolean) {
    const session = await this.requireOwner(sessionId, true);
    const snapshot = await this.repository.snapshot(personId);
    if (!snapshot || snapshot.status === "merged")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    if (owner) {
      if (snapshot.status !== "active")
        throw new IdentityFailure("IDENTITY_ACCOUNT_DISABLED");
      await this.repository.addRole(personId, "owner", session.personId);
    } else {
      const result = await this.repository.removeRole(personId, "owner");
      if (result === "last_owner")
        throw new IdentityFailure("IDENTITY_LAST_OWNER");
    }
    await this.repository.audit(
      owner ? "role.added" : "role.removed",
      session.personId,
      personId,
      { role: "owner" },
    );
  }

  async setPersonStatus(
    sessionId: string,
    personId: string,
    status: "active" | "disabled",
  ) {
    const session = await this.requireOwner(sessionId, true);
    const result = await this.repository.setStatus(personId, status);
    if (result === "not_found")
      throw new IdentityFailure("IDENTITY_PERSON_NOT_FOUND");
    if (result === "last_owner")
      throw new IdentityFailure("IDENTITY_LAST_OWNER");
    if (status === "disabled")
      await this.repository.revokePersonSessions(
        personId,
        "person_disabled",
        this.now(),
      );
    await this.repository.audit(
      status === "disabled" ? "person.disabled" : "person.enabled",
      session.personId,
      personId,
      {},
    );
  }

  async adminUnlink(sessionId: string, personId: string, linkId: string) {
    const session = await this.requireOwner(sessionId, true);
    const removed = await this.repository.removeLink(personId, linkId, true);
    if (removed.result === "not_found")
      throw new IdentityFailure("IDENTITY_LINK_NOT_FOUND");
    if (removed.result === "last_method")
      throw new IdentityFailure("IDENTITY_LAST_METHOD");
    await this.repository.audit("link.removed", session.personId, personId, {
      provider: removed.provider,
      byOwner: true,
    });
  }

  /** Replaces the local credential with a one-time reset invitation; revokes sessions. */
  async resetLocal(sessionId: string, personId: string) {
    const session = await this.requireOwner(sessionId, true);
    await this.requireActivePerson(personId);
    if (personId === session.personId)
      throw new IdentityFailure("IDENTITY_ACCESS_DENIED");
    await this.repository.removeLocalCredential(personId);
    await this.repository.revokePersonSessions(
      personId,
      "credential_reset",
      this.now(),
    );
    await this.repository.forgetDevices(personId, this.now());
    const token = await this.invitation("reset", personId, session.personId);
    await this.repository.audit(
      "credential.reset_issued",
      session.personId,
      personId,
      {},
    );
    return token;
  }

  async revokePersonSessions(sessionId: string, personId: string) {
    const session = await this.requireOwner(sessionId, true);
    const count = await this.repository.revokePersonSessions(
      personId,
      "revoked_by_owner",
      this.now(),
      session.id,
    );
    await this.repository.audit(
      "session.revoked_all",
      session.personId,
      personId,
      { count },
    );
    return count;
  }

  /** Stops skipping the second factor on every browser of the signed-in Person. */
  async forgetRememberedDevices(sessionId: string) {
    const session = await this.activeSession(sessionId);
    const count = await this.repository.forgetDevices(
      session.personId,
      this.now(),
    );
    await this.repository.audit(
      "mfa.devices_forgotten",
      session.personId,
      session.personId,
      { count },
    );
    return count;
  }

  /** Owner view of the authentication policy, its limits and recent changes. */
  async securityPolicyView(sessionId: string) {
    await this.requireOwner(sessionId, false);
    const stored = await this.repository.policy();
    const configured: SecurityPolicy = stored
      ? {
          sessionMaxMinutes: stored.sessionMaxMinutes,
          idleTimeoutMinutes: stored.idleTimeoutMinutes,
          recentAuthMinutes: stored.recentAuthMinutes,
          adminRecentAuthMinutes: stored.adminRecentAuthMinutes,
          mfaRequirement: stored.mfaRequirement,
          rememberDeviceDays: stored.rememberDeviceDays,
        }
      : { ...defaultSecurityPolicy };
    const updater = stored?.updatedBy
      ? await this.repository.snapshot(stored.updatedBy)
      : null;
    return {
      configured,
      effective: effectivePolicy(configured, this.production),
      defaults: { ...defaultSecurityPolicy },
      limits: policyLimits,
      production: this.production,
      warnings: policyWarnings(configured),
      updatedAt: stored?.updatedAt ?? null,
      updatedBy: updater?.displayName ?? null,
      history: await this.repository.auditByAction("policy.updated", 10),
    };
  }

  /**
   * Owner change of the authentication policy. Values outside the hard bounds
   * and an optional second factor in production are refused; settings that
   * significantly reduce security must be acknowledged explicitly. Open direct
   * sessions follow the new durations at once.
   */
  async updateSecurityPolicy(
    sessionId: string,
    input: SecurityPolicy,
    acknowledgeReducedSecurity: boolean,
  ) {
    const session = await this.requireOwner(sessionId, true);
    const problems = policyProblems(input, this.production);
    if (problems.includes("mfa_none_in_production"))
      throw new IdentityFailure("IDENTITY_POLICY_NOT_ALLOWED");
    if (problems.length) throw new IdentityFailure("IDENTITY_POLICY_INVALID");
    const before = (await this.repository.policy()) ?? defaultSecurityPolicy;
    const warnings = policyWarnings(input);
    const newlyReduced = warnings.filter(
      (field) => !policyWarnings(before).includes(field),
    );
    if (newlyReduced.length && !acknowledgeReducedSecurity)
      throw new IdentityFailure("IDENTITY_POLICY_CONFIRMATION_REQUIRED");
    const now = this.now();
    const { ended } = await this.repository.savePolicy(
      input,
      session.personId,
      now,
    );
    this.policyCache = null;
    const details: Record<string, string | number | boolean | null> = {
      reducedSecurity: warnings.length > 0,
      endedSessions: ended,
    };
    for (const key of Object.keys(input) as (keyof SecurityPolicy)[])
      if (before[key] !== input[key]) {
        details[`${key}From`] = before[key];
        details[`${key}To`] = input[key];
      }
    await this.repository.audit(
      "policy.updated",
      session.personId,
      null,
      details,
    );
    const current = await this.repository.session(session.id);
    return {
      endedSessions: ended,
      currentSessionEnded:
        !current || current.expiresAt <= now || current.idleExpiresAt <= now,
    };
  }

  async prune() {
    await this.repository.prune(this.now());
  }

  async close() {
    await this.providers.sankhya?.directory?.close();
  }
}

function surfaceOf(value: unknown): Surface {
  return value === "pdt" || value === "sankhya" ? value : "direct";
}
