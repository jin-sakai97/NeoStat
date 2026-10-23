import { randomUUID } from "node:crypto";
import type { Db } from "../db/pool.js";
import type { Actor } from "../domain/policy.js";
import { notFound } from "../http/errors.js";

export type NotificationKind = "TASK_ASSIGNED" | "COMMENT_ADDED" | "ADDED_TO_PROJECT";

// Written as the last step of the transaction that causes it (specs/03-permissions.md §Notifications).
// Nobody is notified about their own action.
export async function notify(db: Db, n: { userId: string; actorId: string; kind: NotificationKind; taskId?: string; projectId?: string }) {
  if (n.userId === n.actorId) return;
  await db.query(
    "INSERT INTO notifications (id, user_id, actor_id, kind, task_id, project_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [randomUUID(), n.userId, n.actorId, n.kind, n.taskId ?? null, n.projectId ?? null],
  );
}

type Row = {
  id: string; kind: NotificationKind; read_at: Date | null; created_at: Date;
  actor_id: string; actor_name: string; actor_email: string;
  task_id: string | null; task_title: string | null; task_visible: boolean;
  project_id: string | null; project_name: string | null; project_visible: boolean;
};

// Names are only returned while the recipient can still see the task/project:
// Admin, or a member of a non-deleted project. $2 = is admin.
const SELECT = `
  SELECT n.id, n.kind, n.read_at, n.created_at,
         a.id AS actor_id, a.name AS actor_name, a.email AS actor_email,
         t.id AS task_id, t.title AS task_title,
         (tp.id IS NOT NULL AND tp.deleted_at IS NULL AND ($2::boolean OR tm.user_id IS NOT NULL)) AS task_visible,
         pj.id AS project_id, pj.name AS project_name,
         (pj.id IS NOT NULL AND pj.deleted_at IS NULL AND ($2::boolean OR pm.user_id IS NOT NULL)) AS project_visible
  FROM notifications n
  JOIN users a ON a.id = n.actor_id
  LEFT JOIN tasks t ON t.id = n.task_id
  LEFT JOIN projects tp ON tp.id = t.project_id
  LEFT JOIN project_members tm ON tm.project_id = tp.id AND tm.user_id = n.user_id
  LEFT JOIN projects pj ON pj.id = n.project_id
  LEFT JOIN project_members pm ON pm.project_id = pj.id AND pm.user_id = n.user_id
  WHERE n.user_id = $1`;

const toDTO = (row: Row) => ({
  id: row.id,
  kind: row.kind,
  actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email },
  task: row.task_visible ? { id: row.task_id!, title: row.task_title! } : null,
  project: row.project_visible ? { id: row.project_id!, name: row.project_name! } : null,
  readAt: row.read_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export async function listNotifications(db: Db, actor: Actor, opts: { unreadOnly: boolean; limit: number; offset: number }) {
  const unread = opts.unreadOnly ? " AND n.read_at IS NULL" : "";
  const isAdmin = actor.role === "ADMIN";
  const count = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM notifications n WHERE n.user_id = $1${unread}`,
    [actor.id],
  );
  const { rows } = await db.query<Row>(
    `${SELECT}${unread} ORDER BY n.created_at DESC, n.id LIMIT $3 OFFSET $4`,
    [actor.id, isAdmin, opts.limit, opts.offset],
  );
  return { rows: rows.map(toDTO), total: count.rows[0].total };
}

export async function unreadCount(db: Db, userId: string) {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
  return rows[0].count;
}

// Idempotent: an already-read row keeps its original read_at. Someone else's row is a 404.
export async function markRead(db: Db, userId: string, id: string) {
  const found = await db.query("SELECT 1 FROM notifications WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!found.rowCount) throw notFound("Notification");
  await db.query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, userId]);
}

export async function markAllRead(db: Db, userId: string) {
  await db.query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [userId]);
}
