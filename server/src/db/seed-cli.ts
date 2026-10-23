import { env } from "../config/env.js";
import { createPool } from "./pool.js";
import { seedDatabase } from "./seed.js";

const pool = createPool(env.DATABASE_URL);
try {
  if (env.NODE_ENV === "production") throw new Error("Seed is for development only.");
  const inserted = await seedDatabase(pool);
  console.log(`Seed ready: ${inserted} rows inserted. Existing records were preserved.`);
} catch (error) {
  console.error(`Seed failed: ${error instanceof Error ? error.message : "unknown error"}. Check DATABASE_URL and run db:migrate first.`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
