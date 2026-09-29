import pg from "pg";
import { expect, it } from "vitest";
import { generateDatabaseReference } from "../scripts/database-reference.js";
import {
  assertPrismaSchemaMatchesDatabase,
  withMigratedDatabase,
} from "../scripts/migrated-database.js";

it("checks authored schema drift and refuses undocumented PostgreSQL object kinds", async () => {
  await withMigratedDatabase(async (_runtimeUrl, migrationUrl) => {
    const client = new pg.Client({ connectionString: migrationUrl });
    await client.connect();
    try {
      await assertPrismaSchemaMatchesDatabase(migrationUrl);
      const reference = await generateDatabaseReference(migrationUrl);
      expect(reference).toContain("PRIMARY KEY (id)");
      expect(reference.match(/`approval_requests_pkey`/g)).toHaveLength(1);

      await client.query(
        "ALTER TABLE approval_requests ADD COLUMN undocumented text",
      );
      await expect(
        assertPrismaSchemaMatchesDatabase(migrationUrl),
      ).rejects.toThrow("Prisma schema differs from committed migrations");
      await expect(generateDatabaseReference(migrationUrl)).rejects.toThrow(
        "Schema documentation mismatch at approval_requests.columns",
      );
      await client.query(
        "ALTER TABLE approval_requests DROP COLUMN undocumented",
      );
      await client.query(
        "CREATE INDEX undocumented_pkey ON approval_requests (title)",
      );
      await expect(generateDatabaseReference(migrationUrl)).rejects.toThrow(
        "Schema documentation mismatch at approval_requests.objects",
      );
      await client.query("DROP INDEX undocumented_pkey");
      await client.query("CREATE TABLE undocumented_empty_table ()");
      await expect(generateDatabaseReference(migrationUrl)).rejects.toThrow(
        "Schema documentation mismatch at tables",
      );
      await client.query("DROP TABLE undocumented_empty_table");

      const unsupported = [
        [
          "CREATE SCHEMA unsupported_schema",
          "DROP SCHEMA unsupported_schema",
          "schema unsupported_schema",
        ],
        [
          "CREATE VIEW unsupported_view AS SELECT id FROM approval_requests",
          "DROP VIEW unsupported_view",
          "relation unsupported_view",
        ],
        [
          "CREATE SEQUENCE unsupported_sequence",
          "DROP SEQUENCE unsupported_sequence",
          "relation unsupported_sequence",
        ],
        [
          "CREATE DOMAIN unsupported_domain AS text",
          "DROP DOMAIN unsupported_domain",
          "type unsupported_domain",
        ],
        [
          "ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY",
          "ALTER TABLE approval_requests DISABLE ROW LEVEL SECURITY",
          "row-level security approval_requests",
        ],
        [
          "CREATE FUNCTION unsupported_routine() RETURNS integer LANGUAGE sql AS 'SELECT 1'",
          "DROP FUNCTION unsupported_routine()",
          "routine unsupported_routine",
        ],
        [
          "ALTER TABLE approval_requests ADD COLUMN unsupported_generated integer GENERATED ALWAYS AS (version + 1) STORED",
          "ALTER TABLE approval_requests DROP COLUMN unsupported_generated",
          "generated column approval_requests.unsupported_generated",
        ],
      ];
      for (const [create, drop, failure] of unsupported) {
        await client.query(create);
        try {
          await expect(generateDatabaseReference(migrationUrl)).rejects.toThrow(
            failure,
          );
        } finally {
          await client.query(drop);
        }
      }
      expect(await generateDatabaseReference(migrationUrl)).toBe(reference);
    } finally {
      await client.end();
    }
  });
}, 120_000);
