import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Database = PrismaClient;

/** Creates the runtime PostgreSQL client; migration credentials never reach it. */
export function createDatabase(databaseUrl: string): Database {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
    }),
  });
}

export async function checkDatabase(database: Database): Promise<boolean> {
  await database.$queryRaw`SELECT 1`;
  return true;
}
