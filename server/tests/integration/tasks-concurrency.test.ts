import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { P, T, U } from "../../src/db/fixtures.js";
import { loginAs, pool, resetDatabase } from "./helpers.js";

before(resetDatabase);
beforeEach(resetDatabase);
after(() => pool.end());

const demo = `/tasks/${T.demo}`;

test("D1: a stale update is rejected with 409 and the newer data survives", async () => {
  const a = await loginAs("manager@neostat.test");
  const b = await loginAs("member@neostat.test");
  const seenByA = (await a.get(demo).expect(200)).body.data;
  const seenByB = (await b.get(demo).expect(200)).body.data;
  assert.equal(seenByA.version, 1);
  assert.equal(seenByB.version, 1);

  const saved = await a.patch(demo, { version: 1, title: "Saved by A" }).expect(200);
  assert.equal(saved.body.data.version, 2);

  const stale = await b.patch(demo, { version: 1, title: "Saved by B" }).expect(409);
  assert.equal(stale.body.error.code, "TASK_VERSION_CONFLICT");
  assert.equal(stale.body.error.details.currentTask.version, 2);
  assert.equal(stale.body.error.details.currentTask.title, "Saved by A");

  const { rows } = await pool.query("SELECT title, version FROM tasks WHERE id = $1", [T.demo]);
  assert.deepEqual(rows[0], { title: "Saved by A", version: 2 });
});

test("D2: simultaneous same-version updates produce exactly one success", async () => {
  const a = await loginAs("manager@neostat.test");
  const b = await loginAs("admin@neostat.test");
  const results = await Promise.all([
    a.patch(demo, { version: 1, status: "IN_PROGRESS" }),
    b.patch(demo, { version: 1, status: "DONE" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const { rows } = await pool.query("SELECT version FROM tasks WHERE id = $1", [T.demo]);
  assert.equal(rows[0].version, 2);
});

test("D3: stale status, reassignment and delete are all rejected", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(demo, { version: 1, priority: "HIGH" }).expect(200);
  await manager.patch(demo, { version: 1, status: "DONE" }).expect(409);
  await manager.patch(demo, { version: 1, assigneeId: U.member2 }).expect(409);
  await manager.del(demo, { version: 1 }).expect(409);
  await manager.get(demo).expect(200);
  await manager.del(demo, { version: 2 }).expect(204);
  await manager.get(demo).expect(404);
});

test("D4: losing access takes precedence over conflict data", async () => {
  const member = await loginAs("member@neostat.test");
  const manager = await loginAs("manager@neostat.test");
  await manager.del(`/projects/${P.website}/members/${U.member}`).expect(204);
  const res = await member.patch(demo, { version: 1, title: "Too late" }).expect(404);
  assert.equal(res.body.error.details, undefined);
});

test("D5/C4: removing a member unassigns their tasks and bumps versions", async () => {
  const manager = await loginAs("manager@neostat.test");
  const before = await pool.query("SELECT id, version FROM tasks WHERE project_id = $1 AND assignee_id = $2", [P.website, U.member]);
  assert.ok(before.rowCount! >= 2);
  await manager.del(`/projects/${P.website}/members/${U.member}`).expect(204);
  for (const task of before.rows) {
    const { rows } = await pool.query("SELECT assignee_id, version FROM tasks WHERE id = $1", [task.id]);
    assert.equal(rows[0].assignee_id, null);
    assert.equal(rows[0].version, task.version + 1);
  }
  await manager.patch(demo, { version: 1, title: "Stale editor" }).expect(409);
  const comments = await pool.query("SELECT count(*)::int AS n FROM comments WHERE author_id = $1", [U.member]);
  assert.ok(comments.rows[0].n > 0, "authored comments are preserved");
});

test("D6: comments never change the task version", async () => {
  const member = await loginAs("member@neostat.test");
  const created = await member.post(`${demo}/comments`, { body: "Looks good" }).expect(201);
  await member.del(`/comments/${created.body.data.id}`).expect(204);
  const { rows } = await pool.query("SELECT version FROM tasks WHERE id = $1", [T.demo]);
  assert.equal(rows[0].version, 1);
});

test("D7: version is mandatory", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(demo, { title: "No version" }).expect(400);
  await manager.del(demo).expect(400);
});
