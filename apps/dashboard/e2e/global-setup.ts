import pg from "pg";
import { DATABASE_URL } from "../playwright.config";

/**
 * Every run signs up from the same local address. Clear the e2e database's rate-limit
 * counters so repeated local runs do not trip the sign-up limit (10 per address per hour).
 * The table may not exist yet on a brand-new database; the API creates it on start.
 */
export default async function globalSetup() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query("DELETE FROM rate_limits").catch((error: { code?: string }) => {
      if (error.code !== "42P01") throw error; // undefined_table
    });
  } finally {
    await pool.end();
  }
}
