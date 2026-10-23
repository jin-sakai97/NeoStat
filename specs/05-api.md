# 05 — API contract

Base URL: `http://localhost:4000/api`. Every route below is relative to it. This document is the
contract. The server Zod schemas (`server/src/http/schemas.ts`) and client types
(`client/src/lib/types.ts`) must match it.

## 1. Connection, session and CSRF

| Setting | Value |
| --- | --- |
| Frontend origin | `http://localhost:3000` (`CLIENT_ORIGIN`). Always use `localhost`, never `127.0.0.1` |
| CORS | `origin: CLIENT_ORIGIN`, `credentials: true`, allowed headers `Content-Type, X-CSRF-Token` |
| Client fetch | `credentials: "include"`. JSON bodies use `Content-Type: application/json` |
| Cookie | `neostat.sid`, HttpOnly, SameSite=Lax, Path=/, no Domain, `Secure` only when `NODE_ENV=production` |
| Session store | `connect-pg-simple`, table `user_sessions`, `createTableIfMissing: false` |
| express-session | `resave: false`, `saveUninitialized: false`, `rolling: false`, cookie `maxAge` 8 h |
| Session data | `{ csrfToken, userId?, authVersion?, authExpiresAt? }` |
| Absolute lifetime | 8 h from login (`authExpiresAt`). After that → 401, and the session is destroyed |
| Login | `req.session.regenerate()`, then set userId, authVersion, authExpiresAt and a **new** csrfToken |
| Logout | `req.session.destroy()` + `res.clearCookie("neostat.sid", { path: "/" })` → 204 |
| CSRF | Every non-GET request (login and logout included) needs `X-CSRF-Token` equal to `session.csrfToken` (constant-time compare). A present `Origin` header that differs from `CLIENT_ORIGIN` → 403 |
| Rate limit (P1) | `POST /auth/login`: 10 **failed** attempts per IP per 15 min → 429 `RATE_LIMITED` (`express-rate-limit` with `skipSuccessfulRequests: true`; `standardHeaders`, no legacy headers). The limit is injectable through `createApp({ loginAttemptLimit })` for tests |
| Caching | All `/api` responses: `Cache-Control: no-store` |

**`loadActor` middleware** runs on every route except `/health`, `/auth/csrf` and `/auth/login`:
read `session.userId`, then `SELECT id, name, email, role, is_active, auth_version FROM users WHERE id=$1`.
Reject with 401 if the user is missing or inactive, the version differs, or the session is
expired. Attach `req.actor`.

## 2. Envelopes

```jsonc
// success
{ "data": { /* object or array */ } }
// paginated
{ "data": [ ], "meta": { "page": 1, "pageSize": 25, "total": 0, "totalPages": 0 } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "Check the highlighted fields.",
             "fieldErrors": { "title": ["Title is required."] }, "details": { } } }
```

- 201 for POST that creates, 200 for reads and updates, **204 with no body** for DELETE and logout.
- Timestamps: ISO-8601 UTC strings. Dates: `YYYY-MM-DD`. IDs: UUID strings.

## 3. Validation rules (Zod 4, `.strict()` on every body and query)

| Field | Rule |
| --- | --- |
| Any `:id` param | `z.uuid()` → 400 if malformed |
| `name` (user) | trim, 1–80 |
| `email` | trim, lowercase, `z.email()`, ≤ 254 |
| `password` | **not trimmed**, 8–128 |
| project `name` | trim, 1–120 |
| project `description` | ≤ 4000 (not trimmed; default `''`) |
| task `title` | trim, 1–160 |
| task `description` | ≤ 5000 |
| comment `body` | ≤ 2000, must contain non-whitespace (stored untrimmed) |
| `status` | `TODO \| IN_PROGRESS \| DONE` |
| `priority` | `LOW \| MEDIUM \| HIGH` |
| `dueDate` | `z.iso.date()` or `null` |
| `assigneeId` | `z.uuid()` or `null` |
| `version` | integer ≥ 1 (required on task PATCH and DELETE) |
| `q` | trim, 1–100 (empty string is treated as absent) |
| `page` | int ≥ 1, default 1. `pageSize` int 1–100, default 25 |
| booleans in query | `"true" \| "false"` only |
| PATCH bodies | at least one mutable field. Absent = unchanged. `null` only for `assigneeId` and `dueDate` |

