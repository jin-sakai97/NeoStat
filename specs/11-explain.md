# 11 — Explaining NeoStat (live Q&A prep)

Plain-language walkthroughs of the five mechanisms judges are most likely to ask about, with the
exact code to point at. Paths are relative to `server/src/` unless they say otherwise.

## 1. The permission predicate — "who can do what?"

**Code:** `domain/policy.ts:22` (`effectiveRole`), `:28` (`canManage`), `:31` (`editableTaskFields`).
Loaded per request by `domain/access.ts:22` (`projectAccess`).

- Every user has an **account role**: Admin, Project Manager, Team Member or Viewer. It sets the
  ceiling on what they *could* be.
- Inside a project, a user has a **project role** from the `project_members` table. It sets what
  they *can* do there.
- `effectiveRole(actor, membership)`: an Admin is `ADMIN` everywhere; anyone else gets their
  membership role, or `null` if they are not a member.
- `null` means **404**: we don't even admit the project exists. A role that is too low means
  **403**: you can see it, but you can't do that.
- `editableTaskFields`: managers and admins can edit every field. A Team Member can edit
  `title`, `description` and `status`, and only on a task **assigned to them**. Viewers can edit
  nothing.
- A PATCH containing *any* field outside that list is rejected whole (403), so a member can't
  sneak in a priority change alongside a title edit.

*Talking point:* the UI hides buttons using `capabilities` that the server computes with the same
functions, but every API call re-checks. Hiding a button is only a convenience.

## 2. A scoped SQL query — "how do lists avoid leaking data?"

**Code:** `repos/projects.repo.ts:8–25` (`SELECT_PROJECT`).

```sql
FROM projects p
LEFT JOIN project_members my ON my.project_id = p.id AND my.user_id = $1   -- my membership, if any
WHERE p.deleted_at IS NULL
  AND ($2::boolean OR my.user_id IS NOT NULL)                              -- $2 = "is admin"
```

The same visibility clause feeds the rows, the `total` count and the dashboard counters, so
counts never reveal projects you can't open. Tasks use the same idea (`repos/tasks.repo.ts`,
`SELECT_TASK`): the task is visible if its project is. Search text is a `$n` parameter, with LIKE
wildcards escaped. `ORDER BY` columns come from a fixed whitelist (`SORT_SQL`), never from user
input.

## 3. The version-conditioned update — "how do you stop stale overwrites?"

**Code:** `domain/tasks.service.ts:61` (`updateTask`), `:46` (`lockTaskForWrite`), `:74–80`.

1. Every task row has `version` (starting at 1). The browser sends back the version it loaded.
2. Inside one transaction: lock the project (shared), read my membership, then lock the task row
   (`FOR UPDATE`).
3. Re-check permission against the **current** task. If I lost access I get 404/403, never the
   newer data.
4. Run:
   ```sql
   UPDATE tasks SET <changed columns>, version = version + 1, updated_at = now(), updated_by = $3
   WHERE id = $1 AND version = $2
   ```
5. If zero rows changed, someone saved first. Respond **409 `TASK_VERSION_CONFLICT`** with the full
   current task.
6. The UI (`client/src/components/tasks/conflict-dialog.tsx`) shows *Latest vs Mine* for each
   changed field. The user chooses **Reload latest** (confirmed) or **Re-apply my changes**, then
   presses Save again. Nothing is merged or retried automatically.

The same check protects status changes from the table dropdown, reassignment and **delete**
(`DELETE … WHERE id = $1 AND version = $2`).
*Proof:* `tests/integration/tasks-concurrency.test.ts` sends two same-version PATCHes in parallel.
Exactly one wins.

## 4. The cleanup transaction — "what happens to a removed member's tasks?"

**Code:** `domain/access.ts:51` (`unassignTasks`), `domain/projects.service.ts:156` (`removeMember`),
`:142` (`changeMemberRole`), `domain/users.service.ts` (deactivation).

In one transaction, with the project row locked `FOR UPDATE`:

```sql
UPDATE tasks SET assignee_id = NULL, version = version + 1, updated_at = now(), updated_by = $actor
WHERE assignee_id = $user AND project_id = $project;
DELETE FROM project_members WHERE project_id = $project AND user_id = $user;
```

- The **version bump** matters: anyone with that task open now gets a 409 instead of
  overwriting the cleanup.
- Comments and `created_by` are kept. History is never rewritten.
- The designated manager can't be removed or downgraded (409 `MANAGER_REQUIRED`). The Admin
  replaces them first (`PUT /projects/:id/manager`).
- A composite foreign key `tasks(project_id, assignee_id) → project_members` makes it impossible
  in the database for a task to be assigned to a non-member.

## 5. The session lifecycle — "how does login work?"

**Code:** `http/session.ts`, `routes/auth.routes.ts:33` (login), `:40` (`regenerate`), `:62`
(logout), `http/actor.ts:7` (`loadActor`), `http/csrf.ts:15`. Wired in `app.ts:46–49`.

1. The browser calls `GET /api/auth/csrf`. That creates a small pre-login session and returns a
   random CSRF token.
2. `POST /api/auth/login` (with `X-CSRF-Token`) checks the scrypt password hash. On success it
   **regenerates** the session ID (stops session fixation), stores `userId`, `authVersion` and an
   8-hour expiry, and **rotates** the CSRF token.
3. The cookie `neostat.sid` holds only a random ID. It is HttpOnly and SameSite=Lax, and the
   session data lives in PostgreSQL (`user_sessions`).
4. On every request, `loadActor` re-reads the user from the database. If they are inactive,
   their `auth_version` changed (role, email or password change, or deactivation) or the session
   expired → 401. That is how deactivation logs someone out everywhere immediately.
5. Every mutation must carry the CSRF header, and any `Origin` header must be exactly
   `http://localhost:3000`.
6. Logout destroys the session row and clears the cookie. The frontend also clears its whole query
   cache.

## Concurrency for admins — "can two admins demote each other?"

`domain/users.service.ts:41` locks **all active admin rows** before checking "is this the last
admin?". Two simultaneous demotions are serialized: the second one re-reads and sees there is only
one admin left (409 `LAST_ADMIN`), or sees that it is no longer an admin itself (403). Tested in
`tests/integration/lifecycle.test.ts` (C12).

## Likely "modify / extend" requests → where to change

| Request | Change |
| --- | --- |
| Add a task field (e.g. `estimate`) | New migration file in `server/migrations/` → add the column in `repos/tasks.repo.ts` (`toTaskDTO`) and `COLUMNS` in `domain/tasks.service.ts` → Zod in `http/schemas.ts` → `ALL_TASK_FIELDS` in `domain/policy.ts` → `client/src/lib/types.ts` + `task-form.tsx` |
| Let Viewers comment | `canWrite` / `taskCapabilities` in `domain/policy.ts` → update test B9 |
| Let Team Members self-assign | `editableTaskFields` in `domain/policy.ts` + a check that `assigneeId === actor.id` in `updateTask` |
| Allow multiple managers | New migration dropping the `project_members_one_manager` index → rework `replaceManager` and `MANAGER_REQUIRED` checks |
| Add a "label" filter | `taskListQuery` in `http/schemas.ts` → a `WHERE` clause in `listTasks` → a filter select in `task-table.tsx` |
| Show only assigned tasks to members | Add `AND (my.role <> 'TEAM_MEMBER' OR t.assignee_id = $1)` to `SELECT_TASK` in `repos/tasks.repo.ts` |
| Kanban board | Group `useTasks` results by status and drag → the same `PATCH {version, status}`, so conflicts are handled for free |
