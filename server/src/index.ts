import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase, pingDatabase } from "./db/connection.js";

try {
  await connectDatabase();
  const app = createApp({ clientOrigin: env.CLIENT_ORIGIN, checkDatabase: pingDatabase });
  const server = app.listen(env.PORT, () => {
    console.log(`API listening at http://localhost:${env.PORT}/api`);
  });
  server.on("error", async () => {
    console.error("API could not listen. Check PORT and whether another server is running.");
    await disconnectDatabase();
    process.exitCode = 1;
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await disconnectDatabase();
      clearTimeout(timeout);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  console.error("API startup failed. Check MONGODB_URI and start MongoDB before running the API.");
  await disconnectDatabase();
  process.exitCode = 1;
}
