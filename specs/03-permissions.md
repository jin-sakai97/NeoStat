# 03 — Roles, permissions, lifecycle and locking

All rules here are enforced in `server/src/domain/policy.ts` (pure functions) and the services
that call it. UI capability flags are **computed from the same functions** and are guidance only.

## 1. Roles and ceilings

| Account role | Allowed project roles |
| --- | --- |
| `ADMIN` | None needed. Has global access and is never stored in `project_members` |
| `PROJECT_MANAGER` | `PROJECT_MANAGER`, `TEAM_MEMBER`, `VIEWER` |
| `TEAM_MEMBER` | `TEAM_MEMBER`, `VIEWER` |
| `VIEWER` | `VIEWER` |

- A Project Manager *account* with the `VIEWER` project role is read-only in that project.
- Admin accounts cannot be added as members (they are excluded from member candidates; returns
  400 `VALIDATION_ERROR` if attempted).
- Changing an account role is rejected with **409 ROLE_CONFLICT** if any membership in a
  non-deleted project would exceed the new ceiling. `details.projects: [{id, name, projectRole}]`
  lists them.
- Changing a user to `ADMIN` is also rejected with ROLE_CONFLICT while they hold any membership.
  The Admin removes the memberships first. This keeps the model simple: Admins never have rows in
  `project_members`.

## 2. The permission predicate

```ts
type EffectiveRole = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER" | null;

// project must be non-deleted (deleted_at IS NULL) or it's treated as not found.
function effectiveRole(actor: Actor, membership: Membership | null): EffectiveRole {
  if (!actor.isActive) return null;              // never reached: loadActor rejects inactive
  if (actor.role === "ADMIN") return "ADMIN";
  return membership?.role ?? null;               // null ⇒ 404 for everything in the project
}

const canManage = (r: EffectiveRole) => r === "ADMIN" || r === "PROJECT_MANAGER";
const canWrite  = (r: EffectiveRole) => canManage(r) || r === "TEAM_MEMBER";

function editableTaskFields(r: EffectiveRole, task: Task, actor: Actor): TaskField[] {
  if (canManage(r)) return ["title", "description", "status", "priority", "assigneeId", "dueDate"];
  if (r === "TEAM_MEMBER" && task.assigneeId === actor.id) return ["title", "description", "status"];
  return [];
}
```

Only the **designated manager's** membership row has `role = 'PROJECT_MANAGER'`, so
"project role is PROJECT_MANAGER" means "is the designated manager".

Archived projects: every write check also requires `project.archivedAt === null`, except the
operations listed in §4.

## 3. Permission matrix

All non-Admin columns assume the actor is a member of the project. Non-members get **404**.

| Action | Admin | Manager | Project TM | Project Viewer |
| --- | :-: | :-: | :-: | :-: |
| View project, tasks, team, comments | ✅ all | ✅ | ✅ | ✅ |
| Create project | ✅ | ❌ | ❌ | ❌ |
| Edit project name/description | ✅ | ✅ | ❌ | ❌ |
| Archive / restore / soft-delete project | ✅ | ❌ | ❌ | ❌ |
| Replace designated manager | ✅ | ❌ | ❌ | ❌ |
| Add/remove TM or Viewer members | ✅ | ✅ | ❌ | ❌ |
| Change a member's role (TM ↔ Viewer) | ✅ | ✅ | ❌ | ❌ |
| Create task | ✅ | ✅ | ❌ | ❌ |
| Edit any task field | ✅ | ✅ | ❌ | ❌ |
| Edit title/description/status of a task assigned to self | ✅ | ✅ | ✅ | ❌ |
| Assign / reassign / unassign | ✅ | ✅ | ❌ | ❌ |
| Delete task | ✅ | ✅ | ❌ | ❌ |
| Add comment | ✅ | ✅ | ✅ | ❌ |
| Delete own comment | ✅ | ✅ | ✅ | ❌ |
| Delete someone else's comment | ✅ | ✅ | ❌ | ❌ |
| Manage user accounts | ✅ | ❌ | ❌ | ❌ |
| Update own display name | ✅ | ✅ | ✅ | ✅ |

Notes:

