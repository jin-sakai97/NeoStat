import { Router } from "express";
import type pg from "pg";
import { projectAccess } from "../domain/access.js";
import { createTask, deleteTask, updateTask } from "../domain/tasks.service.js";
import { notFound } from "../http/errors.js";
import { limitOffset, paginated } from "../http/pagination.js";
import { createTaskBody, deleteTaskBody, idParam, taskListQuery, updateTaskBody } from "../http/schemas.js";
import { parse } from "../http/validate.js";
import { getTaskDTO, listTasks } from "../repos/tasks.repo.js";

export function taskRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/tasks", async (req, res) => {
    const query = parse(taskListQuery, req.query);
    if (query.projectId) await projectAccess(pool, req.actor!, query.projectId); // explicit inaccessible project ⇒ 404
    const { rows, total } = await listTasks(pool, req.actor!, { ...query, ...limitOffset(query) });
    res.json(paginated(rows, total, query));
  });

  router.post("/projects/:id/tasks", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const task = await createTask(pool, req.actor!.id, id, parse(createTaskBody, req.body));
    res.status(201).json({ data: task });
  });

  router.get("/tasks/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const task = await getTaskDTO(pool, req.actor!, id);
    if (!task) throw notFound("Task");
    res.json({ data: task });
  });

  router.patch("/tasks/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json({ data: await updateTask(pool, req.actor!.id, id, parse(updateTaskBody, req.body)) });
  });

  router.delete("/tasks/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { version } = parse(deleteTaskBody, req.body);
    await deleteTask(pool, req.actor!.id, id, version);
    res.status(204).end();
  });

  return router;
}
