# 10 — Verification log and review checklist

Append one entry per slice. Record **actual** command output (counts), not intentions. If a
check was skipped, say so.

## Reviewer checklist (use on every slice diff)

1. **Scope**: Does every read path filter `deleted_at IS NULL` and apply membership (or the
   Admin flag)? Do list counts and `total` use the same predicate as the rows?
2. **Authorization**: Does every mutation re-read the actor and membership inside the
   transaction? Is 404 vs 403 ordered per `03 §4`? Are capabilities derived from `policy.ts`?
3. **Field rule**: Does a task PATCH reject any key outside `editableFields` with 403 *before*
   writing?
4. **Version**: Is every task UPDATE/DELETE conditioned on `version = $n`? Is the version bumped
   exactly once (including in cleanup)? Does 409 carry the full DTO only after authorization?
5. **Transactions**: Is one client used per transaction? Are locks taken in the `03 §6` order?
   Is `release()` called in `finally`?
6. **SQL safety**: Are all values `$n`? Do dynamic identifiers come only from whitelists?
7. **API compatibility**: Do envelopes, codes and DTO fields match `05-api.md`? Is `.strict()`
   on schemas?
8. **Migrations**: Are already-applied migrations never edited? Does the down migration work?
9. **Secrets**: No `.env` staged. No hashes, tokens or secrets in logs or responses.
10. **Evidence**: Are the tests real-PG for permissions and concurrency? Are the results pasted
    below?

## Log

### 2026-10-23 — Spec review (before S0)

- Original plan reviewed. Changes C1–C16 recorded in `01-review.md` §3.
- Environment measured: PG 18.6 accepting connections; `npm test` 4/4 pass; Docker socket
  denied; ports 3000/4000 occupied by running dev servers; `neostat` / `neostat_test` databases
  do not exist; role `mrrobot` lacks CREATEDB.
- Open item: cross-check against the actual challenge brief (only the Guidelines were available).

### 2026-10-23 — Brief cross-check

- Read the full challenge PDF (5 pages). No behavior changes. Added R13 explainability and the
  live-event rules. Rate limit moved to P1. Team Members see all project tasks (participant
  decision).

### 2026-10-23 — S0 + S1 Database foundation

- S0: scaffold + specs pushed (`9a8b990`). Databases created from `template0` (template1 has a
  collation-version mismatch). Ports 3000/4000 free.
- S1 commands: `db:migrate` ✅ · `db:status` → applied · `db:seed` → 38 inserted, re-run → 0 ·
  `db:rollback` + `db:migrate` + `db:seed` ✅ · counts users 8 / projects 3 / members 10 / tasks 12 /
  comments 5 · `npm run check` → lint ✅ typecheck ✅ unit 4/4 ✅ builds ✅ · `GET /api/health` → 200.
- Known: the starter home page still calls the removed `/api/hello`; replaced in S4.

### 2026-10-23 — S2 Authentication and policy

- Session cookie `neostat.sid` (PG store), login regenerates the session and rotates the CSRF token,
  `loadActor` re-reads the user on every request, `auth_version` revocation, pure `policy.ts`.
- `npm run check` → lint ✅ typecheck ✅ unit 9/9 ✅ builds ✅ · `npm run test:integration` → 6/6 ✅
  (A1, A2, A3, A4, A5, A6, A7, A10). B18 partially covered by `tests/unit/policy.test.ts`.
- Deferred (P1): login rate limit (A8).

### 2026-10-23 — S3 Domain APIs

- Projects (CRUD, archive/restore, soft delete, manager replacement), members (add/role/remove with
  unassign + version bump, candidates, assignable filter), tasks (scoped list with filters, sort
  whitelist, pagination; version-conditioned PATCH/DELETE), comments, users (admin guards), dashboard.
- `npm run test:integration` → **30/30 ✅** covering A1–A7, A10, B1–B16, C1–C19, D1–D7, E1–E9, E12.
- Spec fix: `03 §6/§7` lock order now project → membership → task (matches code; deadlock-free
  because bulk writers take the project row FOR UPDATE first).

### 2026-10-23 — S4 + S5 Frontend

- shadcn/ui (radix-nova) with spec tokens; system font (removed Google-fonts Geist: offline build
  failed fetching it). Pages: login, dashboard, projects, project overview/tasks/team, my tasks,
  task detail + comments, users, profile. Conflict dialog with Reload latest (confirmed) /
  Re-apply my changes / Copy my changes; delete-conflict re-confirm; lost-permission state.
