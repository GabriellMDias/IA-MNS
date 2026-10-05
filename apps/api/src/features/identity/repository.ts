import { randomUUID } from "node:crypto";
import type { Database } from "../../database.js";
import { Prisma } from "../../generated/prisma/client.js";
import type {
  Assurance,
  Provider,
  Role,
  SessionMethod,
  Surface,
} from "./domain.js";
import { lockoutMs } from "./domain.js";

type Json = Prisma.InputJsonValue;
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

export type TicketPurpose =
  | "bootstrap"
  | "enrollment"
  | "reset"
  | "link_invitation"
  | "mfa"
  | "provision"
  | "merge"
  | "totp_setup"
  | "pdt_login"
  | "sankhya_login";

export type Ticket = {
  id: string;
  personId: string | null;
  payload: Record<string, unknown>;
  createdBy: string | null;
};

export type SessionRecord = {
  id: string;
  personId: string;
  method: SessionMethod;
  surface: Surface;
  assurance: Assurance;
  authTime: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  revokedAt: Date | null;
};

export type PersonSnapshot = {
  id: string;
  displayName: string;
  status: "active" | "disabled" | "merged";
  mergedInto: string | null;
  createdAt: Date;
  roles: Role[];
  grants: { permission: string; grantedAt: Date }[];
  links: {
    id: string;
    provider: Provider;
    issuer: string;
    subject: string;
    label: string | null;
    email: string | null;
    establishedBy: "proof" | "directory";
    linkedAt: Date;
    lastVerifiedAt: Date;
  }[];
  local: {
    login: string;
    totpEnabled: boolean;
    recoveryCodesRemaining: number;
    lockedUntil: Date | null;
  } | null;
};

/** Moves another module's Person-owned data inside the consolidation transaction. */
export type OwnershipTransfer = (
  tx: Prisma.TransactionClient,
  from: string,
  to: string,
) => Promise<"transferred" | "busy">;

export type ExternalAccount = {
  provider: Provider;
  issuer: string;
  subject: string;
  label: string | null;
  email: string | null;
};

export type MergeResult =
  | { result: "merged"; links: number }
  | {
      result:
        "not_found" | "not_absorbable" | "owner" | "provider_conflict" | "busy";
    };

const isUnique = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

class MergeBusy extends Error {}

export class IdentityRepository {
  private readonly database: Database;
  constructor(database: Database) {
    this.database = database;
  }

  // ---------- Persons and links ----------
  async findByLink(provider: Provider, issuer: string, subject: string) {
    return this.database.identityExternalIdentity.findUnique({
      where: { provider_issuer_subject: { provider, issuer, subject } },
      select: {
        id: true,
        person: { select: { id: true, status: true, displayName: true } },
      },
    });
  }

  /** Creates a Person and its first link atomically; a concurrent duplicate returns the winner. */
  async createPersonWithLink(
    input: ExternalAccount & { displayName: string },
  ): Promise<{ personId: string; created: boolean }> {
    const personId = randomUUID();
    try {
      await this.database.$transaction([
        this.database.identityPerson.create({
          data: { id: personId, displayName: input.displayName },
        }),
        this.database.identityExternalIdentity.create({
          data: {
            id: randomUUID(),
            personId,
            provider: input.provider,
            issuer: input.issuer,
            subject: input.subject,
            label: input.label,
            email: input.email,
          },
        }),
      ]);
      return { personId, created: true };
    } catch (error) {
      if (!isUnique(error)) throw error;
      const existing = await this.findByLink(
        input.provider,
        input.issuer,
        input.subject,
      );
      if (!existing) throw error;
      return { personId: existing.person.id, created: false };
    }
  }