- A user whose project role is **now** Viewer cannot delete comments they wrote earlier.
- Account-level endpoints (`/users*`) are Admin-only: non-Admins get **403** (the endpoint
  exists, the action is forbidden).

## 4. Status-code decision order (every request)

1. No or invalid session, session expired, `auth_version` mismatch, or user inactive → **401**.
2. Mutation without a valid `X-CSRF-Token`, or with a foreign `Origin` → **403 CSRF_FAILED**.
3. Body or query fails Zod validation (including unknown keys) → **400 VALIDATION_ERROR**.
4. Resource missing, project soft-deleted, or actor has no effective role → **404 NOT_FOUND**.
5. Actor can read but not perform this action, or a forbidden field is present → **403 FORBIDDEN**.
6. Project archived and the operation is not exempt → **409 PROJECT_ARCHIVED**.
7. Business-rule conflict (version, duplicate, manager, role, last admin) → **409 <CODE>**.

Steps 4–7 run **inside** the transaction, after locking, using fresh reads (§6).

**Archived exemptions** (allowed while archived): restore, soft delete, `PUT /manager`, and
deactivation cleanup. Reads are always allowed.

## 5. Lifecycle rules

### Project states

| State | Lists and counts | Direct GET | Writes |
| --- | --- | --- | --- |
| Active (`archived_at IS NULL AND deleted_at IS NULL`) | Default lists | ✅ | Per matrix |
| Archived (`archived_at` set) | Only with `archived=true` filter; excluded from dashboard | ✅ read-only | 409 except exemptions |
| Soft-deleted (`deleted_at` set) | Never | **404 for everyone, including Admin** | 404 |

Archive and restore are idempotent (200 with the current project either way). Soft delete returns
204. A second delete returns 404.

### Project creation

`POST /projects {name, description?, managerId}` creates, in one transaction, the project row
and a membership `(managerId, PROJECT_MANAGER, added_by = admin)`. `managerId` must be an
**active** user with account role `PROJECT_MANAGER`, otherwise 400 VALIDATION_ERROR on
`managerId`.

### Manager replacement — `PUT /projects/:id/manager {userId}`

In one transaction, with the project row locked `FOR UPDATE`:

1. The new user must be active with account role `PROJECT_MANAGER`. If not → 400.
2. If the new user is already the manager → 200, no-op.
3. Demote the old manager's row to `TEAM_MEMBER`. They keep their assignments.
4. If the new user is a member, upgrade their row to `PROJECT_MANAGER`. Otherwise insert one.
5. Exactly one manager after commit (also guaranteed by the partial unique index; demote before
   promote).

### Membership removal and downgrade to Viewer

- Target is the designated manager → **409 MANAGER_REQUIRED** ("Replace the manager first").
- In one transaction: lock the project row, then run
  `UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now(), updated_by = $actor WHERE project_id = $p AND assignee_id = $u`,
  then delete or update the membership row.
- Removing a member does **not** delete their tasks' `created_by` or their comments.
- Adding a user who is already a member → **409 MEMBER_EXISTS**.
- The project role must fit the account ceiling and must be `TEAM_MEMBER` or `VIEWER` (not PM,
  use manager replacement) → 400 otherwise.

### User deactivation — `PATCH /users/:id {isActive:false}`

- Target is the actor → **409 SELF_LOCKOUT**.
- Target is the designated manager of any non-deleted project (archived included) →
  **409 MANAGER_REQUIRED** with `details.projects`.
- Target is the last active Admin → **409 LAST_ADMIN**.
- Otherwise, in one transaction: set `is_active = false`, `auth_version = auth_version + 1` (which
  kills sessions), and unassign the user's tasks in **all** non-deleted projects (version bump
  included). Memberships remain.
- Reactivation sets `is_active = true` and bumps `auth_version`. Cleared assignments are **not**
  restored.

### Account role change — `PATCH /users/:id {role}`

- Self-demotion of an Admin → 409 SELF_LOCKOUT.
- Demoting the last active Admin → 409 LAST_ADMIN.
- Memberships exceeding the new ceiling → 409 ROLE_CONFLICT (§1).
- If the target manages any project and the new role ≠ PROJECT_MANAGER → 409 MANAGER_REQUIRED.
- On success: `auth_version + 1`.

