import pg from "pg";
import { buildApp } from "./app.js";
import { migrate } from "./migrate.js";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const applied = await migrate(pool);
if (applied.length > 0) console.log(`applied migrations: ${applied.join(", ")}`);

const trust = process.env["TRUST_PROXY"];
// e.g. TRUST_PROXY=10.0.0.5 (the dashboard server), so rate limits see real client addresses.
const app = buildApp(pool, trust ? { trustProxy: trust === "true" ? true : trust } : {});
const port = Number(process.env["PORT"] ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`api listening on :${port}`);