  /** Adds a link to an existing Person; fails if the account belongs to someone else. */
  async addLink(
    input: ExternalAccount & {
      personId: string;
      establishedBy?: "proof" | "directory";
      linkedBy?: string | null;
    },
  ): Promise<
    "linked" | "already_linked" | "linked_elsewhere" | "provider_taken"
  > {
    const existing = await this.findByLink(
      input.provider,
      input.issuer,
      input.subject,
    );
    if (existing)
      return existing.person.id === input.personId
        ? "already_linked"
        : "linked_elsewhere";
    try {
      await this.database.identityExternalIdentity.create({
        data: {
          id: randomUUID(),
          personId: input.personId,
          provider: input.provider,
          issuer: input.issuer,
          subject: input.subject,
          label: input.label,
          email: input.email,
          establishedBy: input.establishedBy ?? "proof",
          linkedBy: input.linkedBy ?? null,
        },
      });
      return "linked";
    } catch (error) {
      if (!isUnique(error)) throw error;
      const winner = await this.findByLink(
        input.provider,
        input.issuer,
        input.subject,
      );
      if (winner)
        return winner.person.id === input.personId
          ? "already_linked"
          : "linked_elsewhere";
      return "provider_taken";
    }
  }

  async touchLink(
    linkId: string,
    label: string | null,
    email: string | null,
    now: Date,
  ) {
    await this.database.identityExternalIdentity.update({
      where: { id: linkId },
      data: {
        lastVerifiedAt: now,
        ...(label ? { label } : {}),
        ...(email ? { email } : {}),
      },
    });
  }

  /**
   * Active Persons holding a link of another provider installation that reported
   * the same e-mail. A hint to ask for proof; never used to link or merge.
   */
  async candidatesByEmail(
    email: string,
    exclude: { provider: Provider; issuer: string },
  ) {
    const rows = await this.database.identityExternalIdentity.findMany({
      where: {
        email,
        NOT: { provider: exclude.provider, issuer: exclude.issuer },
        person: { status: "active" },
      },
      select: {
        person: {
          select: {
            id: true,
            localCredential: { select: { personId: true } },
            externalIdentities: { select: { provider: true } },
          },
        },
      },
      take: 10,
    });
    const persons = new Map<string, Set<"local" | Provider>>();
    for (const row of rows) {
      const methods = new Set<"local" | Provider>(
        row.person.externalIdentities.map((item) => item.provider as Provider),
      );
      if (row.person.localCredential) methods.add("local");
      persons.set(row.person.id, methods);
    }
    return [...persons.entries()].map(([personId, methods]) => ({
      personId,
      methods: [...methods].sort(),
    }));
  }

  /** The Person of a still-valid direct session, without rotating its credential. */
  async personOfRefresh(
    refreshHash: string,
    now: Date,
  ): Promise<string | null> {
    const row = await this.database.identitySession.findFirst({
      where: {
        refreshHash,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        person: { status: "active" },
      },
      select: { personId: true },
    });
    return row?.personId ?? null;
  }

