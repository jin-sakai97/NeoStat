import { Router } from "express";
import type pg from "pg";
import { z } from "zod";
import { limitOffset, paginated } from "../http/pagination.js";
import { idParam, pageQuery } from "../http/schemas.js";
import { parse } from "../http/validate.js";
import { listNotifications, markAllRead, markRead, unreadCount } from "../repos/notifications.repo.js";

const listQuery = pageQuery.extend({ unread: z.enum(["true"]).optional() });

// Every query is scoped to the signed-in user; there is no cross-user access path.
export function notificationRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/notifications", async (req, res) => {
    const query = parse(listQuery, req.query);
    const { limit, offset } = limitOffset(query);
    const { rows, total } = await listNotifications(pool, req.actor!, { unreadOnly: query.unread === "true", limit, offset });
    res.json(paginated(rows, total, query));
  });

  router.get("/notifications/unread-count", async (req, res) => {
    res.json({ data: { count: await unreadCount(pool, req.actor!.id) } });
  });

  // Registered before /:id/read so "read-all" is never taken for an id.
  router.post("/notifications/read-all", async (req, res) => {
    await markAllRead(pool, req.actor!.id);
    res.status(204).end();
  });

  router.post("/notifications/:id/read", async (req, res) => {
    const { id } = parse(idParam, req.params);
    await markRead(pool, req.actor!.id, id);
    res.status(204).end();
  });

  return router;
}
