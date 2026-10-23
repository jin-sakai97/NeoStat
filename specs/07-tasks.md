# 07 — Implementation task list

Work top to bottom. Tick `[x]` as you go. Every slice ends with **checks → commit → push**.
`(Rxx)` links to requirements, `→ doc §` points to the governing spec. Times are budgets, not
promises. If a slice overruns, cut its *P1* items first.

Commit message format: `S<n>: <imperative summary>` + body bullets + the attribution trailer.

---

## S0 — Environment gate (before the timer)

- [x] **T0.1** Stop the old dev servers holding ports 3000 and 4000 (`ss -ltnp | grep -E ':(3000|4000)'`, then stop those `npm run dev` terminals).
- [x] **T0.2** Create the databases (the `mrrobot` role lacks CREATEDB). The participant runs:
      ```bash
      createdb -h localhost -U postgres -T template0 -O mrrobot neostat
      createdb -h localhost -U postgres -T template0 -O mrrobot neostat_test
      ```
      `-T template0` avoids the template1 collation-version error on this machine. Verify: `psql -h localhost -d neostat -c 'select 1'` and the same for `neostat_test`.
- [x] **T0.3** Decide how to connect: Unix socket peer auth (`postgresql:///neostat`) or TCP with a password. Verify that `psql "$DATABASE_URL" -c 'select 1'` works with the exact URL that goes into `.env`.
- [x] **T0.4** `npm test` passes (baseline 4/4 ✅ measured 2026-10-23).
- [x] **T0.5** Two browser sessions available (a normal and a private window).
- [x] **T0.6** `git push` works to `origin` (github.com/jin-sakai97/NeoStat). Repo visibility checked. Brief text is never committed.
- [x] **T0.7** Commit the existing scaffold as-is first (`S0: commit starter scaffold and specs`), after reviewing `git status` so that `.env` files are not staged.

## S1 — Database foundation (0–25 min) · R10

- [x] **T1.1** Server deps: `npm i -w server pg connect-pg-simple express-session express-rate-limit` and `npm i -D -w server node-pg-migrate @types/pg @types/express-session @types/connect-pg-simple`. Remove `mongoose migrate-mongo`.
- [x] **T1.2** Delete Mongo files: `server/src/models/`, `server/migrate-mongo-config.cjs`, `server/migrations/202610230001-initial-collections.cjs`, `server/dist/` (build output).
- [x] **T1.3** `server/src/config/env.ts`: `DATABASE_URL` (postgres URL), `TEST_DATABASE_URL` (optional), `SESSION_SECRET` (min 32 chars), keep `PORT`, `CLIENT_ORIGIN`, `NODE_ENV`. Never echo values.
- [x] **T1.4** `server/.env.example` and `client/.env.example` with all variables (`00-plan` §8). `scripts/setup.mjs`: when it creates `server/.env`, replace the `SESSION_SECRET=` placeholder with `crypto.randomBytes(32).toString('base64url')`. Keep existing files untouched and never print the secret.
- [x] **T1.5** `server/src/db/pool.ts`: `pg.Pool`, `withTransaction<T>(fn: (c: PoolClient) => Promise<T>)` (BEGIN/COMMIT/ROLLBACK, always `release()`), and a `ping()` helper.
- [x] **T1.6** Migration file exactly as in `→ 04 §2`. Scripts: `db:migrate` = `node-pg-migrate up -m migrations --migration-file-language sql`, `db:rollback` = `down`, and `db:status` (list via `node-pg-migrate` dry-run or a small script that reads the `pgmigrations` table). Make sure node-pg-migrate reads `DATABASE_URL` from `server/.env` (dotenv-cli or `--envPath .env`).
- [x] **T1.7** `server/src/db/fixtures.ts` + `seed.ts` per `→ 04 §4`. Idempotent and production-guarded.
- [x] **T1.8** `GET /api/health` uses `ping()`. Remove `/api/hello`. Update the existing unit tests accordingly.
- [x] **T1.9** Root `package.json`: `db:up` → `docker compose up -d --wait postgres`. `compose.yaml` → `postgres:18`, `127.0.0.1:5432:5432`, volume `pg-data`, env `POSTGRES_DB=neostat`, healthcheck `pg_isready`.
- **Checks:** `npm run db:migrate && npm run db:seed && npm run db:seed` (second run inserts 0). `npm run db:rollback && npm run db:migrate` works. `psql -d neostat -c '\dt'` shows 6 tables (+ `pgmigrations`). `npm run check` passes.
- **Commit:** `S1: replace MongoDB with PostgreSQL schema, migrations and seed`

## S2 — Authentication and policy (25–50 min) · R01 R02