`auth_version` also increments on email or password change.

## 6. Transactions and locking (replaces SERIALIZABLE + retries)

Isolation: PostgreSQL default **READ COMMITTED**. Invariants are protected by explicit row locks,
always taken in this **global order** so that two transactions can never deadlock:

```
1. users rows        (admin-guard set, or the target user)   FOR UPDATE
2. projects row                                              FOR UPDATE (structure change) | FOR SHARE (content write)
3. project_members rows                                      FOR SHARE (read actor) / UPDATE / DELETE
4. tasks rows                                                FOR UPDATE / via UPDATE
5. comments
```

| Operation | Locks taken (in order) |
| --- | --- |
| Task PATCH / DELETE | project `FOR SHARE` → actor membership `FOR SHARE` → task `FOR UPDATE` |
| Task create, comment create/delete | project `FOR SHARE` → actor membership `FOR SHARE` |
| Membership add/change/remove, manager replace, archive/restore/delete, project edit | project `FOR UPDATE` |
| Deactivate / role change / reactivate | if target or actor is ADMIN, or the change removes ADMIN: `SELECT … FROM users WHERE role='ADMIN' AND is_active FOR UPDATE`; then target user `FOR UPDATE` (skip if already locked) |
| Deactivation unassign | (after user lock) `UPDATE tasks … WHERE assignee_id = $u AND project_id IN (non-deleted)` |

Rules:

- Every operation that changes membership or bulk-updates tasks in a project first takes the
  project row `FOR UPDATE`, which conflicts with the content writers' `FOR SHARE`. So members and
  tasks are never locked in opposite orders by two transactions touching the same project.
- Inside the transaction, **re-read** the actor (`is_active`, `role`) and their membership. Never
  trust values cached from the session middleware for write decisions.
- The task update is still **conditional on version** (`WHERE id = $1 AND version = $2`). The row
  lock makes the order of permission check and update atomic. The version predicate detects
  staleness.
- Unique and foreign-key violations map to 409 codes (`23505` → EMAIL_EXISTS / MEMBER_EXISTS;
  `23503` → 400 VALIDATION_ERROR).
- Connection errors → 503 `DB_UNAVAILABLE`. No automatic retries of user mutations.

## 7. Task mutation algorithm (PATCH /tasks/:id)

```
validate body (zod strict): {version:int≥1, title?, description?, status?, priority?, assigneeId?: uuid|null, dueDate?: date|null}
require at least one field besides version                         → 400
BEGIN
  task  := SELECT … FROM tasks WHERE id=$id                        (no lock yet; to find project)
  if !task                                                         → 404
  proj  := SELECT … FROM projects WHERE id=task.project_id AND deleted_at IS NULL FOR SHARE
  if !proj                                                         → 404
  actor := SELECT is_active, role FROM users WHERE id=$actor
  mem   := SELECT role FROM project_members WHERE project_id=… AND user_id=$actor FOR SHARE
  task  := SELECT … FROM tasks WHERE id=$id FOR UPDATE             (fresh; may have been deleted → 404)
  r     := effectiveRole(actor, mem);  if r=null                   → 404
  allowed := editableTaskFields(r, task, actor)                    (uses CURRENT assignee)
  if any body key ∉ allowed                                        → 403 FORBIDDEN
  if proj.archived_at                                              → 409 PROJECT_ARCHIVED
  if assigneeId given and not null: must be member with role PM|TM and active  → 400 VALIDATION_ERROR(assigneeId)
  row := UPDATE tasks SET <whitelisted cols>, version=version+1, updated_at=now(), updated_by=$actor
         WHERE id=$id AND version=$version RETURNING *
  if !row                                                          → 409 TASK_VERSION_CONFLICT {currentTask: toDTO(task)}
COMMIT → 200 {data: toDTO(row)}
```

Delete uses the same steps with `DELETE … WHERE id=$id AND version=$version`.

**Authorization comes before conflict disclosure.** The 403/404 checks run against the *current*
task, so a stale client that lost access never receives the latest data.
