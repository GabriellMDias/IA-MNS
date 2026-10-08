import type { Database } from "./database.js";
import { Prisma } from "./generated/prisma/client.js";
import type { ParameterKey, ParameterStore } from "./parameters.js";

/** PostgreSQL store of saved operational parameter values. */
export function prismaParameterStore(database: Database): ParameterStore {
  return {
    async read(key) {
      return database.operationalParameter.findUnique({ where: { key } });
    },
    async list() {
      return database.operationalParameter.findMany({
        orderBy: { key: "asc" },
      });
    },
    async write(
      key: ParameterKey,
      value: string | readonly string[] | null,
      expectedVersion: number,
      actor: string,
      now: Date,
      record?: (transaction: unknown) => Promise<void>,
    ) {
      const data = {
        value:
          value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue),
        updatedBy: actor,
        updatedAt: now,
      };
      // The change and its record (the audit event) commit together or not at all.
      return database.$transaction(async (transaction) => {
        let version: number | null;
        if (expectedVersion === 0) {
          const { count } = await transaction.operationalParameter.createMany({
            data: [{ key, version: 1, ...data }],
            skipDuplicates: true,
          });
          version = count === 1 ? 1 : null;
        } else {
          const { count } = await transaction.operationalParameter.updateMany({
            where: { key, version: expectedVersion },
            data: { ...data, version: expectedVersion + 1 },
          });
          version = count === 1 ? expectedVersion + 1 : null;
        }
        if (version !== null && record) await record(transaction);
        return version;
      });
    },
  };
}
