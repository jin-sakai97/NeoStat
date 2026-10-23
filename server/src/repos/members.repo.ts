import type { Db } from "../db/pool.js";

const SELECT_MEMBER = `
  SELECT u.id, u.name, u.email, u.is_active, u.role AS account_role, pm.role, pm.created_at
  FROM project_members pm JOIN users u ON u.id = pm.user_id
  WHERE pm.project_id = $1`;

type MemberRow = {
  id: string; name: string; email: string; is_active: boolean; account_role: string; role: string; created_at: Date;
};

const toMemberDTO = (row: MemberRow) => ({
  user: { id: row.id, name: row.name, email: row.email, isActive: row.is_active, accountRole: row.account_role },
  role: row.role,
  joinedAt: row.created_at.toISOString(),
});

export async function getMemberDTO(db: Db, projectId: string, userId: string) {
  const { rows } = await db.query<MemberRow>(`${SELECT_MEMBER} AND pm.user_id = $2`, [projectId, userId]);
  return rows[0] ? toMemberDTO(rows[0]) : null;
}

// assignable = active managers and team members only (the assignee picker).
export async function listMembers(db: Db, projectId: string, f: { assignable: boolean; limit: number; offset: number }) {
  const where = f.assignable ? " AND u.is_active AND pm.role IN ('PROJECT_MANAGER','TEAM_MEMBER')" : "";
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${SELECT_MEMBER}${where}) s`, [projectId]);
  const { rows } = await db.query<MemberRow>(`${SELECT_MEMBER}${where} ORDER BY u.name, u.id LIMIT $2 OFFSET $3`, [projectId, f.limit, f.offset]);
  return { rows: rows.map(toMemberDTO), total: count.rows[0].total };
}