- [x] **T2.1** `http/errors.ts`: `AppError(status, code, message, {fieldErrors?, details?})`, plus an error handler mapping per `→ 05 §4` (including `entity.parse.failed` → INVALID_JSON, `entity.too.large` → 413, pg `ECONNREFUSED`/`57P01` → 503, `23505` → 409).
- [x] **T2.2** `http/validate.ts` with Zod 4 `z.strictObject` and `z.flattenError` → `fieldErrors`.
- [x] **T2.3** `domain/passwords.ts`: async scrypt hash and verify with the format in `→ 09 §4`. Unit test: verify the right password, reject the wrong one, check the hash format.
- [x] **T2.4** `http/session.ts`: config exactly per `→ 05 §1`. `app.set('trust proxy', false)`.
- [x] **T2.5** `http/csrf.ts`: Origin check plus a constant-time token comparison on non-GET methods.
- [x] **T2.6** `routes/auth.routes.ts`: `/auth/csrf`, `/auth/login` (generic failure; rate limit is P1, `regenerate`, rotate token), `/auth/me`, `/auth/logout`.
- [x] **T2.7** `http/actor.ts` `loadActor`: 401 rules (`→ 05 §1`). Also add `Cache-Control: no-store` middleware.
- [x] **T2.8** `domain/policy.ts` per `→ 03 §2`, plus `projectCapabilities()` and `taskCapabilities()`. **Unit tests** cover every row of the `03 §3` matrix as pure-function cases.
- [x] **T2.9** `PATCH /profile`.
- [x] **T2.10** Integration test helpers (`tests/integration/helpers.ts`): refuse to run unless the DB name ends in `_test`. Reset the schema, migrate, seed. `loginAs(email)` returns a Supertest agent holding cookie and CSRF token. Script: `test:integration` = `node --import tsx --test --test-concurrency=1 tests/integration/*.test.ts` with `NODE_ENV=test`.
- [x] **T2.11** `auth.test.ts`: every active seeded role logs in. Inactive or wrong password gives the identical 401 body. Missing CSRF → 403. Foreign Origin → 403. Logout → `/auth/me` 401. Bumping `auth_version` in SQL → 401.
- **Checks:** `npm run check`, `npm run test:integration`.
- **Commit:** `S2: add session auth, CSRF protection and permission policy`

## S3 — Domain APIs (50–85 min) · R02–R09

Build in this order. Each service follows the lock order in `→ 03 §6`.

- [x] **T3.1** `repos/projects.repo.ts` with the scoped list query (`→ 04 §3`) and counts. `GET /projects`, `GET /projects/:id`, `POST /projects`, `PATCH /projects/:id`, archive, restore, `DELETE`.
- [x] **T3.2** Members: list (with `assignable`), candidates, add, change role, remove (unassign + version bump), and `PUT /manager`.
- [x] **T3.3** Tasks: `GET /tasks` (all filters, sort whitelist, scoped), `GET /tasks/:id`, `POST /projects/:id/tasks`, and `PATCH`/`DELETE` implementing the algorithm in `→ 03 §7` exactly.
- [x] **T3.4** Comments: list, create, delete.
- [x] **T3.5** Users (Admin): list, get, create, patch with all the guards (`→ 03 §5`).
- [x] **T3.6** `GET /dashboard`.
- [x] **T3.7** Integration tests: first-pass `tasks-concurrency.test.ts` (A1–A4 in `08`) and `permissions.test.ts` (scope 404s, member field rule, mixed-field 403).
- **Checks:** `npm run check`, `npm run test:integration`. Manually try one curl conflict sequence.
- **Commit:** `S3: add projects, members, tasks, comments, users and dashboard APIs`

## S4 — Frontend core (85–125 min) · R01 R11

- [x] **T4.1** Read `node_modules/next/dist/docs` for the App Router layout, `params` and `useSearchParams`. Run `npx shadcn@latest init` in `client/`, add the components from `→ 06 §2`, then run `npm run build -w client` **immediately** (Tailwind 4 risk, `01-review` §5).
- [x] **T4.2** Client deps: `@tanstack/react-query react-hook-form zod @hookform/resolvers lucide-react sonner`.
- [x] **T4.3** Tokens and fonts in `globals.css` (`→ 06 §1`). Remove the starter page content and Mongo wording.
- [x] **T4.4** `lib/api.ts` (credentials, CSRF header on non-GET, parse the envelope into `ApiError{status, code, message, fieldErrors, details}`), `lib/auth.tsx`, `lib/types.ts`, `lib/queries.ts`.
- [x] **T4.5** `providers.tsx`, `/` redirect, `/login` page (`→ 06 §4`).
- [x] **T4.6** `(app)/layout.tsx`: auth guard plus `AppShell` (sidebar, mobile top bar; the sheet is P1).
- [x] **T4.7** Shared components: PageHeader, badges, UserAvatar, DataTable, Pager, StateView, ConfirmDialog, ArchivedBanner.
- [x] **T4.8** `/dashboard`, `/projects`, the project layout with tabs, and the Overview page.
- [x] **T4.9** `/projects/:id/tasks` and `/tasks` using the shared `TaskTable` + filters synced to the URL. Inline status dropdown.
- [x] **T4.10** `/tasks/:id`: the TaskForm with dirty-only submit, the version label, and read-only rendering of non-editable fields.
- **Checks:** `npm run check`. Log in as each demo role in the browser and click through. No console errors.
- **Commit:** `S4: add app shell, auth flow, dashboard, projects and task pages`

