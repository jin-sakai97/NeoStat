import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../../src/app.js";

const app = createApp({ clientOrigin: "http://localhost:3000", checkDatabase: async () => {} });

test("health reports database readiness and does not leak connection errors", async () => {
  await request(app).get("/api/health").expect(200, { data: { status: "ok" } });
  const failing = createApp({ clientOrigin: "http://localhost:3000", checkDatabase: async () => { throw new Error("secret"); } });
  const response = await request(failing).get("/api/health").expect(503);
  assert.equal(response.body.error.code, "DB_UNAVAILABLE");
  assert.equal(JSON.stringify(response.body).includes("secret"), false);
});

test("CORS permits the configured frontend origin", async () => {
  const response = await request(app).get("/api/health").set("Origin", "http://localhost:3000");
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  const other = await request(app).get("/api/health").set("Origin", "https://other.example");
  assert.notEqual(other.headers["access-control-allow-origin"], "https://other.example");
});

test("unknown routes and malformed JSON return meaningful errors", async () => {
  await request(app).get("/missing").expect(404);
  const response = await request(app).post("/api/health").set("Content-Type", "application/json").send("{").expect(400);
  assert.equal(response.body.error.code, "INVALID_JSON");
  await request(app).post("/api/health").send({ text: "a".repeat(110000) }).expect(413);
});
