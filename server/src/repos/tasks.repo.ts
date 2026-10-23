import type { Db } from "../db/pool.js";
import { type Actor, type ProjectRole, effectiveRole, taskCapabilities } from "../domain/policy.js";
import { likePattern } from "../http/pagination.js";

export type TaskRow = {
  id: string; project_id: string; title: string; description: string; status: string; priority: string;
  assignee_id: string | null; due_date: string | null; version: number;
  created_by: string; updated_by: string; created_at: Date; updated_at: Date;
};

// Visible tasks: parent project not deleted, and (actor is Admin OR member). $1 = actor id, $2 = is admin.
const SELECT_TASK = `
  SELECT t.*, to_char(t.due_date, 'YYYY-MM-DD') AS due_date_text,
         p.name AS project_name, p.archived_at AS project_archived_at, my.role AS my_role,
         a.name AS assignee_name, a.email AS assignee_email,
         cb.name AS created_by_name, cb.email AS created_by_email,
         ub.name AS updated_by_name, ub.email AS updated_by_email,
         (t.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date AND t.status <> 'DONE') AS is_overdue
  FROM tasks t
  JOIN projects p ON p.id = t.project_id AND p.deleted_at IS NULL
  LEFT JOIN project_members my ON my.project_id = t.project_id AND my.user_id = $1
  LEFT JOIN users a ON a.id = t.assignee_id
  JOIN users cb ON cb.id = t.created_by
  JOIN users ub ON ub.id = t.updated_by
  WHERE ($2::boolean OR my.user_id IS NOT NULL)`;

type TaskDTORow = TaskRow & {
  due_date_text: string | null; project_name: string; project_archived_at: Date | null; my_role: ProjectRole | null;
  assignee_name: string | null; assignee_email: string | null; created_by_name: string; created_by_email: string;
  updated_by_name: string; updated_by_email: string; is_overdue: boolean | null;
};

function toTaskDTO(row: TaskDTORow, actor: Actor) {
  const role = effectiveRole(actor, row.my_role);
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name!, email: row.assignee_email! } : null,
    dueDate: row.due_date_text,
    isOverdue: row.is_overdue === true,
    version: row.version,
    createdBy: { id: row.created_by, name: row.created_by_name, email: row.created_by_email },
    updatedBy: { id: row.updated_by, name: row.updated_by_name, email: row.updated_by_email },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    capabilities: taskCapabilities(role, row.project_archived_at !== null, row.assignee_id, actor.id),
  };
}

export type TaskDTO = ReturnType<typeof toTaskDTO>;

export async function getTaskDTO(db: Db, actor: Actor, id: string) {
  const { rows } = await db.query<TaskDTORow>(`${SELECT_TASK} AND t.id = $3`, [actor.id, actor.role === "ADMIN", id]);
  return rows[0] ? toTaskDTO(rows[0], actor) : null;
}

// Dynamic ORDER BY comes only from this whitelist.
const SORT_SQL: Record<string, string> = {
  updatedAt: "t.updated_at",
  title: "lower(t.title)",
  dueDate: "t.due_date",
  priority: "CASE t.priority WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END",
  status: "CASE t.status WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END",
};

export type TaskFilters = {
  projectId?: string; assigneeId?: string; status?: string; priority?: string; q?: string; archived: boolean;
  openOnly?: boolean; sort: string; order: "asc" | "desc"; limit: number; offset: number;
};

export async function listTasks(db: Db, actor: Actor, f: TaskFilters) {
  const params: unknown[] = [actor.id, actor.role === "ADMIN"];
  const add = (value: unknown) => `$${params.push(value)}`;
  let where = f.archived ? " AND p.archived_at IS NOT NULL" : " AND p.archived_at IS NULL";
  if (f.projectId) where += ` AND t.project_id = ${add(f.projectId)}`;
  if (f.assigneeId === "unassigned") where += " AND t.assignee_id IS NULL";
  else if (f.assigneeId) where += ` AND t.assignee_id = ${add(f.assigneeId === "me" ? actor.id : f.assigneeId)}`;
  if (f.status) where += ` AND t.status = ${add(f.status)}`;
  if (f.openOnly) where += " AND t.status <> 'DONE'";
  if (f.priority) where += ` AND t.priority = ${add(f.priority)}`;
  if (f.q) where += ` AND t.title ILIKE ${add(likePattern(f.q))}`;

  const direction = f.order === "asc" ? "ASC" : "DESC";
  const nulls = f.sort === "dueDate" ? " NULLS LAST" : "";
  const orderBy = `${SORT_SQL[f.sort] ?? SORT_SQL.updatedAt} ${direction}${nulls}, t.id ASC`;

  const count = await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${SELECT_TASK}${where}) s`, params);
  const { rows } = await db.query<TaskDTORow>(
    `${SELECT_TASK}${where} ORDER BY ${orderBy} LIMIT ${add(f.limit)} OFFSET ${add(f.offset)}`,
    params,
  );
  return { rows: rows.map((row) => toTaskDTO(row, actor)), total: count.rows[0].total };
}
