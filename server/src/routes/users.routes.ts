import { Router, type RequestHandler } from "express";
import type pg from "pg";
import { createUser, updateUser } from "../domain/users.service.js";
import { forbidden, notFound } from "../http/errors.js";
import { likePattern, limitOffset, paginated } from "../http/pagination.js";
import { createUserBody, idParam, updateUserBody, userListQuery } from "../http/schemas.js";
import { parse } from "../http/validate.js";
import { type UserRow, findUserById, toUserDTO } from "../repos/users.repo.js";

const adminOnly: RequestHandler = (req, _res, next) => next(req.actor?.role === "ADMIN" ? undefined : forbidden("Only admins can manage users."));

export function userRoutes(pool: pg.Pool) {
  const router = Router();
  router.use("/users", adminOnly);

  router.get("/users", async (req, res) => {
    const query = parse(userListQuery, req.query);
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (query.q) conditions.push(`(name ILIKE $${params.push(likePattern(query.q))} OR email ILIKE $${params.length})`);
    if (query.role) conditions.push(`role = $${params.push(query.role)}`);
    if (query.isActive !== undefined) conditions.push(`is_active = $${params.push(query.isActive)}`);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM users ${where}`, params);
    const { limit, offset } = limitOffset(query);
    const { rows } = await pool.query<UserRow>(
      `SELECT * FROM users ${where} ORDER BY name, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json(paginated(rows.map(toUserDTO), count.rows[0].total, query));
  });

  router.get("/users/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const user = await findUserById(pool, id);
    if (!user) throw notFound("User");
    res.json({ data: toUserDTO(user) });
  });

  router.post("/users", async (req, res) => {
    res.status(201).json({ data: await createUser(pool, req.actor!.id, parse(createUserBody, req.body)) });
  });

  router.patch("/users/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json({ data: await updateUser(pool, req.actor!.id, id, parse(updateUserBody, req.body)) });
  });

  return router;
}
