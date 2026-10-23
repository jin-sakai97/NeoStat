import type { Db } from "../db/pool.js";
import { type Actor, type ProjectRole, effectiveRole, projectCapabilities } from "../domain/policy.js";
import { likePattern } from "../http/pagination.js";

const OVERDUE = "t.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date AND t.status <> 'DONE'";

// Visible projects: not deleted, and (actor is Admin OR actor is a member). $1 = actor id, $2 = is admin.
const SELECT_PROJECT = `
  SELECT p.*, my.role AS my_role,
         mgr.id AS manager_id, mgr.name AS manager_name, mgr.email AS manager_email,
         (SELECT count(*)::int FROM project_members x WHERE x.project_id = p.id) AS member_count,
         tc.*
  FROM projects p
  LEFT JOIN project_members my ON my.project_id = p.id AND my.user_id = $1
  LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.role = 'PROJECT_MANAGER'
  LEFT JOIN users mgr ON mgr.id = pm.user_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE t.status = 'TODO')::int AS todo,
           count(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
           count(*) FILTER (WHERE t.status = 'DONE')::int AS done,
           count(*) FILTER (WHERE ${OVERDUE})::int AS overdue
    FROM tasks t WHERE t.project_id = p.id
  ) tc ON true
  WHERE p.deleted_at IS NULL AND ($2::boolean OR my.user_id IS NOT NULL)`;

type ProjectDTORow = {
  id: string; name: string; description: string; archived_at: Date | null; created_at: Date; updated_at: Date;
  my_role: ProjectRole | null; manager_id: string | null; manager_name: string | null; manager_email: string | null;
  member_count: number; total: number; todo: number; in_progress: number; done: number; overdue: number;
};

function toProjectDTO(row: ProjectDTORow, actor: Actor) {
  const role = effectiveRole(actor, row.my_role);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archivedAt: row.archived_at?.toISOString() ?? null,
    manager: row.manager_id ? { id: row.manager_id, name: row.manager_name!, email: row.manager_email! } : null,
    memberCount: row.member_count,
    taskCounts: { total: row.total, todo: row.todo, inProgress: row.in_progress, done: row.done, overdue: row.overdue },
    myRole: role,
    capabilities: projectCapabilities(role, row.archived_at !== null),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type ProjectDTO = ReturnType<typeof toProjectDTO>;

export async function getProjectDTO(db: Db, actor: Actor, id: string) {
  const { rows } = await db.query<ProjectDTORow>(`${SELECT_PROJECT} AND p.id = $3`, [actor.id, actor.role === "ADMIN", id]);
  return rows[0] ? toProjectDTO(rows[0], actor) : null;
}

export async function listProjects(db: Db, actor: Actor, filters: { q?: string; archived: boolean; limit: number; offset: number }) {
  const params: unknown[] = [actor.id, actor.role === "ADMIN"];
  let where = filters.archived ? " AND p.archived_at IS NOT NULL" : " AND p.archived_at IS NULL";
  if (filters.q) {
    params.push(likePattern(filters.q));
    where += ` AND p.name ILIKE $${params.length}`;
  }
  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${SELECT_PROJECT}${where}) s`, params);
  const { rows } = await db.query<ProjectDTORow>(
    `${SELECT_PROJECT}${where} ORDER BY p.updated_at DESC, p.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, filters.offset],
  );
  return { rows: rows.map((row) => toProjectDTO(row, actor)), total: count.rows[0].total };
}
