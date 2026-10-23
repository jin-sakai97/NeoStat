import type { Db } from "../db/pool.js";
import { AppError, notFound, unauthenticated } from "../http/errors.js";
import { recordUnassignments } from "../repos/activity.repo.js";
import { findUserById } from "../repos/users.repo.js";
import { type Actor, type EffectiveRole, type ProjectRole, effectiveRole } from "./policy.js";

export type ProjectRow = {
  id: string; name: string; description: string; archived_at: Date | null; deleted_at: Date | null;
  created_by: string; created_at: Date; updated_at: Date;
};

// Re-reads the actor inside a transaction; never trust session-time values for writes.
export async function freshActor(db: Db, actorId: string): Promise<Actor> {
  const user = await findUserById(db, actorId);
  if (!user || !user.is_active) throw unauthenticated();
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.is_active };
}

type Lock = "share" | "update";

// Loads a non-deleted project and the actor's effective role in it. Out of scope ⇒ 404.
// Lock order (specs/03-permissions.md §6): project row first, then the actor's membership.
export async function projectAccess(db: Db, actor: Actor, projectId: string, lock?: Lock) {
  const clause = lock === "update" ? " FOR UPDATE" : lock === "share" ? " FOR SHARE" : "";
  const { rows } = await db.query<ProjectRow>(`SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL${clause}`, [projectId]);
  const project = rows[0];
  if (!project) throw notFound("Project");
  let membershipRole: ProjectRole | null = null;
  if (actor.role !== "ADMIN") {
    const member = await db.query<{ role: ProjectRole }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2${lock ? " FOR SHARE" : ""}`,
      [projectId, actor.id],
    );
    membershipRole = member.rows[0]?.role ?? null;
  }
  const role = effectiveRole(actor, membershipRole);
  if (!role) throw notFound("Project");
  return { project, role: role as Exclude<EffectiveRole, null> };
}

export async function taskProjectId(db: Db, taskId: string) {
  const { rows } = await db.query<{ project_id: string }>("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
  if (!rows[0]) throw notFound("Task");
  return rows[0].project_id;
}

export function requireWritable(project: ProjectRow) {
  if (project.archived_at) throw new AppError(409, "PROJECT_ARCHIVED", "This project is archived and read-only.");
}

// Clears a user's task assignments, bumping each task's version so open editors become stale,
// and records one history row per affected task (specs/04-data-model.md §2a).
export async function unassignTasks(db: Db, actorId: string, userId: string, projectId?: string) {
  const { rows } = await db.query<{ id: string; version: number }>(
    `UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now(), updated_by = $1
     WHERE assignee_id = $2
       AND ${projectId ? "project_id = $3" : "project_id IN (SELECT id FROM projects WHERE deleted_at IS NULL)"}
     RETURNING id, version`,
    projectId ? [actorId, userId, projectId] : [actorId, userId],
  );
  if (!rows.length) return;
  const user = await findUserById(db, userId);
  await recordUnassignments(db, actorId, { id: userId, name: user?.name ?? "Unknown user" }, rows);
}
