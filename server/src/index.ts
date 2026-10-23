import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createPool, ping } from "./db/pool.js";

const pool = createPool(env.DATABASE_URL);
try {
  await ping(pool);
  const app = createApp({
    pool,
    clientOrigin: env.CLIENT_ORIGIN,
    sessionSecret: env.SESSION_SECRET,
    secureCookies: env.NODE_ENV === "production",
  });
  const server = app.listen(env.PORT, () => {
    console.log(`API listening at http://localhost:${env.PORT}/api`);
  });
  server.on("error", async () => {
    console.error("API could not listen. Check PORT and whether another server is running.");
    await pool.end();
    process.exitCode = 1;
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timeout);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  console.error("API startup failed. Check DATABASE_URL, start PostgreSQL and run db:migrate.");
  await pool.end();
  process.exitCode = 1;
}
