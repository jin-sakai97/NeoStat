import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { P, T, U } from "../../src/db/fixtures.js";
import { loginAs, pool, resetDatabase } from "./helpers.js";

before(resetDatabase);
beforeEach(resetDatabase);
after(() => pool.end());

const history = async (client: Awaited<ReturnType<typeof loginAs>>, taskId: string) =>
  (await client.get(`/tasks/${taskId}/activity`).expect(200)).body.data as {
    kind: string; version: number; actor: { id: string }; changes: Record<string, { from: unknown; to: unknown }>;
  }[];

test("E13: creation and real changes are recorded; a no-op PATCH adds no row", async () => {
  const manager = await loginAs("manager@neostat.test");
  const created = (await manager.post(`/projects/${P.website}/tasks`, { title: "History demo" }).expect(201)).body.data;
  const edited = (await manager.patch(`/tasks/${created.id}`, { version: 1, title: "History demo 2", status: "IN_PROGRESS" }).expect(200)).body.data;
  await manager.patch(`/tasks/${created.id}`, { version: edited.version, title: "History demo 2" }).expect(200);

  const rows = await history(manager, created.id);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.kind, r.version]), [["UPDATED", 2], ["CREATED", 1]]);
  assert.deepEqual(rows[0].changes, {
    title: { from: "History demo", to: "History demo 2" },
    status: { from: "TODO", to: "IN_PROGRESS" },
  });
  assert.deepEqual(rows[1].changes, {});
  assert.equal(rows[0].actor.id, U.manager);
});

test("E13: due date and cleared values are recorded as strings and null", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(`/tasks/${T.demo}`, { version: 1, dueDate: null, description: "" }).expect(200);
  const [row] = await history(manager, T.demo);
  assert.deepEqual(Object.keys(row.changes).sort(), ["description", "dueDate"]);
  assert.equal(row.changes.dueDate.to, null);
  assert.match(String(row.changes.dueDate.from), /^\d{4}-\d{2}-\d{2}$/);
});

test("E14: reassigning and the unassign cleanup are recorded with name snapshots", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(`/tasks/${T.demo}`, { version: 1, assigneeId: U.member2 }).expect(200);
  await manager.del(`/projects/${P.website}/members/${U.member2}`).expect(204);

  const rows = await history(manager, T.demo);
  assert.deepEqual(rows.map((r) => r.version), [3, 2]);
  assert.deepEqual(rows[1].changes.assigneeId, { from: { id: U.member, name: "Meera Member" }, to: { id: U.member2, name: "Kabir Member" } });
  assert.deepEqual(rows[0].changes.assigneeId, { from: { id: U.member2, name: "Kabir Member" }, to: null });
  assert.equal(rows[0].actor.id, U.manager);

  const { rows: task } = await pool.query("SELECT version FROM tasks WHERE id = $1", [T.demo]);
  assert.equal(task[0].version, rows[0].version, "history version matches the task version");
});

test("E14: deactivating a user records one row per unassigned task", async () => {
  const admin = await loginAs("admin@neostat.test");
  const before = await pool.query("SELECT id FROM tasks WHERE assignee_id = $1", [U.member2]);
  assert.ok(before.rows.length > 1);
  await admin.patch(`/users/${U.member2}`, { isActive: false }).expect(200);
  const { rows } = await pool.query(
    "SELECT task_id, actor_id FROM task_activity WHERE changes -> 'assigneeId' -> 'from' ->> 'id' = $1",
    [U.member2],
  );
  assert.deepEqual(rows.map((r) => r.task_id).sort(), before.rows.map((r) => r.id).sort());
  assert.ok(rows.every((r) => r.actor_id === U.admin));
});

test("E15: activity follows task visibility; viewers can read it", async () => {
  const mobileTask = (await pool.query("SELECT id FROM tasks WHERE project_id = $1 LIMIT 1", [P.mobile])).rows[0].id;
  const member2 = await loginAs("member2@neostat.test");
  await member2.get(`/tasks/${mobileTask}/activity`).expect(404);
  await member2.get(`/tasks/${randomUUID()}/activity`).expect(404);
  await member2.get(`/tasks/not-a-uuid/activity`).expect(400);
  const viewer = await loginAs("viewer@neostat.test");
  await viewer.get(`/tasks/${T.demo}/activity`).expect(200);
  const admin = await loginAs("admin@neostat.test");
  await admin.get(`/tasks/${mobileTask}/activity`).expect(200);
});

test("E16: rejected writes leave no history", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");
  const viewer = await loginAs("viewer@neostat.test");
  await manager.patch(`/tasks/${T.demo}`, { version: 1, title: "Winner" }).expect(200);
  await member.patch(`/tasks/${T.demo}`, { version: 1, title: "Loser" }).expect(409);
  await member.patch(`/tasks/${T.demo}`, { version: 2, assigneeId: U.member2 }).expect(403);
  await viewer.patch(`/tasks/${T.demo}`, { version: 2, title: "Nope" }).expect(403);
  const rows = await history(manager, T.demo);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].changes.title?.to, "Winner");
});

test("Deleting a task removes its history", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(`/tasks/${T.demo}`, { version: 1, title: "Gone soon" }).expect(200);
  await manager.del(`/tasks/${T.demo}`, { version: 2 }).expect(204);
  const { rows } = await pool.query("SELECT 1 FROM task_activity WHERE task_id = $1", [T.demo]);
  assert.equal(rows.length, 0);
});
