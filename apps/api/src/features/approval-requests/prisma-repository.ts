import {
  Prisma,
  type ApprovalRequest as Row,
} from "../../generated/prisma/client.js";
import { createDatabase, type Database } from "../../database.js";
import type { ApprovalRequest, Status } from "./domain.js";
import type { CreateInput, Repository } from "./service.js";

function map(row: Row): ApprovalRequest {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    description: row.description,
    status: row.status,
    version: row.version,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
type RawRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  status: Status;
  version: number;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
};
function mapRaw(row: RawRow): ApprovalRequest {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    status: row.status,
    version: row.version,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PrismaApprovalRequestRepository implements Repository {
  readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }
  async create(
    input: CreateInput & {
      id: string;
      creatorId: string;
      idempotencyKey: string;
      intentFingerprint: string;
    },
  ) {
    try {
      const row = await this.db.approvalRequest.create({ data: input });
      return {
        item: map(row),
        fingerprint: row.intentFingerprint,
        replayed: false,
      };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
      const row = await this.db.approvalRequest.findUnique({
        where: {
          creatorId_idempotencyKey: {
            creatorId: input.creatorId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!row) throw error;
      return {
        item: map(row),
        fingerprint: row.intentFingerprint,
        replayed: true,
      };
    }
  }
  async get(id: string) {
    const row = await this.db.approvalRequest.findUnique({ where: { id } });
    return row ? map(row) : null;
  }
  async list(input: {
    scope: "mine" | "reviewable";
    principalId: string;
    limit: number;
    before?: { createdAt: Date; id: string };
  }) {
    const rows = await this.db.approvalRequest.findMany({
      where: {
        ...(input.scope === "mine"
          ? { creatorId: input.principalId }
          : {
              creatorId: { not: input.principalId },
              status: "SUBMITTED" as const,
            }),
        ...(input.before
          ? {
              OR: [
                { createdAt: { lt: input.before.createdAt } },
                {
                  createdAt: input.before.createdAt,
                  id: { lt: input.before.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
    return rows.map(map);
  }
  async compareAndSwap(input: {
    id: string;
    creatorId: string;
    expectedVersion: number;
    sourceStatus: Status;
    nextStatus: Status;
    title?: string;
    description?: string | null;
    rejectionReason?: string | null;
    requireOwner: boolean;
  }) {
    const edit = input.title !== undefined;
    const rows = await this.db.$queryRaw<RawRow[]>`
      UPDATE approval_requests SET
        status = ${input.nextStatus}::"ApprovalRequestStatus",
        version = version + 1,
        title = CASE WHEN ${edit} THEN ${input.title ?? ""} ELSE title END,
        description = CASE WHEN ${edit} THEN ${input.description ?? null} ELSE description END,
        rejection_reason = ${input.rejectionReason ?? null},
        updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 millisecond')
      WHERE id = ${input.id}::uuid
        AND version = ${input.expectedVersion}
        AND status = ${input.sourceStatus}::"ApprovalRequestStatus"
        AND (${input.requireOwner} = false OR creator_id = ${input.creatorId}::uuid)
        AND (${input.requireOwner} = true OR creator_id <> ${input.creatorId}::uuid)
      RETURNING id, creator_id, title, description, status, version, rejection_reason, created_at, updated_at`;
    return rows[0] ? mapRaw(rows[0]) : null;
  }
}

export function createRepository(
  databaseUrl: string,
): PrismaApprovalRequestRepository {
  return new PrismaApprovalRequestRepository(createDatabase(databaseUrl));
}
