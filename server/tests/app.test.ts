import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp({ clientOrigin: "http://localhost:3000", checkDatabase: async () => {} });

test("hello route connects the client and validates input", async () => {
  const response = await request(app).get("/api/hello?name=Alex").expect(200);
  assert.match(response.body.message, /Hello, Alex!/);
  await request(app).get("/api/hello?name=").expect(400);
  await request(app).get("/api/hello?name=a&name=b").expect(400);
});

test("health reports database readiness and does not leak connection errors", async () => {
  await request(app).get("/api/health").expect(200, { status: "ok", database: "connected" });
  const failing = createApp({ clientOrigin: "http://localhost:3000", checkDatabase: async () => { throw new Error("secret"); } });
  const response = await request(failing).get("/api/health").expect(503);
  assert.equal(response.body.database, "disconnected");
  assert.equal(JSON.stringify(response.body).includes("secret"), false);
});

test("CORS permits the configured frontend origin", async () => {
  const response = await request(app).get("/api/hello").set("Origin", "http://localhost:3000");
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  const other = await request(app).get("/api/hello").set("Origin", "https://other.example");
  assert.notEqual(other.headers["access-control-allow-origin"], "https://other.example");
});

test("unknown routes and malformed JSON return meaningful errors", async () => {
  await request(app).get("/missing").expect(404);
  const response = await request(app).post("/api/hello").set("Content-Type", "application/json").send("{").expect(400);
  assert.equal(response.body.error.message, "Request body must be valid JSON.");
  await request(app).post("/api/hello").send({ text: "a".repeat(110000) }).expect(413);
});