  /**
   * Removes a link while preserving at least one sign-in method. Locks the
   * Person row so concurrent removals cannot strand the account.
   */
  async removeLink(
    personId: string,
    linkId: string,
    enforceRemaining: boolean,
  ) {
    return this.database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM identity_persons WHERE id = ${personId}::uuid FOR UPDATE`;
      const link = await tx.identityExternalIdentity.findFirst({
        where: { id: linkId, personId },
        select: { id: true, provider: true },
      });
      if (!link) return { result: "not_found" as const };
      if (enforceRemaining) {
        const [links, local] = await Promise.all([
          tx.identityExternalIdentity.count({ where: { personId } }),
          tx.identityLocalCredential.count({ where: { personId } }),
        ]);
        if (links - 1 + local < 1) return { result: "last_method" as const };
      }
      await tx.identityExternalIdentity.delete({ where: { id: link.id } });
      return {
        result: "removed" as const,
        provider: link.provider as Provider,
      };
    });
  }

  async snapshot(personId: string): Promise<PersonSnapshot | null> {
    const person = await this.database.identityPerson.findUnique({
      where: { id: personId },
      include: {
        roles: { select: { role: true } },
        grants: {
          select: { permission: true, grantedAt: true },
          orderBy: { permission: "asc" },
        },
        externalIdentities: { orderBy: { linkedAt: "asc" } },
        localCredential: {
          select: { login: true, totpEnabledAt: true, lockedUntil: true },
        },
      },
    });
    if (!person) return null;
    const recoveryCodesRemaining = person.localCredential?.totpEnabledAt
      ? await this.database.identityRecoveryCode.count({
          where: { personId, usedAt: null },
        })
      : 0;
    return {
      id: person.id,
      displayName: person.displayName,
      status: person.status as PersonSnapshot["status"],
      mergedInto: person.mergedInto,
      createdAt: person.createdAt,
      roles: person.roles.map((item) => item.role as Role),
      grants: person.grants,
      links: person.externalIdentities.map((link) => ({
        id: link.id,
        provider: link.provider as Provider,
        issuer: link.issuer,
        subject: link.subject,
        label: link.label,
        email: link.email,
        establishedBy: link.establishedBy as "proof" | "directory",
        linkedAt: link.linkedAt,
        lastVerifiedAt: link.lastVerifiedAt,
      })),
      local: person.localCredential
        ? {
            login: person.localCredential.login,
            totpEnabled: person.localCredential.totpEnabledAt !== null,
            recoveryCodesRemaining,
            lockedUntil: person.localCredential.lockedUntil,
          }
        : null,
    };
  }

  async listPersons(
    query: string | undefined,
    cursor: { name: string; id: string } | undefined,
    limit: number,
  ) {
    const rows = await this.database.identityPerson.findMany({
      where: {
        status: { not: "merged" },
        ...(query
          ? {
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                {
                  localCredential: {
                    login: { contains: query.toLowerCase() },
                  },
                },
              ],
            }
          : {}),
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { displayName: { gt: cursor.name } },
                    { displayName: cursor.name, id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        displayName: true,
        status: true,
        roles: { select: { role: true } },
        externalIdentities: { select: { provider: true } },
        localCredential: { select: { login: true } },
      },
    });
    return { rows: rows.slice(0, limit), more: rows.length > limit };
  }

  async createPerson(displayName: string) {
    const id = randomUUID();
    await this.database.identityPerson.create({ data: { id, displayName } });
    return id;
  }

  async updateDisplayName(personId: string, displayName: string) {
    await this.database.identityPerson.update({
      where: { id: personId },
      data: { displayName, updatedAt: new Date() },
    });
  }

  async setStatus(personId: string, status: "active" | "disabled") {
    return this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity_owner_roles'))`;
      const locked = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM identity_persons WHERE id = ${personId}::uuid FOR UPDATE`;
      if (!locked[0] || locked[0].status === "merged")
        return "not_found" as const;
      if (status === "disabled") {
        const owner = await tx.identityRoleAssignment.findUnique({
          where: { personId_role: { personId, role: "owner" } },
        });
        if (owner && (await this.activeOwnerCount(tx)) <= 1)
          return "last_owner" as const;
      }
      await tx.identityPerson.update({
        where: { id: personId },
        data: { status, updatedAt: new Date() },
      });
      return "updated" as const;
    });
  }

  // ---------- Local credentials ----------
  async credentialByLogin(login: string) {
    return this.database.identityLocalCredential.findUnique({
      where: { login },
      select: {
        personId: true,
        passwordHash: true,
        lockedUntil: true,
        failedAttempts: true,
        totpEnabledAt: true,
        person: { select: { status: true } },
      },
    });
  }

  async credentialOf(personId: string) {
    return this.database.identityLocalCredential.findUnique({
      where: { personId },
    });
  }

  async createLocalCredential(
    personId: string,
    login: string,
    passwordHash: string,
  ) {
    try {
      await this.database.identityLocalCredential.create({
        data: { personId, login, passwordHash },
      });
      return "created" as const;
    } catch (error) {
      if (isUnique(error)) return "login_taken" as const;
      throw error;
    }
  }

  async setPassword(personId: string, passwordHash: string, now: Date) {
    await this.database.identityLocalCredential.update({
      where: { personId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async recordFailure(personId: string, now: Date) {
    const updated = await this.database.identityLocalCredential.update({
      where: { personId },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    const delay = lockoutMs(updated.failedAttempts);
    if (delay)
      await this.database.identityLocalCredential.update({
        where: { personId },
        data: { lockedUntil: new Date(now.getTime() + delay) },
      });
  }

  async recordSuccess(personId: string) {
    await this.database.identityLocalCredential.updateMany({
      where: {
        personId,
        OR: [{ failedAttempts: { gt: 0 } }, { lockedUntil: { not: null } }],
      },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  /** Accepts a TOTP step only if newer than the last accepted one (no reuse). */
  async acceptTotpStep(personId: string, step: number): Promise<boolean> {
    const updated = await this.database.$executeRaw`
      UPDATE identity_local_credentials SET totp_last_step = ${BigInt(step)}
      WHERE person_id = ${personId}::uuid AND totp_enabled_at IS NOT NULL
        AND (totp_last_step IS NULL OR totp_last_step < ${BigInt(step)})`;
    return updated === 1;
  }

  async enableTotp(
    personId: string,
    sealedSecret: string,
    step: number,
    codeHashes: readonly string[],
    now: Date,
  ) {
    await this.database.$transaction([
      this.database.identityLocalCredential.update({
        where: { personId },
        data: {
          totpSecret: sealedSecret,
          totpEnabledAt: now,
          totpLastStep: BigInt(step),
        },
      }),
      this.database.identityRecoveryCode.deleteMany({ where: { personId } }),
      this.database.identityRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({
          id: randomUUID(),
          personId,
          codeHash,
        })),
      }),
    ]);
  }

  async replaceRecoveryCodes(personId: string, codeHashes: readonly string[]) {
    await this.database.$transaction([
      this.database.identityRecoveryCode.deleteMany({ where: { personId } }),
      this.database.identityRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({
          id: randomUUID(),
          personId,
          codeHash,
        })),
      }),
    ]);
  }

  async disableTotp(personId: string) {
    await this.database.$transaction([
      this.database.identityLocalCredential.update({
        where: { personId },
        data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      }),
      this.database.identityRecoveryCode.deleteMany({ where: { personId } }),
    ]);
  }

  async consumeRecoveryCode(
    personId: string,
    codeHash: string,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.database.identityRecoveryCode.updateMany({
      where: { personId, codeHash, usedAt: null },
      data: { usedAt: now },
    });
    return updated.count === 1;
  }

  /** Owner reset: removes the local credential (password and factor) for re-enrollment. */
  async removeLocalCredential(personId: string) {
    await this.database.$transaction([
      this.database.identityRecoveryCode.deleteMany({ where: { personId } }),
      this.database.identityLocalCredential.deleteMany({ where: { personId } }),
    ]);
  }

  // ---------- Sessions ----------
  async createSession(input: {
    personId: string;
    method: SessionMethod;
    surface: Surface;
    assurance: Assurance;
    refreshHash: string | null;
    now: Date;
    expiresAt: Date;
    idleExpiresAt: Date;
  }): Promise<SessionRecord> {
    const id = randomUUID();
    await this.database.identitySession.create({
      data: {
        id,
        personId: input.personId,
        method: input.method,
        surface: input.surface,
        assurance: input.assurance,
        refreshHash: input.refreshHash,
        authTime: input.now,
        lastSeenAt: input.now,
        idleExpiresAt: input.idleExpiresAt,
        expiresAt: input.expiresAt,
      },
    });
    return {
      id,
      personId: input.personId,
      method: input.method,
      surface: input.surface,
      assurance: input.assurance,
      authTime: input.now,
      expiresAt: input.expiresAt,
      idleExpiresAt: input.idleExpiresAt,
      revokedAt: null,
    };
  }

  async session(
    sessionId: string,
  ): Promise<(SessionRecord & { personStatus: string }) | null> {
    const row = await this.database.identitySession.findUnique({
      where: { id: sessionId },
      include: { person: { select: { status: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      personId: row.personId,
      method: row.method as SessionMethod,
      surface: row.surface as Surface,
      assurance: row.assurance as Assurance,
      authTime: row.authTime,
      expiresAt: row.expiresAt,
      idleExpiresAt: row.idleExpiresAt,
      revokedAt: row.revokedAt,
      personStatus: row.person.status,
    };
  }

  /**
   * Rotates a refresh credential atomically. Presenting an already-rotated
   * credential revokes the session (theft/reuse signal).
   */
  async rotateRefresh(
    refreshHash: string,
    nextHash: string,
    now: Date,
    idleMs: number,
  ): Promise<
    { result: "rotated"; sessionId: string } | { result: "reused" | "invalid" }
  > {
    const rows = await this.database.$queryRaw<{ id: string }[]>`
      UPDATE identity_sessions SET
        previous_refresh_hash = refresh_hash,
        refresh_hash = ${nextHash},
        last_seen_at = ${now},
        idle_expires_at = LEAST(expires_at, ${new Date(now.getTime() + idleMs)}::timestamptz)
      FROM identity_persons p
      WHERE identity_sessions.refresh_hash = ${refreshHash}
        AND identity_sessions.revoked_at IS NULL
        AND identity_sessions.expires_at > ${now}
        AND identity_sessions.idle_expires_at > ${now}
        AND p.id = identity_sessions.person_id AND p.status = 'active'
      RETURNING identity_sessions.id`;
    if (rows[0]) return { result: "rotated", sessionId: rows[0].id };
    const reused = await this.database.identitySession.updateMany({
      where: { previousRefreshHash: refreshHash, revokedAt: null },
      data: {
        revokedAt: now,
        revokedReason: "refresh_reuse",
        refreshHash: null,
      },
    });
    return { result: reused.count ? "reused" : "invalid" };
  }

  async stepUp(sessionId: string, assurance: Assurance, now: Date) {
    await this.database.identitySession.update({
      where: { id: sessionId },
      data: { assurance, authTime: now, lastSeenAt: now },
    });
  }

  async revokeSession(
    sessionId: string,
    reason: string,
    now: Date,
    personId?: string,
  ) {
    const updated = await this.database.identitySession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
        ...(personId ? { personId } : {}),
      },
      data: { revokedAt: now, revokedReason: reason, refreshHash: null },
    });
    return updated.count === 1;
  }

  async revokePersonSessions(
    personId: string,
    reason: string,
    now: Date,
    exceptSessionId?: string,
  ) {
    const updated = await this.database.identitySession.updateMany({
      where: {
        personId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: now, revokedReason: reason, refreshHash: null },
    });
    return updated.count;
  }

  async listSessions(personId: string, now: Date) {
    return this.database.identitySession.findMany({
      where: {
        personId,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        method: true,
        surface: true,
        assurance: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
    });
  }

  // ---------- Roles and grants ----------
  private async activeOwnerCount(tx: Prisma.TransactionClient) {
    return tx.identityRoleAssignment.count({
      where: { role: "owner", person: { status: "active" } },
    });
  }

  async ownerExists(): Promise<boolean> {
    return (
      (await this.database.identityRoleAssignment.count({
        where: { role: "owner", person: { status: "active" } },
      })) > 0
    );
  }

  async addRole(personId: string, role: Role, grantedBy: string | null) {
    try {
      await this.database.identityRoleAssignment.create({
        data: { personId, role, grantedBy },
      });
      return "added" as const;
    } catch (error) {
      if (isUnique(error)) return "exists" as const;
      throw error;
    }
  }

  async removeRole(personId: string, role: Role) {
    return this.database.$transaction(async (tx) => {
      // Serialize owner changes so two owners cannot remove each other concurrently.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity_owner_roles'))`;
      const exists = await tx.identityRoleAssignment.findUnique({
        where: { personId_role: { personId, role } },
      });
      if (!exists) return "not_found" as const;
      if (role === "owner" && (await this.activeOwnerCount(tx)) <= 1)
        return "last_owner" as const;
      await tx.identityRoleAssignment.delete({
        where: { personId_role: { personId, role } },
      });
      return "removed" as const;
    });
  }

  async addGrant(
    personId: string,
    permission: string,
    grantedBy: string | null,
  ) {
    try {
      await this.database.identityCapabilityGrant.create({
        data: { personId, permission, grantedBy },
      });
      return "added" as const;
    } catch (error) {
      if (isUnique(error)) return "exists" as const;
      throw error;
    }
  }

  async removeGrant(personId: string, permission: string) {
    const removed = await this.database.identityCapabilityGrant.deleteMany({
      where: { personId, permission },
    });
    return removed.count ? ("removed" as const) : ("not_found" as const);
  }

  async personStatus(personId: string) {
    const row = await this.database.identityPerson.findUnique({
      where: { id: personId },
      select: { status: true },
    });
    return row?.status ?? null;
  }

  /**
   * Consolidates `sourceId` into `targetId` atomically: links, local credential,
   * grants and other modules' data move to the target; the source becomes
   * `merged` and its sessions end. `absorbableBy` restricts a self-service merge
   * to a source whose only sign-in method is the link the person just proved.
   */
  async merge(input: {
    sourceId: string;
    targetId: string;
    absorbableBy?: { linkId: string };
    transfer: OwnershipTransfer;
    now: Date;
  }): Promise<MergeResult> {
    if (input.sourceId === input.targetId) return { result: "not_found" };
    return this.database
      .$transaction(async (tx): Promise<MergeResult> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('identity_owner_roles'))`;
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status FROM identity_persons
          WHERE id IN (${input.sourceId}::uuid, ${input.targetId}::uuid)
          ORDER BY id FOR UPDATE`;
        if (
          locked.length !== 2 ||
          locked.some((row) => row.status !== "active")
        )
          return { result: "not_found" };
        const source = await tx.identityPerson.findUniqueOrThrow({
          where: { id: input.sourceId },
          include: {
            roles: true,
            grants: true,
            externalIdentities: true,
            localCredential: true,
          },
        });
        const target = await tx.identityPerson.findUniqueOrThrow({
          where: { id: input.targetId },
          include: { externalIdentities: true, localCredential: true },
        });
        if (source.roles.some((role) => role.role === "owner"))
          return { result: "owner" };
        if (
          input.absorbableBy &&
          (source.localCredential !== null ||
            source.grants.length > 0 ||
            source.externalIdentities.length !== 1 ||
            source.externalIdentities[0].id !== input.absorbableBy.linkId)
        )
          return { result: "not_absorbable" };
        if (
          source.externalIdentities.some((link) =>
            target.externalIdentities.some(
              (existing) =>
                existing.provider === link.provider &&
                existing.issuer === link.issuer,
            ),
          )
        )
          return { result: "provider_conflict" };
        if (
          (await input.transfer(tx, input.sourceId, input.targetId)) === "busy"
        )
          throw new MergeBusy();
        await tx.identityExternalIdentity.updateMany({
          where: { personId: input.sourceId },
          data: { personId: input.targetId },
        });
        if (source.localCredential && !target.localCredential) {
          await tx.$executeRaw`UPDATE identity_local_credentials SET person_id = ${input.targetId}::uuid WHERE person_id = ${input.sourceId}::uuid`;
          await tx.$executeRaw`UPDATE identity_recovery_codes SET person_id = ${input.targetId}::uuid WHERE person_id = ${input.sourceId}::uuid`;
        } else {
          await tx.identityRecoveryCode.deleteMany({
            where: { personId: input.sourceId },
          });
          await tx.identityLocalCredential.deleteMany({
            where: { personId: input.sourceId },
          });
        }
        if (source.grants.length)
          await tx.identityCapabilityGrant.createMany({
            data: source.grants.map((grant) => ({
              personId: input.targetId,
              permission: grant.permission,
              grantedBy: grant.grantedBy,
            })),
            skipDuplicates: true,
          });
        await tx.identityCapabilityGrant.deleteMany({
          where: { personId: input.sourceId },
        });
        await tx.identitySession.updateMany({
          where: { personId: input.sourceId, revokedAt: null },
          data: {
            revokedAt: input.now,
            revokedReason: "person_merged",
            refreshHash: null,
          },
        });
        await tx.identityTicket.updateMany({
          where: { personId: input.sourceId, consumedAt: null },
          data: { consumedAt: input.now },
        });
        await tx.identityPerson.update({
          where: { id: input.sourceId },
          data: {
            status: "merged",
            mergedInto: input.targetId,
            updatedAt: input.now,
          },
        });
        return { result: "merged", links: source.externalIdentities.length };
      })
      .catch((error: unknown): MergeResult => {
        if (error instanceof MergeBusy) return { result: "busy" };
        throw error;
      });
  }

  // ---------- Tickets ----------
  async createTicket(input: {
    purpose: TicketPurpose;
    tokenHash: string;
    personId?: string | null;
    payload?: Record<string, unknown>;
    createdBy?: string | null;
    expiresAt: Date;
  }) {
    await this.database.identityTicket.create({
      data: {
        id: randomUUID(),
        purpose: input.purpose,
        tokenHash: input.tokenHash,
        personId: input.personId ?? null,
        payload: json(input.payload ?? {}),
        createdBy: input.createdBy ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  /** Single-use: only one concurrent consumer can win. */
  async consumeTicket(
    purpose: TicketPurpose,
    tokenHash: string,
    now: Date,
  ): Promise<Ticket | null> {
    const rows = await this.database.$queryRaw<
      {
        id: string;
        person_id: string | null;
        payload: Record<string, unknown>;
        created_by: string | null;
      }[]
    >`
      UPDATE identity_tickets SET consumed_at = ${now}
      WHERE token_hash = ${tokenHash} AND purpose = ${purpose}
        AND consumed_at IS NULL AND expires_at > ${now}
      RETURNING id, person_id, payload, created_by`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          personId: row.person_id,
          payload: row.payload,
          createdBy: row.created_by,
        }
      : null;
  }

  async peekTicket(purpose: TicketPurpose, tokenHash: string, now: Date) {
    const row = await this.database.identityTicket.findFirst({
      where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } },
      select: { personId: true, payload: true, createdBy: true },
    });
    return row
      ? {
          personId: row.personId,
          payload: row.payload as Record<string, unknown>,
          createdBy: row.createdBy,
        }
      : null;
  }

  async invalidateTickets(
    personId: string,
    purposes: readonly TicketPurpose[],
    now: Date,
    filter?: (payload: Record<string, unknown>) => boolean,
  ) {
    if (!filter) {
      await this.database.identityTicket.updateMany({
        where: { personId, purpose: { in: [...purposes] }, consumedAt: null },
        data: { consumedAt: now },
      });
      return;
    }
    const open = await this.database.identityTicket.findMany({
      where: { personId, purpose: { in: [...purposes] }, consumedAt: null },
      select: { id: true, payload: true },
    });
    const ids = open
      .filter((item) => filter(item.payload as Record<string, unknown>))
      .map((item) => item.id);
    if (ids.length)
      await this.database.identityTicket.updateMany({
        where: { id: { in: ids } },
        data: { consumedAt: now },
      });
  }

  /** Records an assertion jti; false when it was already used. */
  async useAssertion(jtiHash: string, expiresAt: Date): Promise<boolean> {
    try {
      await this.database.identityUsedAssertion.create({
        data: { jtiHash, expiresAt },
      });
      return true;
    } catch (error) {
      if (isUnique(error)) return false;
      throw error;
    }
  }

  // ---------- Audit and maintenance ----------
  async audit(
    action: string,
    actorPersonId: string | null,
    targetPersonId: string | null,
    details: Record<string, string | number | boolean | null> = {},
  ) {
    await this.database.identityAuditEvent.create({
      data: {
        id: randomUUID(),
        action,
        actorPersonId,
        targetPersonId,
        details: json(details),
      },
    });
  }

  async auditFor(personId: string, limit = 50) {
    return this.database.identityAuditEvent.findMany({
      where: {
        OR: [{ targetPersonId: personId }, { actorPersonId: personId }],
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }

  async prune(now: Date) {
    const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);
    await this.database.$transaction([
      this.database.identitySession.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      }),
      this.database.identityTicket.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      }),
      this.database.identityUsedAssertion.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);
  }
}
