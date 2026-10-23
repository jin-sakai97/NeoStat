import { randomUUID } from "node:crypto";
import type { Db } from "../db/pool.js";
import type { TaskField } from "../domain/policy.js";

type UserRef = { id: string; name: string };
type Value = string | UserRef | null;
export type Changes = Partial<Record<TaskField, { from: Value; to: Value }>>;

type ActivityRow = {
  id: string; kind: "CREATED" | "UPDATED"; changes: Changes; version: number; created_at: Date;
  actor_id: string; actor_name: string; actor_email: string;
};

export async function recordActivity(db: Db, entry: { taskId: string; actorId: string; kind: "CREATED" | "UPDATED"; changes?: Changes; version: number }) {
  await db.query(
    "INSERT INTO task_activity (id, task_id, actor_id, kind, changes, version) VALUES ($1,$2,$3,$4,$5,$6)",
    [randomUUID(), entry.taskId, entry.actorId, entry.kind, JSON.stringify(entry.changes ?? {}), entry.version],
  );
}

// One UPDATED row per task whose assignee was cleared by the unassign cleanup (specs/04-data-model.md §2a).
export async function recordUnassignments(db: Db, actorId: string, assignee: UserRef, tasks: { id: string; version: number }[]) {
  if (!tasks.length) return;
  const changes: Changes = { assigneeId: { from: assignee, to: null } };
  await db.query(
    `INSERT INTO task_activity (id, task_id, actor_id, kind, changes, version)
     SELECT n.id, n.task_id, $1, 'UPDATED', $2::jsonb, n.version
     FROM unnest($3::uuid[], $4::uuid[], $5::int[]) AS n(id, task_id, version)`,
    [actorId, JSON.stringify(changes), tasks.map(() => randomUUID()), tasks.map((t) => t.id), tasks.map((t) => t.version)],
  );
}

type Snapshot = { title: string; description: string; status: string; priority: string; assignee_id: string | null; due_date_text: string | null };

// Compares the locked task row with the requested changes and keeps only what really changes.
export async function diffTask(db: Db, before: Snapshot, requested: Partial<Record<TaskField, string | null>>): Promise<Changes> {
  const current: Record<TaskField, string | null> = {
    title: before.title, description: before.description, status: before.status, priority: before.priority,
    assigneeId: before.assignee_id, dueDate: before.due_date_text,
  };
  const changes: Changes = {};
  for (const field of Object.keys(requested) as TaskField[]) {
    const to = requested[field] ?? null;
    if (to === current[field]) continue;
    changes[field] = { from: current[field], to: to };
  }
  const assignee = changes.assigneeId;
  if (assignee) {
    const ids = [assignee.from, assignee.to].filter((v): v is string => typeof v === "string");
    const { rows } = await db.query<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ANY($1::uuid[])", [ids]);
    const ref = (id: Value): Value => (typeof id === "string" ? { id, name: rows.find((r) => r.id === id)?.name ?? "Unknown user" } : null);
    changes.assigneeId = { from: ref(assignee.from), to: ref(assignee.to) };
  }
  return changes;
}

export async function listActivity(db: Db, taskId: string, limit: number, offset: number) {
  const count = await db.query<{ total: number }>("SELECT count(*)::int AS total FROM task_activity WHERE task_id = $1", [taskId]);
  const { rows } = await db.query<ActivityRow>(
    `SELECT a.id, a.kind, a.changes, a.version, a.created_at, a.actor_id, u.name AS actor_name, u.email AS actor_email
     FROM task_activity a JOIN users u ON u.id = a.actor_id
     WHERE a.task_id = $1 ORDER BY a.created_at DESC, a.id LIMIT $2 OFFSET $3`,
    [taskId, limit, offset],
  );
  return {
    total: count.rows[0].total,
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email },
      changes: row.changes,
      version: row.version,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
