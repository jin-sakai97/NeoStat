import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { z } from "zod";
import { type Db, withTransaction } from "../db/pool.js";
import { AppError, forbidden, notFound, validationError } from "../http/errors.js";
import type { createTaskBody, updateTaskBody } from "../http/schemas.js";
import { diffTask, recordActivity } from "../repos/activity.repo.js";
import { type TaskRow, getTaskDTO } from "../repos/tasks.repo.js";
import { freshActor, projectAccess, requireWritable, taskProjectId } from "./access.js";
import { type Actor, type TaskField, canManage, editableTaskFields } from "./policy.js";

// API field → column. The UPDATE builder may only use these column names.
const COLUMNS: Record<TaskField, string> = {
  title: "title", description: "description", status: "status",
  priority: "priority", assigneeId: "assignee_id", dueDate: "due_date",
};

async function requireAssignable(db: Db, projectId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1 AND pm.user_id = $2 AND pm.role IN ('PROJECT_MANAGER','TEAM_MEMBER') AND u.is_active`,
    [projectId, userId],
  );
  if (!rows[0]) throw validationError({ assigneeId: ["Choose an active manager or team member of this project."] });
}

export async function createTask(pool: pg.Pool, actorId: string, projectId: string, input: z.infer<typeof createTaskBody>) {
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    const { project, role } = await projectAccess(client, actor, projectId, "share");
    if (!canManage(role)) throw forbidden("Only the project manager can create tasks.");
    requireWritable(project);
    if (input.assigneeId) await requireAssignable(client, projectId, input.assigneeId);
    const id = randomUUID();
    await client.query(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, due_date, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [id, projectId, input.title, input.description, input.status, input.priority, input.assigneeId, input.dueDate, actor.id],
    );
    await recordActivity(client, { taskId: id, actorId: actor.id, kind: "CREATED", version: 1 });
    await client.query("UPDATE projects SET updated_at = now() WHERE id = $1", [projectId]);
    return getTaskDTO(client, actor, id);
  });
}

// Shared steps for PATCH and DELETE (specs/03-permissions.md §7): lock, re-authorize, then
// check the version. Authorization runs against the CURRENT task, before any conflict disclosure.
async function lockTaskForWrite(client: pg.PoolClient, actorId: string, taskId: string) {
  const actor = await freshActor(client, actorId);
  const projectId = await taskProjectId(client, taskId);
  const { project, role } = await projectAccess(client, actor, projectId, "share");
  const { rows } = await client.query<TaskRow & { due_date_text: string | null }>(
    "SELECT *, to_char(due_date, 'YYYY-MM-DD') AS due_date_text FROM tasks WHERE id = $1 FOR UPDATE",
    [taskId],
  );
  if (!rows[0]) throw notFound("Task");
  return { actor, project, role, task: rows[0] };
}

async function conflict(client: pg.PoolClient, actor: Actor, taskId: string) {
  return new AppError(409, "TASK_VERSION_CONFLICT", "This task changed after you opened it. Review the latest version.", {
    details: { currentTask: await getTaskDTO(client, actor, taskId) },
  });
}

export async function updateTask(pool: pg.Pool, actorId: string, taskId: string, input: z.infer<typeof updateTaskBody>) {
  const { version, ...changes } = input;
  return withTransaction(pool, async (client) => {
    const { actor, project, role, task } = await lockTaskForWrite(client, actorId, taskId);
    const allowed = editableTaskFields(role, task.assignee_id, actor.id);
    const fields = Object.keys(changes) as TaskField[];
    if (fields.some((field) => !allowed.includes(field))) {
      throw forbidden(allowed.length ? "You can only change the title, description and status of tasks assigned to you." : "You don't have permission to edit this task.");
    }
    requireWritable(project);
    if (changes.assigneeId) await requireAssignable(client, task.project_id, changes.assigneeId);

    const values: unknown[] = [taskId, version, actor.id];
    const sets = fields.map((field) => `${COLUMNS[field]} = $${values.push(changes[field])}`);
    const { rowCount } = await client.query(
      `UPDATE tasks SET ${sets.join(", ")}, version = version + 1, updated_at = now(), updated_by = $3
       WHERE id = $1 AND version = $2`,
      values,
    );
    if (rowCount === 0) throw await conflict(client, actor, taskId);
    const changed = await diffTask(client, task, changes);
    if (Object.keys(changed).length) await recordActivity(client, { taskId, actorId: actor.id, kind: "UPDATED", changes: changed, version: version + 1 });
    await client.query("UPDATE projects SET updated_at = now() WHERE id = $1", [task.project_id]);
    return getTaskDTO(client, actor, taskId);
  });
}

export async function deleteTask(pool: pg.Pool, actorId: string, taskId: string, version: number) {
  await withTransaction(pool, async (client) => {
    const { actor, project, role } = await lockTaskForWrite(client, actorId, taskId);
    if (!canManage(role)) throw forbidden("Only the project manager can delete tasks.");
    requireWritable(project);
    const { rowCount } = await client.query("DELETE FROM tasks WHERE id = $1 AND version = $2", [taskId, version]);
    if (rowCount === 0) throw await conflict(client, actor, taskId);
  });
}
