import pg from "pg";
import { migrate } from "./migrate.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
try {
  const applied = await migrate(pool);
  console.log(applied.length > 0 ? `applied: ${applied.join(", ")}` : "database is up to date");
} finally {
  await pool.end();
}
