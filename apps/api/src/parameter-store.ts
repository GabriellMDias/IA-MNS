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
    ) {
      const data = {
        value:
          value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue),
        updatedBy: actor,
        updatedAt: now,
      };
      if (expectedVersion === 0) {
        const { count } = await database.operationalParameter.createMany({
          data: [{ key, version: 1, ...data }],
          skipDuplicates: true,
        });
        return count === 1 ? 1 : null;
      }
      const { count } = await database.operationalParameter.updateMany({
        where: { key, version: expectedVersion },
        data: { ...data, version: expectedVersion + 1 },
      });
      return count === 1 ? expectedVersion + 1 : null;
    },
  };
}
