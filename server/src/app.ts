import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";

type AppOptions = {
  clientOrigin: string;
  checkDatabase: () => Promise<void>;
};

export function createApp({ clientOrigin, checkDatabase }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ data: { status: "ok" } });
    } catch {
      res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "The database is unavailable." } });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Try again." } });
  };
  app.use(errorHandler);
  return app;
}
