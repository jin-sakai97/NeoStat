import { Router } from "express";
import type pg from "pg";
import { projectAccess } from "../domain/access.js";
import { canManage } from "../domain/policy.js";
import {
  addMember, changeMemberRole, createProject, removeMember, replaceManager, setLifecycle, updateProject,
} from "../domain/projects.service.js";
import { forbidden, notFound } from "../http/errors.js";
import { likePattern, limitOffset, paginated } from "../http/pagination.js";
import {
  addMemberBody, candidateQuery, createProjectBody, idParam, managerBody, memberListQuery, memberParams,
  projectListQuery, updateMemberBody, updateProjectBody,
} from "../http/schemas.js";
import { parse } from "../http/validate.js";
import { getMemberDTO, listMembers } from "../repos/members.repo.js";
import { getProjectDTO, listProjects } from "../repos/projects.repo.js";

export function projectRoutes(pool: pg.Pool) {
  const router = Router();

  router.get("/projects", async (req, res) => {
    const query = parse(projectListQuery, req.query);
    const { rows, total } = await listProjects(pool, req.actor!, { ...query, ...limitOffset(query) });
    res.json(paginated(rows, total, query));
  });

  router.post("/projects", async (req, res) => {
    res.status(201).json({ data: await createProject(pool, req.actor!.id, parse(createProjectBody, req.body)) });
  });

  router.get("/projects/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const project = await getProjectDTO(pool, req.actor!, id);
    if (!project) throw notFound("Project");
    res.json({ data: project });
  });

  router.patch("/projects/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    res.json({ data: await updateProject(pool, req.actor!.id, id, parse(updateProjectBody, req.body)) });
  });

  for (const action of ["archive", "restore"] as const) {
    router.post(`/projects/:id/${action}`, async (req, res) => {
      const { id } = parse(idParam, req.params);
      res.json({ data: await setLifecycle(pool, req.actor!.id, id, action) });
    });
  }

  router.delete("/projects/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    await setLifecycle(pool, req.actor!.id, id, "delete");
    res.status(204).end();
  });

  router.put("/projects/:id/manager", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { userId } = parse(managerBody, req.body);
    res.json({ data: await replaceManager(pool, req.actor!.id, id, userId) });
  });

  // ---- Members ----

  router.get("/projects/:id/members", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const query = parse(memberListQuery, req.query);
    await projectAccess(pool, req.actor!, id);
    const { rows, total } = await listMembers(pool, id, { assignable: query.assignable, ...limitOffset(query) });
    res.json(paginated(rows, total, query));
  });

  router.get("/projects/:id/member-candidates", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const query = parse(candidateQuery, req.query);
    const { role } = await projectAccess(pool, req.actor!, id);
    if (!canManage(role)) throw forbidden("Only the project manager or an admin can manage the team.");
    const params: unknown[] = [id];
    const search = query.q ? ` AND (u.name ILIKE $${params.push(likePattern(query.q))} OR u.email ILIKE $${params.length})` : "";
    const where = `FROM users u WHERE u.is_active AND u.role <> 'ADMIN'
      AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = u.id)${search}`;
    const count = await pool.query<{ total: number }>(`SELECT count(*)::int AS total ${where}`, params);
    const { limit, offset } = limitOffset(query);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role AS "accountRole" ${where} ORDER BY u.name, u.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json(paginated(rows, count.rows[0].total, query));
  });

  router.post("/projects/:id/members", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const { userId, role } = parse(addMemberBody, req.body);
    await addMember(pool, req.actor!.id, id, userId, role);
    res.status(201).json({ data: await getMemberDTO(pool, id, userId) });
  });

  router.patch("/projects/:id/members/:userId", async (req, res) => {
    const { id, userId } = parse(memberParams, req.params);
    const { role } = parse(updateMemberBody, req.body);
    await changeMemberRole(pool, req.actor!.id, id, userId, role);
    res.json({ data: await getMemberDTO(pool, id, userId) });
  });

  router.delete("/projects/:id/members/:userId", async (req, res) => {
    const { id, userId } = parse(memberParams, req.params);
    await removeMember(pool, req.actor!.id, id, userId);
    res.status(204).end();
  });

  return router;
}
