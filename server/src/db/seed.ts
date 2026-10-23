import type pg from "pg";
import { hashPassword } from "../domain/passwords.js";
import { comments, DEMO_PASSWORD, members, projects, tasks, U, users } from "./fixtures.js";
import { withTransaction } from "./pool.js";

// Idempotent: inserts missing fixtures only and never updates existing rows,
// so passwords, edits, assignments and versions survive a re-seed.
export async function seedDatabase(pool: pg.Pool) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return withTransaction(pool, async (client) => {
    let inserted = 0;
    const insert = async (sql: string, values: unknown[]) => {
      inserted += (await client.query(sql, values)).rowCount ?? 0;
    };

    for (const u of users) {
      await insert(
        `INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [u.id, u.name, u.email, passwordHash, u.role, u.isActive],
      );
    }
    for (const p of projects) {
      await insert(
        `INSERT INTO projects (id, name, description, archived_at, created_by) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [p.id, p.name, p.description, p.archived ? new Date() : null, U.admin],
      );
    }
    for (const m of members) {
      await insert(
        `INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [m.projectId, m.userId, m.role, U.admin],
      );
    }
    for (const t of tasks) {
      await insert(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, due_date, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
                 CASE WHEN $8::int IS NULL THEN NULL ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date + $8::int END,
                 $9,$9)
         ON CONFLICT DO NOTHING`,
        [t.id, t.projectId, t.title, t.description, t.status, t.priority, t.assigneeId, t.dueOffset, U.admin],
      );
    }
    for (const c of comments) {
      await insert(
        `INSERT INTO comments (id, task_id, author_id, body, created_at)
         VALUES ($1,$2,$3,$4, now() - make_interval(mins => $5))
         ON CONFLICT DO NOTHING`,
        [c.id, c.taskId, c.authorId, c.body, c.minutesAgo],
      );
    }
    return inserted;
  });
}
