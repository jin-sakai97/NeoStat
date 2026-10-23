import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import request from "supertest";
import { P, T, U } from "../../src/db/fixtures.js";
import { anonymous, app, loginAs, pool, resetDatabase } from "./helpers.js";

before(resetDatabase);
beforeEach(resetDatabase);
after(() => pool.end());

type Client = Awaited<ReturnType<typeof loginAs>>;
type Note = { id: string; kind: string; actor: { id: string }; task: { id: string; title: string } | null; project: { id: string; name: string } | null; readAt: string | null };

const feed = async (client: Client, query = "") => (await client.get(`/notifications${query}`).expect(200)).body as { data: Note[]; meta: { total: number } };
const unread = async (client: Client) => (await client.get("/notifications/unread-count").expect(200)).body.data.count as number;
const newTask = async (client: Client, body: object) => (await client.post(`/projects/${P.website}/tasks`, body).expect(201)).body.data;

test("G1: assigning on create or by PATCH notifies the new assignee, never the actor", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");

  await newTask(manager, { title: "Assigned on create", assigneeId: U.member });
  const second = await newTask(manager, { title: "Assigned later" });
  assert.equal(await unread(member), 1);
  await manager.patch(`/tasks/${second.id}`, { version: 1, assigneeId: U.member }).expect(200);
  assert.equal(await unread(member), 2);

  const { data } = await feed(member);
  assert.deepEqual(data.map((n) => n.kind), ["TASK_ASSIGNED", "TASK_ASSIGNED"]);
  assert.equal(data[0].task?.id, second.id);
  assert.equal(data[1].task?.title, "Assigned on create");
  assert.equal(data[0].actor.id, U.manager);
  assert.equal(data[0].readAt, null);

  // Same assignee again, a title edit, or assigning to oneself: nothing new.
  await manager.patch(`/tasks/${second.id}`, { version: 2, assigneeId: U.member }).expect(200);
  await manager.patch(`/tasks/${second.id}`, { version: 3, title: "Renamed" }).expect(200);
  await manager.patch(`/tasks/${second.id}`, { version: 4, assigneeId: U.manager }).expect(200);
  assert.equal(await unread(member), 2);
  assert.equal(await unread(manager), 0);
});

test("G2: a comment notifies the assignee only, and never its author", async () => {
  const member = await loginAs("member@neostat.test");
  const member2 = await loginAs("member2@neostat.test");
  const manager = await loginAs("manager@neostat.test");

  await member2.post(`/tasks/${T.demo}/comments`, { body: "Looks good" }).expect(201);
  const { data } = await feed(member);
  assert.deepEqual(data.map((n) => [n.kind, n.actor.id, n.task?.id]), [["COMMENT_ADDED", U.member2, T.demo]]);
  assert.equal(await unread(member2), 0);

  await member.post(`/tasks/${T.demo}/comments`, { body: "Thanks" }).expect(201);
  assert.equal(await unread(member), 1, "the assignee's own comment is not a notification");

  const unassigned = await newTask(manager, { title: "Nobody owns this" });
  await member2.post(`/tasks/${unassigned.id}/comments`, { body: "Anyone?" }).expect(201);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM notifications WHERE task_id = $1", [unassigned.id]);
  assert.equal(rows[0].n, 0);
});

test("G3: adding a member notifies them about the project", async () => {
  const manager = await loginAs("manager@neostat.test");
  const manager2 = await loginAs("manager2@neostat.test");
  await manager.post(`/projects/${P.website}/members`, { userId: U.manager2, role: "TEAM_MEMBER" }).expect(201);
  const { data } = await feed(manager2);
  assert.equal(data.length, 1);
  assert.equal(data[0].kind, "ADDED_TO_PROJECT");
  assert.equal(data[0].project?.id, P.website);
  assert.equal(data[0].project?.name, "Website Redesign");
  assert.equal(data[0].task, null);
  assert.equal(data[0].actor.id, U.manager);
});

test("G4: the feed is private; reading someone else's notification is a 404 and changes nothing", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");
  const member2 = await loginAs("member2@neostat.test");
  const admin = await loginAs("admin@neostat.test");
  await newTask(manager, { title: "For Meera", assigneeId: U.member });
  const [note] = (await feed(member)).data;

  assert.equal((await feed(member2)).meta.total, 0);
  assert.equal(await unread(member2), 0);
  await member2.post(`/notifications/${note.id}/read`).expect(404);
  await admin.post(`/notifications/${note.id}/read`).expect(404);
  await member.post(`/notifications/${randomUUID()}/read`).expect(404);
  await member.post("/notifications/not-a-uuid/read").expect(400);
  const { rows } = await pool.query("SELECT read_at FROM notifications WHERE id = $1", [note.id]);
  assert.equal(rows[0].read_at, null);
});

