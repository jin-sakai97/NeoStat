import type { Db } from "../db/pool.js";
import type { AccountRole } from "../domain/policy.js";

export type UserRow = {
  id: string; name: string; email: string; password_hash: string; role: AccountRole;
  is_active: boolean; auth_version: number; created_at: Date; updated_at: Date;
};

export const toUserDTO = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export async function findUserById(db: Db, id: string, lock = false) {
  const { rows } = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] ?? null;
}

export async function findUserByEmail(db: Db, email: string) {
  const { rows } = await db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] ?? null;
}
