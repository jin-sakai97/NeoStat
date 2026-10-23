import "dotenv/config";
import { runner } from "node-pg-migrate";
import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { createApp } from "../../src/app.js";
import { DEMO_PASSWORD } from "../../src/db/fixtures.js";
import { createPool } from "../../src/db/pool.js";
import { seedDatabase } from "../../src/db/seed.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point to a database whose name ends in _test. Refusing to run.");
}

export const CLIENT_ORIGIN = "http://localhost:3000";
export const pool = createPool(url);
export const app = createApp({ pool, clientOrigin: CLIENT_ORIGIN, sessionSecret: "integration-test-secret-0123456789abcdef" });

// Fresh schema + migrations + fixtures, so every test file starts from the seed.
export async function resetDatabase() {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runner({ databaseUrl: url!, dir: "migrations", direction: "up", migrationsTable: "pgmigrations", log: () => {}, count: Infinity });
  await seedDatabase(pool);
}

export type Client = {
  agent: TestAgent;
  csrf: string;
  get: (path: string) => request.Test;
  post: (path: string, body?: object) => request.Test;
  patch: (path: string, body?: object) => request.Test;
  put: (path: string, body?: object) => request.Test;
  del: (path: string, body?: object) => request.Test;
};

function wrap(agent: TestAgent, csrf: string): Client {
  const send = (method: "post" | "patch" | "put" | "delete") => (path: string, body?: object) => {
    const req = agent[method](`/api${path}`).set("X-CSRF-Token", csrf);
    return body ? req.send(body) : req;
  };
  return { agent, csrf, get: (path) => agent.get(`/api${path}`), post: send("post"), patch: send("patch"), put: send("put"), del: send("delete") };
}

export async function anonymous(): Promise<Client> {
  const agent = request.agent(app);
  const { body } = await agent.get("/api/auth/csrf").expect(200);
  return wrap(agent, body.data.csrfToken);
}

export async function loginAs(email: string, password = DEMO_PASSWORD): Promise<Client> {
  const anon = await anonymous();
  const { body } = await anon.post("/auth/login", { email, password }).expect(200);
  return wrap(anon.agent, body.data.csrfToken);
}
