import { z } from "zod";

// Request schemas (specs/05-api.md §3). Every object is strict: unknown keys fail with 400.

export const ACCOUNT_ROLES = ["ADMIN", "PROJECT_MANAGER", "TEAM_MEMBER", "VIEWER"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

const nonBlank = (max: number) => z.string().max(max).refine((v) => v.trim() !== "", "Must not be blank.");
const queryBool = z.enum(["true", "false"]).transform((v) => v === "true");
const search = z.string().trim().max(100).optional().transform((v) => v || undefined);

export const idParam = z.strictObject({ id: z.uuid() });
export const memberParams = z.strictObject({ id: z.uuid(), userId: z.uuid() });

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
export const pageQuery = z.strictObject(page);

export const userName = z.string().trim().min(1).max(80);
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const password = z.string().min(8).max(128);

export const userListQuery = z.strictObject({
  ...page, q: search, role: z.enum(ACCOUNT_ROLES).optional(), isActive: queryBool.optional(),
});
export const createUserBody = z.strictObject({ name: userName, email, password, role: z.enum(ACCOUNT_ROLES) });
export const updateUserBody = z
  .strictObject({ name: userName, email, password, role: z.enum(ACCOUNT_ROLES), isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to change.");

const projectName = z.string().trim().min(1).max(120);
const projectDescription = z.string().max(4000);
export const projectListQuery = z.strictObject({ ...page, q: search, archived: queryBool.default(false) });
export const createProjectBody = z.strictObject({ name: projectName, description: projectDescription.default(""), managerId: z.uuid() });
export const updateProjectBody = z
  .strictObject({ name: projectName, description: projectDescription })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to change.");
export const managerBody = z.strictObject({ userId: z.uuid() });

const memberRole = z.enum(["TEAM_MEMBER", "VIEWER"]);
export const memberListQuery = z.strictObject({ ...page, assignable: queryBool.default(false) });
export const candidateQuery = z.strictObject({ ...page, q: search });
export const addMemberBody = z.strictObject({ userId: z.uuid(), role: memberRole });
export const updateMemberBody = z.strictObject({ role: memberRole });

const taskTitle = z.string().trim().min(1).max(160);
const taskFields = {
  title: taskTitle,
  description: z.string().max(5000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: z.uuid().nullable(),
  dueDate: z.iso.date().nullable(),
};
export const createTaskBody = z.strictObject({
  title: taskTitle,
  description: taskFields.description.default(""),
  status: taskFields.status.default("TODO"),
  priority: taskFields.priority.default("MEDIUM"),
  assigneeId: taskFields.assigneeId.default(null),
  dueDate: taskFields.dueDate.default(null),
});
export const updateTaskBody = z
  .strictObject({ version: z.number().int().min(1), ...taskFields })
  .partial({ title: true, description: true, status: true, priority: true, assigneeId: true, dueDate: true })
  .refine((body) => Object.keys(body).length > 1, "Provide at least one field to change.");
export const deleteTaskBody = z.strictObject({ version: z.number().int().min(1) });

export const TASK_SORTS = ["updatedAt", "title", "dueDate", "priority", "status"] as const;
export const taskListQuery = z.strictObject({
  ...page,
  projectId: z.uuid().optional(),
  assigneeId: z.union([z.uuid(), z.literal("me"), z.literal("unassigned")]).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  q: search,
  archived: queryBool.default(false),
  sort: z.enum(TASK_SORTS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const commentBody = z.strictObject({ body: nonBlank(2000) });
