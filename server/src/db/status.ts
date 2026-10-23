import { readdir } from "node:fs/promises";
import { env } from "../config/env.js";
import { createPool } from "./pool.js";

// Lists each migration file as applied or pending.
const pool = createPool(env.DATABASE_URL);
try {
  const files = (await readdir("migrations")).filter((file) => file.endsWith(".sql")).sort();
  const exists = await pool.query("SELECT to_regclass('public.pgmigrations') AS t");
  const applied = new Set<string>(
    exists.rows[0].t ? (await pool.query("SELECT name FROM pgmigrations")).rows.map((row) => row.name) : [],
  );
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    console.log(`${applied.has(name) ? "applied" : "pending"}  ${name}`);
  }
} catch (error) {
  console.error(`Status failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