Out-of-range page → `data: []` with the correct `meta.total`.

## 4. Error codes

| HTTP | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Schema failure, unknown key, bad reference (e.g. ineligible `assigneeId`, `managerId`) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 401 | `UNAUTHENTICATED` | No, expired or invalidated session |
| 401 | `INVALID_CREDENTIALS` | Login failed (same message for unknown email, wrong password and inactive user): "Email or password is incorrect." |
| 403 | `CSRF_FAILED` | Missing or wrong token, or foreign Origin |
| 403 | `FORBIDDEN` | Visible but not allowed, or a forbidden field present |
| 404 | `NOT_FOUND` | Missing or outside scope |
| 409 | `TASK_VERSION_CONFLICT` | Stale `version`. `details.currentTask` = full Task DTO |
| 409 | `PROJECT_ARCHIVED` | Write to an archived project |
| 409 | `EMAIL_EXISTS` | Duplicate email |
| 409 | `MEMBER_EXISTS` | Duplicate membership |
| 409 | `MANAGER_REQUIRED` | Would leave a project without its manager. `details.projects` |
| 409 | `ROLE_CONFLICT` | Memberships exceed the new ceiling. `details.projects` |
| 409 | `LAST_ADMIN` | Would remove the last active Admin |
| 409 | `SELF_LOCKOUT` | Admin deactivating or demoting themselves |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 100 kb |
| 429 | `RATE_LIMITED` | Login limit reached |
| 500 | `INTERNAL` | "Something went wrong. Try again." (no internals) |
| 503 | `DB_UNAVAILABLE` | Database unreachable |

Unknown route → 404 `NOT_FOUND`.

## 5. DTOs (`client/src/lib/types.ts` mirrors these exactly)

```ts
type AccountRole = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
type ProjectRole = "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskField = "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate";

interface UserSummary { id: string; name: string; email: string }
interface User extends UserSummary {
  role: AccountRole; isActive: boolean; createdAt: string; updatedAt: string;
}
interface ProjectCapabilities {
  canEditDetails: boolean; canManageTeam: boolean; canCreateTasks: boolean;
  canAssignManager: boolean; canArchive: boolean; canDelete: boolean;
}
interface Project {
  id: string; name: string; description: string;
  archivedAt: string | null;
  manager: UserSummary;
  memberCount: number;
  taskCounts: { total: number; todo: number; inProgress: number; done: number; overdue: number };
  myRole: ProjectRole | "ADMIN";          // ADMIN when the actor is an Admin
  capabilities: ProjectCapabilities;
  createdAt: string; updatedAt: string;
}
interface Member { user: UserSummary & { isActive: boolean; accountRole: AccountRole };
                   role: ProjectRole; joinedAt: string }
interface TaskCapabilities { editableFields: TaskField[]; canDelete: boolean; canComment: boolean }
interface Task {
  id: string; projectId: string; projectName: string;
  title: string; description: string; status: TaskStatus; priority: TaskPriority;
  assignee: UserSummary | null; dueDate: string | null; isOverdue: boolean;
  version: number;
  createdBy: UserSummary; updatedBy: UserSummary;
  createdAt: string; updatedAt: string;
  capabilities: TaskCapabilities;
}
interface Comment { id: string; taskId: string; author: UserSummary; body: string;
                    createdAt: string; canDelete: boolean }
interface TaskActivity {
  id: string; kind: "CREATED" | "UPDATED"; actor: UserSummary; version: number; createdAt: string;
  // only for UPDATED. assigneeId values are { id, name } | null, everything else string | null
  changes: Partial<Record<TaskField, { from: string | { id: string; name: string } | null;
                                       to: string | { id: string; name: string } | null }>>;
}
interface Notification {
  id: string; kind: "TASK_ASSIGNED" | "COMMENT_ADDED" | "ADDED_TO_PROJECT";
  actor: UserSummary;
  task: { id: string; title: string } | null;      // null if not applicable or no longer visible
  project: { id: string; name: string } | null;    // same rule
  readAt: string | null; createdAt: string;
}
interface Dashboard {
  activeProjectCount: number;
  taskCounts: { todo: number; inProgress: number; done: number };
  assignedToMeOpen: number;     // status ≠ DONE
  overdue: number;              // visible tasks, active projects
  recentProjects: Project[];    // 5, by updatedAt desc, active only
  myTasks: Task[];              // up to 5 open assigned tasks, dueDate asc nulls last
}
```