- `npm run check` ✅ (lint, typecheck, unit 9/9, both builds) · `npm run test:integration` → 30/30 ✅.
- Browser (Playwright + system Chromium): admin dashboard/projects/tasks/users render; two-context
  conflict → dialog → re-apply → save ✅; viewer read-only, no comment box ✅; 390px width no page
  overflow ✅. `npm run test:e2e` → **2/2 ✅** (D8, D10). Console: only expected 401 (pre-login
  `/auth/me`) and the intentional 409.
- Deferred P1: per-field Latest/Mine picker (T5.8).

### 2026-10-23 — S6 + S7 Verification and submission

- README rewritten (setup, env, demo accounts, conflict demo, architecture note, matrix, test
  results, limitations, AI note, troubleshooting). `specs/11-explain.md` completed with file:line refs.
- Fresh-DB check: rollback → migrate → seed → seed (0 inserted) ✅ on `neostat`; integration suite
  resets `neostat_test` from scratch per test file ✅.
- Remaining manual checks for the participant: full keyboard pass (F3) and the F1 demo script.
- Open P1: login rate limit (A8), per-field conflict picker (T5.8).

### 2026-10-23 — P1 follow-ups

- Spec first: `05-api.md` gained `POST /profile/password` and the injectable `loginAttemptLimit`.
- Login rate limit (A8): `express-rate-limit`, failed attempts only, 429 `RATE_LIMITED`. Test A8 uses an
  app with limit 3 → 2 logins ✅, 3 wrong passwords → 401, next attempt → 429.
- Password change: wrong current password → 400 `fieldErrors.currentPassword`; same, short or extra-field
  bodies → 400; success → 204, other sessions 401, calling session stays valid, old password rejected.
- 30 s polling on dashboard, project, task and comment lists and members (`refetchInterval`).
- Per-field Latest/Mine picker (T5.8) in the conflict dialog; e2e `T5.8` passes.
- ROLE_CONFLICT UI: already present (`ConflictMessage` lists and links the blocking projects); recorded
  as done, no code change.
- Commands: `npm run check` ✅ · `npm run test:integration` → **32 pass / 0 fail**.
- `npm run test:e2e` → 2 pass (D8/D10, T5.8), 1 fail: "Viewers get a read-only task". Cause: the
  development database has no `VIEWER` membership for `viewer@neostat.test` in Website Redesign (seed
  fixture `fixtures.ts:33`; the dev DB only has Mobile App Launch), so the task returns 404. Not caused by
  these changes; dev data left untouched.
- Still open: T6.2 and T6.3 (manual checks by the participant), README screenshots.

### 2026-10-23 — S9 Task activity history

- Spec first: `04 §2a` (table + rules), `05` (`GET /tasks/:id/activity`, `TaskActivity`), `08` E13–E16.
- Migration `1761300000000_task-activity.sql` applied to `neostat` (additive). History rows are written in
  the same transaction as the task change: `createTask` (CREATED v1), `updateTask` (only fields that really
  changed; a no-op PATCH writes nothing) and `unassignTasks` (member removed or user deactivated).
- Integration (`tests/integration/activity.test.ts`): E13 create/update/no-op, cleared values, E14
  reassign + remove-member and deactivate-user cleanups with name snapshots and matching versions, E15
  visibility (non-member 404, unknown 404, bad id 400, viewer 200), E16 409/403 leave no row, cascade on
  task delete.
- Client: `History` panel on `/tasks/[id]`, `useTaskActivity`, "activity" added to the invalidation
  families. e2e `history.spec.ts` passes and restores the seeded title; it uses its own task because
  Playwright runs spec files in parallel and the demo task is used for conflicts.
- Commands: `npm run check` ✅ · `npm test` 9/9 · `npm run test:integration` → **39 pass / 0 fail** ·
  `playwright test` → 3 pass, 1 fail (viewer read-only, dev-DB drift described above).
- Note for the participant: a production `npm run start` from a VS Code terminal was already serving
  :3000/:4000 and was left running. It serves the build from before S9, so rebuild and restart it
  (`npm run build && npm run start`, after `npm run db:migrate`) to see History. E2E here ran against a
  separate API (:4100) and client (:3001).

<!-- Template for next entries:
### YYYY-MM-DD HH:MM — S<n> <name>
- Commit: <sha>
- Commands: `npm run check` → … ; `npm run test:integration` → N pass / M fail
- Acceptance rows covered: A1–A8, …
- Findings: … (fixed in <sha> / deferred with reason)
-->
