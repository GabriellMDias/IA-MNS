import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  applyRuntimeGrants,
  declaredGrants,
  migrationState,
  releaseMigrations,
  runtimeGrantStatements,
} from "../src/database-deploy.js";
import { withMigratedDatabase } from "../scripts/migrated-database.js";

// The deployment step production runs with the migration credential; the
// shared fixture already deployed the database through it.
describe("database deployment", () => {
  it("reads every declared runtime grant as table privileges", async () => {
    const grants = declaredGrants(await runtimeGrantStatements());
    expect(grants).toContainEqual({
      table: "agent_turn_traces",
      privilege: "INSERT",
    });
    expect(grants).not.toContainEqual({
      table: "identity_audit_events",
      privilege: "DELETE",
    });
    for (const statement of [
      "GRANT ALL ON ALL TABLES IN SCHEMA public TO orion_runtime",
      "GRANT SELECT ON TABLE public.agent_turns TO someone_else",
      "GRANT SELECT ON TABLE agent_turns TO orion_runtime",
    ])
      expect(() => declaredGrants([statement])).toThrow(
        "Unsupported runtime grant",
      );
  });

  it("is idempotent and refuses privileges or ownership beyond the declared grants", async () => {
    await withMigratedDatabase(async (runtimeUrl, migrationUrl) => {
      const admin = new pg.Client({ connectionString: migrationUrl });
      await admin.connect();
      try {
        const first = await applyRuntimeGrants(admin);
        expect(await applyRuntimeGrants(admin)).toEqual(first);
        expect(first.tables).toBeGreaterThan(0);

        await admin.query(
          "GRANT TRUNCATE ON TABLE public.agent_turns TO orion_runtime",
        );
        await expect(applyRuntimeGrants(admin)).rejects.toThrow(
          "holds table privileges that no runtime grant declares",
        );
        await admin.query(
          "REVOKE TRUNCATE ON TABLE public.agent_turns FROM orion_runtime",
        );

        await admin.query("GRANT CREATE ON SCHEMA public TO orion_runtime");
        await expect(applyRuntimeGrants(admin)).rejects.toThrow(
          "may create or owns database objects",
        );
        await admin.query("REVOKE CREATE ON SCHEMA public FROM orion_runtime");

        await admin.query("ALTER ROLE orion_runtime CREATEROLE");
        await expect(applyRuntimeGrants(admin)).rejects.toThrow(
          "administrative attributes",
        );
        await admin.query("ALTER ROLE orion_runtime NOCREATEROLE");
        await expect(applyRuntimeGrants(admin)).resolves.toEqual(first);
      } finally {
        await admin.end();
      }
      // The runtime credential still works after the repeated deployment.
      const runtime = new pg.Client({ connectionString: runtimeUrl });
      await runtime.connect();
      try {
        await runtime.query("SELECT id FROM agent_conversations LIMIT 0");
        await expect(
          runtime.query("CREATE TABLE intruder (id int)"),
        ).rejects.toThrow();
      } finally {
        await runtime.end();
      }
    });
  }, 120000);

  it("requires the runtime role the administrator creates", async () => {
    const client = {
      query: () => Promise.resolve({ rows: [] }),
    } as unknown as pg.Client;
    await expect(applyRuntimeGrants(client, [])).rejects.toThrow(
      "does not exist",
    );
  });

  it("compares the migration history with the release and refuses incompatible databases", async () => {
    await withMigratedDatabase(async (_runtimeUrl, migrationUrl) => {
      const admin = new pg.Client({ connectionString: migrationUrl });
      await admin.connect();
      try {
        const release = await releaseMigrations();
        const names = [...release.keys()];
        // Prisma records the SHA-256 of each shipped migration.sql.
        const current = await migrationState(admin, release);
        expect(current).toEqual({
          applied: names,
          pending: [],
          unknown: [],
          failed: [],
          modified: [],
          compatible: true,
        });
        // An older release sees its successor's migration as unknown.
        const older = new Map(release);
        older.delete(names.at(-1)!);
        expect(await migrationState(admin, older)).toMatchObject({
          unknown: [names.at(-1)],
          compatible: false,
        });
        // A newer release has a pending migration and stays compatible.
        const newer = new Map([
          ...release,
          ["209912310001_future", "0".repeat(64)],
        ]);
        expect(await migrationState(admin, newer)).toMatchObject({
          pending: ["209912310001_future"],
          compatible: true,
        });
        // A changed file of an applied migration is released history rewritten.
        const edited = new Map(release);
        edited.set(names[0], "f".repeat(64));
        expect(await migrationState(admin, edited)).toMatchObject({
          modified: [names[0]],
          compatible: false,
        });
        // A migration that started and never finished blocks every release.
        await admin.query(
          `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
           VALUES ('00000000-0000-4000-8000-000000000001', $1, '209912310002_interrupted', now(), 0)`,
          ["0".repeat(64)],
        );
        expect(await migrationState(admin, release)).toMatchObject({
          failed: ["209912310002_interrupted"],
          compatible: false,
        });
      } finally {
        await admin.end();
      }
    });
  }, 120000);

  it("treats an empty database as entirely pending", async () => {
    const client = {
      query: (sql: string) =>
        Promise.resolve({
          rows: sql.includes("to_regclass") ? [{ present: false }] : [],
        }),
    } as unknown as pg.Client;
    const release = new Map([["202610010001_first", "a".repeat(64)]]);
    expect(await migrationState(client, release)).toEqual({
      applied: [],
      pending: ["202610010001_first"],
      unknown: [],
      failed: [],
      modified: [],
      compatible: true,
    });
  });
});
