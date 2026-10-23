import { Router } from "express";
import type pg from "pg";
import { listProjects } from "../repos/projects.repo.js";
import { listTasks } from "../repos/tasks.repo.js";

// All counts use the same visibility rules as the lists: active projects the actor can see.
export function dashboardRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/dashboard", async (req, res) => {
    const actor = req.actor!;
    const { rows: counts } = await pool.query<{ projects: number; todo: number; in_progress: number; done: number; mine_open: number; overdue: number }>(
      `WITH visible AS (
         SELECT p.id FROM projects p
         LEFT JOIN project_members my ON my.project_id = p.id AND my.user_id = $1
         WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND ($2::boolean OR my.user_id IS NOT NULL)
       )
       SELECT (SELECT count(*)::int FROM visible) AS projects,
              count(*) FILTER (WHERE t.status = 'TODO')::int AS todo,
              count(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
              count(*) FILTER (WHERE t.status = 'DONE')::int AS done,
              count(*) FILTER (WHERE t.assignee_id = $1 AND t.status <> 'DONE')::int AS mine_open,
              count(*) FILTER (WHERE t.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date AND t.status <> 'DONE')::int AS overdue
       FROM tasks t WHERE t.project_id IN (SELECT id FROM visible)`,
      [actor.id, actor.role === "ADMIN"],
    );
    const recent = await listProjects(pool, actor, { archived: false, limit: 5, offset: 0 });
    const mine = await listTasks(pool, actor, {
      assigneeId: "me", openOnly: true, archived: false, sort: "dueDate", order: "asc", limit: 5, offset: 0,
    });
    const c = counts[0];
    res.json({
      data: {
        activeProjectCount: c.projects,
        taskCounts: { todo: c.todo, inProgress: c.in_progress, done: c.done },
        assignedToMeOpen: c.mine_open,
        overdue: c.overdue,
        recentProjects: recent.rows,
        myTasks: mine.rows,
      },
    });
  });

  return router;
}
