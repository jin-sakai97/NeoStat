import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { P, T, U } from "../../src/db/fixtures.js";
import { loginAs, pool, resetDatabase } from "./helpers.js";

beforeEach(resetDatabase);
after(() => pool.end());

const managerRows = (projectId: string) =>
  pool.query("SELECT user_id FROM project_members WHERE project_id = $1 AND role = 'PROJECT_MANAGER'", [projectId]);

test("C1/C2: creating a project inserts exactly one eligible manager", async () => {
  const admin = await loginAs("admin@neostat.test");
  const created = await admin.post("/projects", { name: "  New Thing ", managerId: U.manager2 }).expect(201);
  assert.equal(created.body.data.name, "New Thing");
  assert.equal(created.body.data.manager.id, U.manager2);
  assert.equal((await managerRows(created.body.data.id)).rowCount, 1);
  await admin.post("/projects", { name: "Bad", managerId: U.member }).expect(400);
  await (await loginAs("manager@neostat.test")).post("/projects", { name: "x", managerId: U.manager }).expect(403);
});

test("C3/C6: manager replacement keeps one manager; the manager cannot be removed or downgraded", async () => {
  const admin = await loginAs("admin@neostat.test");
  await admin.del(`/projects/${P.website}/members/${U.manager}`).expect(409);
  await admin.patch(`/projects/${P.website}/members/${U.manager}`, { role: "VIEWER" }).expect(409);
  const res = await admin.put(`/projects/${P.website}/manager`, { userId: U.manager2 }).expect(200);
  assert.equal(res.body.data.manager.id, U.manager2);
  const rows = await managerRows(P.website);
  assert.deepEqual(rows.rows, [{ user_id: U.manager2 }]);
  const old = await pool.query("SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2", [P.website, U.manager]);
  assert.equal(old.rows[0].role, "TEAM_MEMBER");
});

test("C5/C18: downgrade to Viewer clears assignments; duplicates conflict", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(`/projects/${P.website}/members/${U.member}`, { role: "VIEWER" }).expect(200);
  const { rows } = await pool.query("SELECT assignee_id, version FROM tasks WHERE id = $1", [T.demo]);
  assert.deepEqual(rows[0], { assignee_id: null, version: 2 });
  const dup = await manager.post(`/projects/${P.website}/members`, { userId: U.member2, role: "VIEWER" }).expect(409);
  assert.equal(dup.body.error.code, "MEMBER_EXISTS");
});

test("C7/C8/C9: deactivation guards managers, unassigns everywhere and kills sessions", async () => {
  const admin = await loginAs("admin@neostat.test");
  const blocked = await admin.patch(`/users/${U.manager}`, { isActive: false }).expect(409);
  assert.equal(blocked.body.error.code, "MANAGER_REQUIRED");

  const member = await loginAs("member@neostat.test");
  await admin.patch(`/users/${U.member}`, { isActive: false }).expect(200);
  await member.get("/auth/me").expect(401);
  const left = await pool.query("SELECT count(*)::int AS n FROM tasks WHERE assignee_id = $1", [U.member]);
  assert.equal(left.rows[0].n, 0);
  const memberships = await pool.query("SELECT count(*)::int AS n FROM project_members WHERE user_id = $1", [U.member]);
  assert.equal(memberships.rows[0].n, 2);

  await admin.patch(`/users/${U.member}`, { isActive: true }).expect(200);
  await loginAs("member@neostat.test");
});

