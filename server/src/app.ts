import cors from "cors";
import express from "express";
import helmet from "helmet";
import type pg from "pg";
import { ping } from "./db/pool.js";
import { loadActor } from "./http/actor.js";
import { csrfProtection } from "./http/csrf.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { sessionMiddleware } from "./http/session.js";
import { authRoutes, sessionRoutes } from "./routes/auth.routes.js";

type AppOptions = {
  pool: pg.Pool;
  clientOrigin: string;
  sessionSecret: string;
  secureCookies?: boolean;
  checkDatabase?: () => Promise<void>;
};

export function createApp({ pool, clientOrigin, sessionSecret, secureCookies = false, checkDatabase = () => ping(pool) }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(helmet());
  app.use(cors({ origin: clientOrigin, credentials: true, allowedHeaders: ["Content-Type", "X-CSRF-Token"] }));
  app.use(express.json({ limit: "100kb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ data: { status: "ok" } });
    } catch {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "The database is unavailable." } });
    }
  });

  app.use("/api", sessionMiddleware(pool, sessionSecret, secureCookies));
  app.use("/api", csrfProtection(clientOrigin));
  app.use("/api", authRoutes(pool));
  app.use("/api", loadActor(pool));
  app.use("/api", sessionRoutes(pool));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
