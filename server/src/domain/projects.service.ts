import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { z } from "zod";
import { type Db, withTransaction } from "../db/pool.js";
import { AppError, forbidden, notFound, validationError } from "../http/errors.js";
import type { createProjectBody, updateProjectBody } from "../http/schemas.js";
import { getProjectDTO } from "../repos/projects.repo.js";
import { notify } from "../repos/notifications.repo.js";
import { findUserById } from "../repos/users.repo.js";
import { freshActor, projectAccess, requireWritable, unassignTasks } from "./access.js";
import { type ProjectRole, ROLE_CEILING, canManage } from "./policy.js";

const adminOnly = (message: string) => forbidden(message);

async function requireManagerAccount(db: Db, userId: string, field: string) {
  const user = await findUserById(db, userId);
  if (!user || !user.is_active || user.role !== "PROJECT_MANAGER") {
    throw validationError({ [field]: ["Choose an active user with the Project Manager account role."] });
  }
  return user;
}

const touch = (db: Db, projectId: string) => db.query("UPDATE projects SET updated_at = now() WHERE id = $1", [projectId]);

export async function createProject(pool: pg.Pool, actorId: string, input: z.infer<typeof createProjectBody>) {
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    if (actor.role !== "ADMIN") throw adminOnly("Only admins can create projects.");
    await requireManagerAccount(client, input.managerId, "managerId");
    const id = randomUUID();
    await client.query("INSERT INTO projects (id, name, description, created_by) VALUES ($1,$2,$3,$4)", [id, input.name, input.description, actor.id]);
    await client.query(
      "INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,'PROJECT_MANAGER',$3)",
      [id, input.managerId, actor.id],
    );
    return getProjectDTO(client, actor, id);
  });
}

export async function updateProject(pool: pg.Pool, actorId: string, projectId: string, input: z.infer<typeof updateProjectBody>) {
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    const { project, role } = await projectAccess(client, actor, projectId, "update");
    if (!canManage(role)) throw forbidden("Only the project manager or an admin can edit project details.");
    requireWritable(project);
    await client.query(
      "UPDATE projects SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now() WHERE id = $1",
      [projectId, input.name ?? null, input.description ?? null],
    );
    return getProjectDTO(client, actor, projectId);
  });
}

export async function setLifecycle(pool: pg.Pool, actorId: string, projectId: string, action: "archive" | "restore" | "delete") {
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    const { role } = await projectAccess(client, actor, projectId, "update");
    if (role !== "ADMIN") throw adminOnly("Only admins can archive, restore or delete projects.");
    const sql = {
      archive: "UPDATE projects SET archived_at = COALESCE(archived_at, now()), updated_at = now() WHERE id = $1",
      restore: "UPDATE projects SET archived_at = NULL, updated_at = now() WHERE id = $1",
      delete: "UPDATE projects SET deleted_at = now(), updated_at = now() WHERE id = $1",
    }[action];
    await client.query(sql, [projectId]);
    return action === "delete" ? null : getProjectDTO(client, actor, projectId);
  });
}

// Replaces the designated manager atomically; the old manager stays as a Team Member.
export async function replaceManager(pool: pg.Pool, actorId: string, projectId: string, userId: string) {
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    const { role } = await projectAccess(client, actor, projectId, "update");
    if (role !== "ADMIN") throw adminOnly("Only admins can change the project manager.");
    await requireManagerAccount(client, userId, "userId");
    const current = await client.query<{ user_id: string }>(
      "SELECT user_id FROM project_members WHERE project_id = $1 AND role = 'PROJECT_MANAGER'",
      [projectId],
    );
    if (current.rows[0]?.user_id !== userId) {
      // Demote before promoting so the one-manager unique index is never violated.
      await client.query(
        "UPDATE project_members SET role = 'TEAM_MEMBER', updated_at = now() WHERE project_id = $1 AND role = 'PROJECT_MANAGER'",
        [projectId],
      );
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,'PROJECT_MANAGER',$3)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'PROJECT_MANAGER', updated_at = now()`,
        [projectId, userId, actor.id],
      );
      await touch(client, projectId);
    }
    return getProjectDTO(client, actor, projectId);
  });
}

// ---- Membership -------------------------------------------------------------------------

async function teamAccess(client: pg.PoolClient, actorId: string, projectId: string) {
  const actor = await freshActor(client, actorId);
  const { project, role } = await projectAccess(client, actor, projectId, "update");
  if (!canManage(role)) throw forbidden("Only the project manager or an admin can manage the team.");
  requireWritable(project);
  return actor;
}

async function requireCeiling(db: Db, userId: string, projectRole: ProjectRole) {
  const user = await findUserById(db, userId);
  if (!user || !user.is_active || user.role === "ADMIN") {
    throw validationError({ userId: ["Choose an active, non-admin user."] });
  }
  if (!ROLE_CEILING[user.role].includes(projectRole)) {
    throw validationError({ role: [`This user's account role only allows: ${ROLE_CEILING[user.role].join(", ")}.`] });
  }
}

async function existingMember(db: Db, projectId: string, userId: string) {
  const { rows } = await db.query<{ role: ProjectRole }>(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  if (!rows[0]) throw notFound("Member");
  if (rows[0].role === "PROJECT_MANAGER") {
    throw new AppError(409, "MANAGER_REQUIRED", "This user is the project manager. Ask an admin to replace the manager first.");
  }
  return rows[0];
}

export async function addMember(pool: pg.Pool, actorId: string, projectId: string, userId: string, role: ProjectRole) {
  return withTransaction(pool, async (client) => {
    const actor = await teamAccess(client, actorId, projectId);
    await requireCeiling(client, userId, role);
    const { rowCount } = await client.query(
      `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [projectId, userId, role, actor.id],
    );
    if (rowCount === 0) throw new AppError(409, "MEMBER_EXISTS", "This user is already a member of the project.");
    await touch(client, projectId);
    await notify(client, { userId, actorId: actor.id, kind: "ADDED_TO_PROJECT", projectId });
  });
}

export async function changeMemberRole(pool: pg.Pool, actorId: string, projectId: string, userId: string, role: ProjectRole) {
  return withTransaction(pool, async (client) => {
    const actor = await teamAccess(client, actorId, projectId);
    const member = await existingMember(client, projectId, userId);
    await requireCeiling(client, userId, role);
    if (role === "VIEWER" && member.role !== "VIEWER") await unassignTasks(client, actor.id, userId, projectId);
    await client.query(
      "UPDATE project_members SET role = $3, updated_at = now() WHERE project_id = $1 AND user_id = $2",
      [projectId, userId, role],
    );
    await touch(client, projectId);
  });
}

export async function removeMember(pool: pg.Pool, actorId: string, projectId: string, userId: string) {
  await withTransaction(pool, async (client) => {
    const actor = await teamAccess(client, actorId, projectId);
    await existingMember(client, projectId, userId);
    await unassignTasks(client, actor.id, userId, projectId);
    await client.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
    await touch(client, projectId);
  });
}