test("G5: marking read is idempotent, read-all only touches the caller, and ?unread filters", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");
  const member2 = await loginAs("member2@neostat.test");
  await newTask(manager, { title: "One", assigneeId: U.member });
  await newTask(manager, { title: "Two", assigneeId: U.member });
  await newTask(manager, { title: "Three", assigneeId: U.member });
  await newTask(manager, { title: "Other person", assigneeId: U.member2 });
  const [newest] = (await feed(member)).data;

  await member.post(`/notifications/${newest.id}/read`).expect(204);
  const firstRead = (await pool.query("SELECT read_at FROM notifications WHERE id = $1", [newest.id])).rows[0].read_at;
  assert.ok(firstRead);
  await member.post(`/notifications/${newest.id}/read`).expect(204);
  const secondRead = (await pool.query("SELECT read_at FROM notifications WHERE id = $1", [newest.id])).rows[0].read_at;
  assert.equal(secondRead.getTime(), firstRead.getTime(), "read_at is not rewritten");
  assert.equal(await unread(member), 2);

  const onlyUnread = await feed(member, "?unread=true");
  assert.equal(onlyUnread.meta.total, 2);
  assert.ok(onlyUnread.data.every((n) => n.readAt === null && n.id !== newest.id));
  assert.equal((await feed(member, "?page=2&pageSize=2")).data.length, 1);

  await member.post("/notifications/read-all").expect(204);
  assert.equal(await unread(member), 0);
  assert.equal(await unread(member2), 1, "someone else's unread notifications are untouched");
  assert.equal((await feed(member)).meta.total, 3, "read items stay in the feed");
});

test("G6: rejected writes create no notification", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");
  const admin = await loginAs("admin@neostat.test");
  const task = await newTask(manager, { title: "Contested" });
  await manager.patch(`/tasks/${task.id}`, { version: 1, title: "Edited first" }).expect(200);

  await manager.patch(`/tasks/${task.id}`, { version: 1, assigneeId: U.member }).expect(409);
  await member.patch(`/tasks/${task.id}`, { version: 2, assigneeId: U.member }).expect(403);
  await manager.patch(`/tasks/${task.id}`, { version: 2, assigneeId: U.viewer }).expect(400);

  const legacyTask = (await pool.query("SELECT id FROM tasks WHERE project_id = $1 AND assignee_id = $2 LIMIT 1", [P.legacy, U.member2])).rows[0].id;
  await admin.post(`/tasks/${legacyTask}/comments`, { body: "Archived" }).expect(409);

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM notifications");
  assert.equal(rows[0].n, 0);
});

test("G7: names disappear once the recipient loses access and return when access does", async () => {
  const manager = await loginAs("manager@neostat.test");
  const member = await loginAs("member@neostat.test");
  await newTask(manager, { title: "Secret plans", assigneeId: U.member });
  assert.equal((await feed(member)).data[0].task?.title, "Secret plans");

  await manager.del(`/projects/${P.website}/members/${U.member}`).expect(204);
  const hidden = (await feed(member)).data;
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].task, null);
  assert.doesNotMatch(JSON.stringify(hidden), /Secret plans/);

  await manager.post(`/projects/${P.website}/members`, { userId: U.member, role: "TEAM_MEMBER" }).expect(201);
  const back = (await feed(member)).data;
  assert.equal(back.length, 2);
  assert.equal(back.find((n) => n.kind === "TASK_ASSIGNED")?.task?.title, "Secret plans");
  assert.equal(back.find((n) => n.kind === "ADDED_TO_PROJECT")?.project?.name, "Website Redesign");

});

test("G8: authentication, CSRF and query validation", async () => {
  await request(app).get("/api/notifications").expect(401);
  await request(app).get("/api/notifications/unread-count").expect(401);
  const member = await loginAs("member@neostat.test");
  await member.agent.post("/api/notifications/read-all").expect(403);
  await member.get("/notifications?page=0").expect(400);
  await member.get("/notifications?pageSize=101").expect(400);
  await member.get("/notifications?unread=false").expect(400);
  await member.get("/notifications?unread=true&extra=1").expect(400);
  const anon = await anonymous();
  await anon.post("/notifications/read-all").expect(401);
});
