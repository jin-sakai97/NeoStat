import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { z } from "zod";
import { withTransaction } from "../db/pool.js";
import { AppError, forbidden, notFound } from "../http/errors.js";
import type { createUserBody, updateUserBody } from "../http/schemas.js";
import { type UserRow, findUserById, toUserDTO } from "../repos/users.repo.js";
import { freshActor, unassignTasks } from "./access.js";
import { hashPassword } from "./passwords.js";
import { type AccountRole, ROLE_CEILING } from "./policy.js";

const emailExists = () => new AppError(409, "EMAIL_EXISTS", "An account with this email already exists.", { fieldErrors: { email: ["This email is already in use."] } });

function isUniqueViolation(error: unknown) {
  return (error as { code?: string })?.code === "23505";
}

export async function createUser(pool: pg.Pool, actorId: string, input: z.infer<typeof createUserBody>) {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(pool, async (client) => {
    const actor = await freshActor(client, actorId);
    if (actor.role !== "ADMIN") throw forbidden("Only admins can manage users.");
    try {
      const { rows } = await client.query<UserRow>(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), input.name, input.email, passwordHash, input.role],
      );
      return toUserDTO(rows[0]);
    } catch (error) {
      throw isUniqueViolation(error) ? emailExists() : error;
    }
  });
}

type ProjectRef = { id: string; name: string; projectRole: string };

export async function updateUser(pool: pg.Pool, actorId: string, userId: string, input: z.infer<typeof updateUserBody>) {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  return withTransaction(pool, async (client) => {
    // Lock order: the active-admin set first (guards LAST_ADMIN under concurrency), then the target.
    await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND is_active ORDER BY id FOR UPDATE");
    const actor = await freshActor(client, actorId);
    if (actor.role !== "ADMIN") throw forbidden("Only admins can manage users.");
    const target = await findUserById(client, userId, true);
    if (!target) throw notFound("User");

    const newRole: AccountRole = input.role ?? target.role;
    const roleChanged = newRole !== target.role;
    const deactivating = input.isActive === false && target.is_active;
    const emailChanged = input.email !== undefined && input.email !== target.email;

    if (target.id === actor.id && (deactivating || roleChanged)) {
      throw new AppError(409, "SELF_LOCKOUT", "You can't deactivate your own account or change your own role.");
    }
    if (target.role === "ADMIN" && target.is_active && (deactivating || roleChanged)) {
      const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND is_active");
      if (rows[0].n <= 1) throw new AppError(409, "LAST_ADMIN", "At least one active admin must remain.");
    }

    const memberships = (await client.query<ProjectRef>(
      `SELECT p.id, p.name, pm.role AS "projectRole" FROM project_members pm
       JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
       WHERE pm.user_id = $1 ORDER BY p.name`,
      [userId],
    )).rows;
    const managed = memberships.filter((m) => m.projectRole === "PROJECT_MANAGER");
    if (managed.length && (deactivating || (roleChanged && newRole !== "PROJECT_MANAGER"))) {
      throw new AppError(409, "MANAGER_REQUIRED", "This user manages projects. Replace them as manager first.", { details: { projects: managed } });
    }
    if (roleChanged) {
      const allowed = ROLE_CEILING[newRole] as string[];
      const blocking = memberships.filter((m) => !allowed.includes(m.projectRole));
      if (blocking.length) {
        throw new AppError(409, "ROLE_CONFLICT", "Some project memberships exceed the new account role. Remove or downgrade them first.", { details: { projects: blocking } });
      }
    }

    const bumpAuth = roleChanged || emailChanged || passwordHash !== null || (input.isActive !== undefined && input.isActive !== target.is_active);
    try {
      await client.query(
        `UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email), role = $4,
                is_active = COALESCE($5, is_active), password_hash = COALESCE($6, password_hash),
                auth_version = auth_version + $7, updated_at = now()
         WHERE id = $1`,
        [userId, input.name ?? null, input.email ?? null, newRole, input.isActive ?? null, passwordHash, bumpAuth ? 1 : 0],
      );
    } catch (error) {
      throw isUniqueViolation(error) ? emailExists() : error;
    }
    if (deactivating) await unassignTasks(client, actor.id, userId);
    return toUserDTO((await findUserById(client, userId))!);
  });
}
