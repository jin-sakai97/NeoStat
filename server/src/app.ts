import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { z } from "zod";

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

  app.get("/api/hello", (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80).default("NeoStat") }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "name must be a string between 1 and 80 characters." } });
      return;
    }
    res.json({ message: `Hello, ${parsed.data.name}! Your Express API is ready.` });
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "disconnected" });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { message: "Route not found." } });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: { message: "Request body must be valid JSON." } });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: { message: "Request body is too large." } });
      return;
    }
    res.status(500).json({ error: { message: "An unexpected error occurred." } });
  };
  app.use(errorHandler);
  return app;
}