`password_hash`, `auth_version` and session data are **never** serialized.

## 6. Endpoints

Legend: **Auth** = who may call. "member+" = any effective role in the project (404
otherwise). Tier P0 unless noted.

### Health and auth

| Method & path | Auth | Request | Success | Notes |
| --- | --- | --- | --- | --- |
| GET `/health` | public | — | 200 `{data:{status:"ok"}}` | 503 if `SELECT 1` fails |
| GET `/auth/csrf` | public | — | 200 `{data:{csrfToken}}` | Creates the pre-login session if needed (saving csrfToken makes the session persist) |
| POST `/auth/login` | public + CSRF | `{email, password}` | 200 `{data:{user, csrfToken}}` | Regenerates the session. 401 INVALID_CREDENTIALS. 429 |
| GET `/auth/me` | session | — | 200 `{data:{user, csrfToken}}` | 401 if not logged in |
| POST `/auth/logout` | session + CSRF | — | 204 | |
| PATCH `/profile` | session | `{name}` | 200 `{data:User}` | |
| POST `/profile/password` | session + CSRF | `{currentPassword, newPassword}` | 204 | *(P1)* 400 VALIDATION_ERROR (wrong current password → `fieldErrors.currentPassword`; new password 8–128 chars and different from the current one). Bumps `auth_version`, so every other session is revoked; the calling session stays valid (its `authVersion` is updated). |
| GET `/dashboard` | session | — | 200 `{data:Dashboard}` | Scoped (`03` §2) |

### Users (Admin only, 403 otherwise)

| Method & path | Request | Success | Errors |
| --- | --- | --- | --- |
| GET `/users` | query `q?, role?, isActive?, page?, pageSize?` | 200 paginated `User[]`, by name asc, id | |
| GET `/users/:id` | — | 200 `User` | 404 |
| POST `/users` | `{name, email, password, role}` | 201 `User` (active) | 409 EMAIL_EXISTS |
| PATCH `/users/:id` | `{name?, email?, role?, isActive?, password?}` | 200 `User` | 409 EMAIL_EXISTS / ROLE_CONFLICT / MANAGER_REQUIRED / LAST_ADMIN / SELF_LOCKOUT |

### Projects

| Method & path | Auth | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET `/projects` | session | query `q?, archived? (default false), page?, pageSize?` | 200 paginated `Project[]`, updatedAt desc, id | |
| POST `/projects` | Admin | `{name, description?, managerId}` | 201 `Project` | 400 managerId ineligible |
| GET `/projects/:id` | member+ | — | 200 `Project` | 404 |
| PATCH `/projects/:id` | Admin, manager | `{name?, description?}` | 200 `Project` | 403, 409 PROJECT_ARCHIVED |
| POST `/projects/:id/archive` | Admin | — | 200 `Project` (idempotent) | 403 |
| POST `/projects/:id/restore` | Admin | — | 200 `Project` (idempotent) | 403 |
| DELETE `/projects/:id` | Admin | — | 204 | 403 |
| PUT `/projects/:id/manager` | Admin | `{userId}` | 200 `Project` | 400 ineligible |

### Members