test("C10/C11/C12: self-lockout and last-admin guards hold under concurrency", async () => {
  const a = await loginAs("admin@neostat.test");
  const b = await loginAs("admin2@neostat.test");
  assert.equal((await a.patch(`/users/${U.admin}`, { isActive: false }).expect(409)).body.error.code, "SELF_LOCKOUT");
  const results = await Promise.all([
    a.patch(`/users/${U.admin2}`, { role: "VIEWER" }),
    b.patch(`/users/${U.admin}`, { role: "VIEWER" }),
  ]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND is_active");
  assert.equal(rows[0].n, 1);
});

test("C15/C16: archive/restore are idempotent; soft delete hides the project from everyone", async () => {
  const admin = await loginAs("admin@neostat.test");
  await admin.post(`/projects/${P.legacy}/restore`).expect(200);
  await admin.post(`/projects/${P.legacy}/restore`).expect(200);
  await admin.post(`/projects/${P.legacy}/archive`).expect(200);
  await (await loginAs("manager@neostat.test")).post(`/projects/${P.website}/archive`).expect(403);

  await admin.del(`/projects/${P.website}`).expect(204);
  await admin.get(`/projects/${P.website}`).expect(404);
  await admin.get(`/tasks/${T.demo}`).expect(404);
  await admin.get(`/tasks/${T.demo}/comments`).expect(404);
  const list = (await admin.get("/projects").expect(200)).body;
  assert.equal(list.data.some((p: { id: string }) => p.id === P.website), false);
  assert.equal((await admin.get("/dashboard").expect(200)).body.data.activeProjectCount, 1);
});

test("C17/C19: duplicate email and role ceiling conflicts", async () => {
  const admin = await loginAs("admin@neostat.test");
  const dup = await admin.post("/users", { name: "Dup", email: "MEMBER@neostat.test", password: "longenough", role: "VIEWER" }).expect(409);
  assert.equal(dup.body.error.code, "EMAIL_EXISTS");
  const conflict = await admin.patch(`/users/${U.member2}`, { role: "VIEWER" }).expect(409);
  assert.equal(conflict.body.error.code, "ROLE_CONFLICT");
  assert.ok(conflict.body.error.details.projects.some((p: { id: string }) => p.id === P.website));
  const created = await admin.post("/users", { name: "New Person", email: "new@neostat.test", password: "longenough", role: "TEAM_MEMBER" }).expect(201);
  assert.equal(created.body.data.isActive, true);
});

test("E1–E7/E12: validation, filters, sorting and pagination", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.get("/tasks/not-a-uuid").expect(400);
  await manager.patch(`/tasks/${T.demo}`, { version: 1, foo: 1 }).expect(400);
  await manager.patch(`/tasks/${T.demo}`, { version: 1, status: "BLOCKED" }).expect(400);
  await manager.patch(`/tasks/${T.demo}`, { version: 1, dueDate: "2026-13-01" }).expect(400);
  await manager.patch(`/tasks/${T.demo}`, { version: 1, title: "   " }).expect(400);
  await manager.patch(`/tasks/${T.demo}`, { version: 1, title: "x".repeat(161) }).expect(400);
  const cleared = await manager.patch(`/tasks/${T.demo}`, { version: 1, dueDate: null, assigneeId: null }).expect(200);
  assert.equal(cleared.body.data.dueDate, null);
  assert.equal(cleared.body.data.assignee, null);
  assert.equal(cleared.body.data.title, "Concurrent editing demo");

  const byPriority = (await manager.get(`/tasks?projectId=${P.website}&sort=priority&order=desc`).expect(200)).body.data;
  const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>;
  for (let i = 1; i < byPriority.length; i++) assert.ok(rank[byPriority[i - 1].priority] >= rank[byPriority[i].priority]);
  const byDue = (await manager.get(`/tasks?projectId=${P.website}&sort=dueDate&order=asc`).expect(200)).body.data;
  assert.equal(byDue.at(-1).dueDate, null);

  await manager.get("/tasks?pageSize=101").expect(400);
  const empty = (await manager.get("/tasks?page=999").expect(200)).body;
  assert.equal(empty.data.length, 0);
  assert.ok(empty.meta.total > 0);
  const unassigned = (await manager.get(`/tasks?projectId=${P.website}&assigneeId=unassigned`).expect(200)).body.data;
  assert.ok(unassigned.every((t: { assignee: unknown }) => t.assignee === null));
  const mine = (await manager.get("/tasks?assigneeId=me").expect(200)).body.data;
  assert.ok(mine.length > 0 && mine.every((t: { assignee: { id: string } }) => t.assignee.id === U.manager));
});

test("E9: deleting a task removes its comments", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.del(`/tasks/${T.demo}`, { version: 1 }).expect(204);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM comments WHERE task_id = $1", [T.demo]);
  assert.equal(rows[0].n, 0);
});
