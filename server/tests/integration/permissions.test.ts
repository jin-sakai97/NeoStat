import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { P, T, U } from "../../src/db/fixtures.js";
import { loginAs, pool, resetDatabase } from "./helpers.js";

before(resetDatabase);
after(() => pool.end());

const demo = `/tasks/${T.demo}`;
const unassignedTask = "00000000-0000-4000-8000-200000000004";
const mobileTask = "00000000-0000-4000-8000-200000000007";
const kabirComment = "00000000-0000-4000-8000-300000000003";

test("B1/B3: Admin sees all active projects; members only their own", async () => {
  const admin = await loginAs("admin@neostat.test");
  const all = (await admin.get("/projects").expect(200)).body;
  assert.deepEqual(all.data.map((p: { name: string }) => p.name).sort(), ["Mobile App Launch", "Website Redesign"]);
  const kabir = (await (await loginAs("member2@neostat.test")).get("/projects").expect(200)).body;
  assert.equal(kabir.meta.total, 1);
  assert.equal(kabir.data[0].id, P.website);
});

test("B2/B10/E8: out-of-scope resources are 404, including via direct task and comment IDs", async () => {
  const outsider = await loginAs("manager2@neostat.test");
  await outsider.get(`/projects/${P.website}`).expect(404);
  await outsider.get(demo).expect(404);
  await outsider.get(`${demo}/comments`).expect(404);
  await outsider.del(`/comments/${kabirComment}`).expect(404);
  await (await loginAs("member2@neostat.test")).get(`/tasks?projectId=${P.mobile}`).expect(404);
});

test("B4/B13: Team Members cannot create tasks or manage users", async () => {
  const member = await loginAs("member@neostat.test");
  await member.post(`/projects/${P.website}/tasks`, { title: "Sneaky" }).expect(403);
  await member.get("/users").expect(403);
  await member.post(`/projects/${P.website}/members`, { userId: U.viewer, role: "VIEWER" }).expect(403);
});

test("B5–B8: members edit only allowed fields of their assigned task; mixed requests change nothing", async () => {
  const member = await loginAs("member@neostat.test");
  const ok = await member.patch(demo, { version: 1, title: "Member edit", status: "IN_PROGRESS" }).expect(200);
  assert.deepEqual(ok.body.data.capabilities.editableFields, ["title", "description", "status"]);
  await member.patch(`/tasks/${unassignedTask}`, { version: 1, status: "DONE" }).expect(403);
  await member.patch(demo, { version: 2, priority: "HIGH" }).expect(403);
  await member.patch(demo, { version: 2, assigneeId: U.member2 }).expect(403);
  await member.patch(demo, { version: 2, title: "Mixed", dueDate: null }).expect(403);
  const { rows } = await pool.query("SELECT title, version FROM tasks WHERE id = $1", [T.demo]);
  assert.deepEqual(rows[0], { title: "Member edit", version: 2 });
});

test("B9: Viewers cannot mutate anything through the API", async () => {
  const viewer = await loginAs("viewer@neostat.test");
  const task = (await viewer.get(demo).expect(200)).body.data;
  assert.deepEqual(task.capabilities, { editableFields: [], canDelete: false, canComment: false });
  await viewer.patch(demo, { version: task.version, status: "DONE" }).expect(403);
  await viewer.post(`${demo}/comments`, { body: "hi" }).expect(403);
  await viewer.post(`/projects/${P.website}/members`, { userId: U.member2, role: "VIEWER" }).expect(403);
  await viewer.del(`/comments/${kabirComment}`).expect(403);
  await viewer.patch(`/projects/${P.website}`, { name: "Mine now" }).expect(403);
});

test("B11/B12/B14: project role and account ceiling are enforced independently", async () => {
  const manager = await loginAs("manager@neostat.test");
  await manager.patch(`/tasks/${mobileTask}`, { version: 1, title: "Viewer-role PM edit" }).expect(403);
  await manager.patch(demo, { version: 2, assigneeId: U.viewer }).expect(400);
  const admin = await loginAs("admin@neostat.test");
  await admin.post(`/projects/${P.mobile}/members`, { userId: U.viewer, role: "TEAM_MEMBER" }).expect(400);
});

test("B15/B16: comment deletion — own only for members, any for the manager", async () => {
  const member = await loginAs("member@neostat.test");
  await member.del(`/comments/${kabirComment}`).expect(403);
  const mine = await member.post(`${demo}/comments`, { body: "temp" }).expect(201);
  assert.equal(mine.body.data.canDelete, true);
  await member.del(`/comments/${mine.body.data.id}`).expect(204);
  await (await loginAs("manager@neostat.test")).del(`/comments/${kabirComment}`).expect(204);
});

test("C13/C14: archived projects are readable but reject writes", async () => {
  const kabir = await loginAs("member2@neostat.test");
  const archived = (await kabir.get(`/projects?archived=true`).expect(200)).body.data;
  assert.equal(archived[0].id, P.legacy);
  const tasks = (await kabir.get(`/tasks?projectId=${P.legacy}&archived=true`).expect(200)).body.data;
  const own = tasks.find((t: { assignee: { id: string } | null }) => t.assignee?.id === U.member2);
  const res = await kabir.patch(`/tasks/${own.id}`, { version: own.version, status: "TODO" }).expect(409);
  assert.equal(res.body.error.code, "PROJECT_ARCHIVED");
  await kabir.post(`/tasks/${own.id}/comments`, { body: "late" }).expect(409);
  const manager2 = await loginAs("manager2@neostat.test");
  await manager2.patch(`/projects/${P.legacy}`, { name: "Renamed" }).expect(409);
});