| Method & path | Auth | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET `/projects/:id/members` | member+ | query `assignable? (true ⇒ active PM/TM only), page?, pageSize?` | 200 paginated `Member[]`, name asc | |
| GET `/projects/:id/member-candidates` | Admin, manager | query `q?, page?, pageSize?` | 200 paginated `{id,name,email,accountRole}[]`: active, non-Admin, not already a member | 403 |
| POST `/projects/:id/members` | Admin, manager | `{userId, role: TEAM_MEMBER\|VIEWER}` | 201 `Member` | 400 ceiling, 409 MEMBER_EXISTS / PROJECT_ARCHIVED |
| PATCH `/projects/:id/members/:userId` | Admin, manager | `{role: TEAM_MEMBER\|VIEWER}` | 200 `Member` | 409 MANAGER_REQUIRED / PROJECT_ARCHIVED, 400 ceiling |
| DELETE `/projects/:id/members/:userId` | Admin, manager | — | 204 | 409 MANAGER_REQUIRED / PROJECT_ARCHIVED |

### Tasks

| Method & path | Auth | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET `/tasks` | session | query (below) | 200 paginated `Task[]` | 404 if an explicit `projectId` is not visible |
| POST `/projects/:id/tasks` | Admin, manager | `{title, description?, status?, priority?, assigneeId?, dueDate?}` | 201 `Task` (version 1) | 400 assignee, 409 PROJECT_ARCHIVED |
| GET `/tasks/:id` | member+ | — | 200 `Task` | 404 |
| PATCH `/tasks/:id` | per `editableFields` | `{version, …changed fields}` | 200 `Task` | 403, 409 TASK_VERSION_CONFLICT / PROJECT_ARCHIVED |
| DELETE `/tasks/:id` | Admin, manager | `{version}` (JSON body) | 204 | 409 TASK_VERSION_CONFLICT |
| GET `/tasks/:id/activity` | member+ (same scope as the task) | query `page?, pageSize?` | 200 paginated `TaskActivity[]`, createdAt desc, id | 404 |

`GET /tasks` query: `projectId?` (uuid), `assigneeId?` (uuid \| `me` \| `unassigned`),
`status?`, `priority?`, `q?` (title ILIKE), `archived?` (default false; applies to the parent
project), `sort?` (`updatedAt|title|dueDate|priority|status`, default `updatedAt`), `order?`
(`asc|desc`, default `desc`), `page?`, `pageSize?`. Visibility is always the scoped project set.

### Comments

| Method & path | Auth | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET `/tasks/:id/comments` | member+ | query `page?, pageSize?` | 200 paginated `Comment[]`, createdAt desc, id | 404 |
| POST `/tasks/:id/comments` | Admin, manager, TM | `{body}` | 201 `Comment` | 403, 409 PROJECT_ARCHIVED |
| DELETE `/comments/:id` | author (PM/TM role now), manager, Admin | — | 204 | 403, 409 PROJECT_ARCHIVED |

Comment operations never change `tasks.version` or `tasks.updated_at`.

### Notifications

| Method & path | Auth | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| GET `/notifications` | session | query `unread? (true), page?, pageSize?` | 200 paginated `Notification[]`, createdAt desc, id (own only) | |
| GET `/notifications/unread-count` | session | — | 200 `{data:{count}}` | |
| POST `/notifications/:id/read` | session + CSRF | — | 204 (idempotent) | 404 not yours / unknown |
| POST `/notifications/read-all` | session + CSRF | — | 204 | |

`read-all` marks only the caller's unread notifications. Visibility rule for names: `03 §Notifications`.

## 7. Example: conflict

```http
PATCH /api/tasks/00000000-0000-4000-8000-200000000001
X-CSRF-Token: …
Content-Type: application/json

{ "version": 1, "status": "IN_PROGRESS" }
```

```http
HTTP/1.1 409 Conflict
{ "error": { "code": "TASK_VERSION_CONFLICT",
  "message": "This task changed after you opened it. Review the latest version.",
  "details": { "currentTask": { "id": "…", "version": 2, "title": "…", "status": "DONE", … } } } }
```