## S5 — Management UI and conflicts (125–150 min) · R03–R08 R11

- [x] **T5.1** Task create/edit dialog and delete with version (delete-conflict flow).
- [x] **T5.2** ConflictDialog (`→ 06 §6`): Latest vs Mine, Reload latest (confirm if dirty), Re-apply my changes, Copy my changes, lost-permission state.
- [x] **T5.3** Comments: list with load-more, composer, delete with confirm.
- [x] **T5.4** Team page: add member, change role, remove (confirm text with the unassign count), change manager (Admin).
- [x] **T5.5** Project dialogs: new project (Admin), edit details, archive/restore/delete confirms.
- [x] **T5.6** `/users`: table, filters, create/edit dialog, deactivate/reactivate confirm, readable 409 messages.
- [x] **T5.7** `/profile`.
- [x] **T5.8** *(P1)* Per-field Latest/Mine picker: radios appear only for fields both people changed; Mine is the default. (Mobile nav sheet ✅ done.)
- **Checks:** `npm run check`. Run the two-browser conflict demo by hand (`08` §F1).
- **Commit:** `S5: add team, user admin, comments and conflict resolution UI`

## S6 — Verification (150–175 min) · all

- [x] **T6.1** Complete the integration suites so that every **P0** scenario in `08-acceptance.md` has a test or a manual check recorded.
- [ ] **T6.2** Manual run of the `08 §F` browser script (participant, before demo). Note the results in `10-verification-log.md`.
- [ ] **T6.3** Keyboard pass (manual, participant) — 390px mobile pass ✅ automated.
- [x] **T6.4** Fresh DB check: `DROP`/recreate `neostat_test` → migrate → seed twice → tests pass.
- [x] **T6.5** *(P1)* Playwright `conflict.spec.ts` with two contexts. *(P1)* Screenshots.
- [x] **T6.6** Fix everything found. Re-run all checks.
- [x] **T6.7** *(P1 follow-up)* Login rate limit (A8) in `routes/auth.routes.ts`, `POST /profile/password`, 30 s list polling in `lib/queries.ts`, password form on `/profile`.
- **Commit:** `S6: complete acceptance tests and fixes`

## S7 — Submission (175–180 min) · R12

- [x] **T7.1** Rewrite `README.md` with the sections listed in `00-plan` (prerequisites, PG options, setup commands, env table, demo accounts, two-browser conflict demo steps, role explanation and matrix, data model + concurrency explanation, test commands **with actual results**, known limitations / P2, architecture and AI-assistance note, troubleshooting for DB connection / port / CORS / cookie / session).
- [x] **T7.2** `npm run check && npm run test:integration` one final time. Paste the counts into the README.
- [x] **T7.3** `git status` review → commit `S7: finalize README and architecture note` → push → `git rev-parse HEAD` equals `git rev-parse origin/main`.

## S9 — Task activity history (P1 follow-up)

- [x] **T9.1** Spec: `04 §2a`, `05` endpoint and DTO, `08` E13–E16 (this section).
- [x] **T9.2** Migration `1761300000000_task-activity.sql`; `repos/activity.repo.ts` (`recordActivity`, `diffTask`, `listActivity`).
- [x] **T9.3** Record in `createTask`, `updateTask`, and `unassignTasks` (same transaction, after the task lock).
- [x] **T9.4** `GET /tasks/:id/activity` in `routes/tasks.routes.ts`.
- [x] **T9.5** Integration tests E13–E16; extend `resetDatabase` only if needed.
- [x] **T9.6** Client: `useTaskActivity`, "History" panel on `/tasks/[id]`, types.
- [x] **T9.7** Checks, verification log, README, commit `S9: add task activity history`, push.

## S10 — Kanban board (P1 follow-up)

- [x] **T10.1** Spec: `06 §4` board view, `08` F8/F9, `02` (this section).
- [x] **T10.2** `components/tasks/use-status-change.ts`: one hook for the versioned status PATCH and its 409/other-error toasts; use it in `InlineStatus` and the board.
- [x] **T10.3** `components/tasks/task-board.tsx`: columns, cards, native drag and drop, Move to menu, pending/dimmed state, 100-task note.
- [x] **T10.4** `task-table.tsx`: List | Board toggle (`?view=board`, project page only), hide Status filter and sort on the board.
- [x] **T10.5** e2e `board.spec.ts` (creates its own project and tasks through the API, so it does not depend on seed data).
- [x] **T10.6** Checks, verification log, README, commit `S10: add kanban board view`, push.

---

## Definition of done (whole project)

1. Every P0 row in `08-acceptance.md` is ✅ in `10-verification-log.md`.
2. `npm run check` and `npm run test:integration` pass on a fresh `neostat_test`.
3. A new clone can follow the README to a working demo using the listed credentials.
4. The participant can explain: the permission predicate (`03 §2`), the scoped project query
   (`04 §3`), the version-conditioned update (`03 §7`), the unassign cleanup transaction
   (`03 §5`) and the session lifecycle (`05 §1`).
