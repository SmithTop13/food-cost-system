import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/** Apply every migration in `migrations/` not yet applied, each in its own transaction. Returns the names applied. */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise concurrent migrators (e.g. two API instances starting together).
      await client.query("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))");
      const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (done.rowCount === 0) {
        await client.query(await readFile(new URL(name, MIGRATIONS_DIR), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        applied.push(name);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}
