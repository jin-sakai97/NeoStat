import "dotenv/config";
import { z } from "zod";

const postgresUrl = z.string().regex(/^postgres(?:ql)?:\/\//);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: postgresUrl,
  TEST_DATABASE_URL: postgresUrl.optional(),
  SESSION_SECRET: z.string().min(32),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  // Report field names, never environment values (which may contain credentials).
  throw new Error(`Invalid environment: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}. See server/.env.example.`);
}
export const env = result.data;
