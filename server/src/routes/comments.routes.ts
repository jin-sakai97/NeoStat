import { randomUUID } from "node:crypto";
import { Router } from "express";
import type pg from "pg";
import { withTransaction } from "../db/pool.js";
import { freshActor, projectAccess, requireWritable, taskProjectId } from "../domain/access.js";
import { type Actor, type EffectiveRole, canDeleteComment, canWrite } from "../domain/policy.js";
import { forbidden, notFound } from "../http/errors.js";
import { limitOffset, paginated } from "../http/pagination.js";
import { commentBody, idParam, pageQuery } from "../http/schemas.js";
import { parse } from "../http/validate.js";

type CommentRow = { id: string; task_id: string; author_id: string; author_name: string; author_email: string; body: string; created_at: Date };

const SELECT_COMMENT = `
  SELECT c.*, u.name AS author_name, u.email AS author_email
  FROM comments c JOIN users u ON u.id = c.author_id`;

const toCommentDTO = (row: CommentRow, actor: Actor, role: EffectiveRole, archived: boolean) => ({
  id: row.id,
  taskId: row.task_id,
  author: { id: row.author_id, name: row.author_name, email: row.author_email },
  body: row.body,
  createdAt: row.created_at.toISOString(),
  canDelete: !archived && canDeleteComment(role, row.author_id, actor.id),
});

// Comment operations never change the task's version or updated_at.
export function commentRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/tasks/:id/comments", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const query = parse(pageQuery, req.query);
    const { project, role } = await projectAccess(pool, req.actor!, await taskProjectId(pool, id));
    const count = await pool.query<{ total: number }>("SELECT count(*)::int AS total FROM comments WHERE task_id = $1", [id]);
    const { limit, offset } = limitOffset(query);
    const { rows } = await pool.query<CommentRow>(
      `${SELECT_COMMENT} WHERE c.task_id = $1 ORDER BY c.created_at DESC, c.id LIMIT $2 OFFSET $3`,
      [id, limit, offset],
    );
    const archived = project.archived_at !== null;
    res.json(paginated(rows.map((row) => toCommentDTO(row, req.actor!, role, archived)), count.rows[0].total, query));
  });

  router.post("/tasks/:id/comments", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { body } = parse(commentBody, req.body);
    const comment = await withTransaction(pool, async (client) => {
      const actor = await freshActor(client, req.actor!.id);
      const { project, role } = await projectAccess(client, actor, await taskProjectId(client, id), "share");
      if (!canWrite(role)) throw forbidden("Viewers can't comment.");
      requireWritable(project);
      const commentId = randomUUID();
      await client.query("INSERT INTO comments (id, task_id, author_id, body) VALUES ($1,$2,$3,$4)", [commentId, id, actor.id, body]);
      const { rows } = await client.query<CommentRow>(`${SELECT_COMMENT} WHERE c.id = $1`, [commentId]);
      return toCommentDTO(rows[0], actor, role, false);
    });
    res.status(201).json({ data: comment });
  });

  router.delete("/comments/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    await withTransaction(pool, async (client) => {
      const actor = await freshActor(client, req.actor!.id);
      const found = await client.query<{ task_id: string; author_id: string }>("SELECT task_id, author_id FROM comments WHERE id = $1", [id]);
      if (!found.rows[0]) throw notFound("Comment");
      const { project, role } = await projectAccess(client, actor, await taskProjectId(client, found.rows[0].task_id), "share");
      if (!canDeleteComment(role, found.rows[0].author_id, actor.id)) throw forbidden("You can only delete your own comments.");
      requireWritable(project);
      await client.query("DELETE FROM comments WHERE id = $1", [id]);
    });
    res.status(204).end();
  });

  return router;
}
