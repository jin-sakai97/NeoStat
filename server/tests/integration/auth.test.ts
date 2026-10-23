import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { users } from "../../src/db/fixtures.js";
import { anonymous, app, loginAs, pool, resetDatabase } from "./helpers.js";

before(resetDatabase);
after(() => pool.end());

test("A1: every active seeded account can log in and the cookie is HttpOnly", async () => {
  for (const user of users.filter((u) => u.isActive)) {
    const anon = await anonymous();
    const res = await anon.post("/auth/login", { email: user.email, password: "NeoStatsDemo!2026" }).expect(200);
    assert.equal(res.body.data.user.role, user.role);
    const cookie = String(res.headers["set-cookie"]);
    assert.match(cookie, /neostat\.sid=/);
    assert.match(cookie, /HttpOnly/);
    assert.notEqual(res.body.data.csrfToken, anon.csrf, "token rotates on login");
  }
});

test("A2: wrong password, unknown email and inactive account fail identically", async () => {
  const anon = await anonymous();
  const bodies = [];
  for (const [email, password] of [["admin@neostat.test", "wrong-pass"], ["nobody@neostat.test", "NeoStatsDemo!2026"], ["inactive@neostat.test", "NeoStatsDemo!2026"]]) {
    bodies.push((await anon.post("/auth/login", { email, password }).expect(401)).body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], bodies[2]);
  assert.equal(bodies[0].error.code, "INVALID_CREDENTIALS");
});

test("A3/A4: anonymous requests get 401 and logout ends the session", async () => {
  await request(app).get("/api/auth/me").expect(401);
  const admin = await loginAs("admin@neostat.test");
  await admin.get("/auth/me").expect(200);
  await admin.post("/auth/logout").expect(204);
  await admin.get("/auth/me").expect(401);
});

test("A5: bumping auth_version (deactivation, role change) invalidates existing sessions", async () => {
  const member = await loginAs("member2@neostat.test");
  await member.get("/auth/me").expect(200);
  await pool.query("UPDATE users SET auth_version = auth_version + 1 WHERE email = 'member2@neostat.test'");
  await member.get("/auth/me").expect(401);
});

test("A6/A7: mutations without the CSRF token or from a foreign origin are rejected", async () => {
  const admin = await loginAs("admin@neostat.test");
  const noToken = await admin.agent.patch("/api/profile").send({ name: "Hacked" }).expect(403);
  assert.equal(noToken.body.error.code, "CSRF_FAILED");
  await admin.agent.patch("/api/profile").set("X-CSRF-Token", "wrong").send({ name: "Hacked" }).expect(403);
  await admin.patch("/profile", { name: "Hacked" }).set("Origin", "http://evil.test").expect(403);
  const { rows } = await pool.query("SELECT name FROM users WHERE email = 'admin@neostat.test'");
  assert.equal(rows[0].name, "Asha Admin");
});

test("A10: user payloads never expose credentials; profile updates the name only", async () => {
  const viewer = await loginAs("viewer@neostat.test");
  const res = await viewer.patch("/profile", { name: "  Vikram V  " }).expect(200);
  assert.equal(res.body.data.name, "Vikram V");
  const text = JSON.stringify(res.body) + JSON.stringify((await viewer.get("/auth/me")).body);
  assert.doesNotMatch(text, /password|hash|auth_?version/i);
  await viewer.patch("/profile", { name: "x", role: "ADMIN" }).expect(400);
});
