# NeoStat — collaborative project management

A multi-user project-management platform built for the NeoStats Full Stack Engineering Hackathon.
Admins, project managers, team members and viewers work on projects, team membership, tasks and
comments. **Every permission is enforced by the API**, and **stale task updates are rejected with
HTTP 409** instead of silently overwriting newer work.

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + shadcn/ui · Express 5 API ·
PostgreSQL (raw SQL via `pg`) · node-pg-migrate · cookie sessions stored in PostgreSQL.

The full specification (requirements, permission matrix, data model, API contract, UI design,
acceptance tests) lives in [`specs/`](specs/README.md).

---

## Quick start

**Prerequisites:** Node.js 22+ (tested on 26), npm, Git, PostgreSQL 14+ running locally (tested on
18). Docker is optional.

```bash
npm ci
npm run setup          # creates client/.env and server/.env from the examples, generates SESSION_SECRET
```

### 1. Create the databases

Choose one option:

- **Local PostgreSQL (recommended):**
  ```bash
  createdb -h localhost -U postgres -O "$USER" neostat
  createdb -h localhost -U postgres -O "$USER" neostat_test   # used only by integration tests
  ```
  If `createdb` reports a *template1 collation version mismatch*, add `-T template0`.
  Then set `DATABASE_URL` and `TEST_DATABASE_URL` in `server/.env`, for example
  `postgresql://<your-user>@localhost:5432/neostat`.
- **Docker:** `npm run db:up` starts `postgres:18` on `127.0.0.1:5432` (user/password
  `postgres`/`postgres`, database `neostat`). The defaults in `server/.env.example` already match.
  Create the test database with
  `docker compose exec postgres createdb -U postgres neostat_test`.

### 2. Migrate, seed, run

```bash
npm run db:migrate     # create the schema
npm run db:seed        # demo users, projects, tasks, comments (safe to re-run)
npm run dev            # web on http://localhost:3000, API on http://localhost:4000/api
```

Open **http://localhost:3000** and sign in with a demo account below.

## Demo accounts

Every account uses the password **`NeoStatsDemo!2026`** (development seed only).

| Email | Account role | What to try |
| --- | --- | --- |
| `admin@neostat.test` | Admin | Users page, create projects, change a manager, archive/restore/delete |
| `admin2@neostat.test` | Admin | Second admin, for last-admin safeguards |
| `manager@neostat.test` | Project Manager | Manages **Website Redesign**; is only a *Viewer* in Mobile App Launch |
| `manager2@neostat.test` | Project Manager | Manages **Mobile App Launch** and the archived **Legacy CRM Migration** |
| `member@neostat.test` | Team Member | In both active projects; can edit title/description/status of own tasks |
| `member2@neostat.test` | Team Member | In Website Redesign and the archived project |
| `viewer@neostat.test` | Viewer | Read-only in Website Redesign |
| `inactive@neostat.test` | Team Member (deactivated) | Sign-in fails with the generic message |

## Two-browser conflict demo

1. Open a normal window and a private window.
2. Sign in as `manager@neostat.test` in one and `member@neostat.test` in the other.
3. In both, open **Website Redesign → Tasks → Concurrent editing demo**. Note the `v1` badge.
4. Change the title in both windows. Save in the manager's window first (it becomes `v2`).
5. Save in the member's window. The member sees **"This task was changed by someone else"**,
   comparing *Latest (v2)* with *Your change*. Nothing has been overwritten.
6. Choose **Reload latest** (asks before discarding) or **Re-apply my changes**, then **Save
   changes**.

The same protection applies to the status dropdown in task tables, to reassignment and to delete.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start web (3000) and API (4000) with reload |
| `npm run build` / `npm start` | Production build / run both built apps |
| `npm run check` | Lint + typecheck + unit tests + production builds |
| `npm run test:integration` | API tests against real PostgreSQL (`TEST_DATABASE_URL`, name must end in `_test`) |
| `npm run test:e2e` | Playwright two-browser conflict test (needs `npm run dev` running and a seeded DB) |
| `npm run db:migrate` / `db:rollback` / `db:status` | Apply / undo last / list migrations |
| `npm run db:seed` | Insert missing demo data; never overwrites existing rows |
| `npm run db:up` / `db:down` | Optional Docker PostgreSQL |

To reset demo data: `npm run db:rollback && npm run db:migrate && npm run db:seed`.

## Environment variables

| File | Variable | Example | Notes |
| --- | --- | --- | --- |
| `client/.env` | `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | Public, embedded at build time |
| `server/.env` | `PORT` | `4000` | |
| `server/.env` | `CLIENT_ORIGIN` | `http://localhost:3000` | Exact origin for CORS and the CSRF Origin check |
| `server/.env` | `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/neostat` | |
| `server/.env` | `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/neostat_test` | Integration tests **drop and recreate** this schema |
| `server/.env` | `SESSION_SECRET` | *(generated)* | ≥ 32 chars; `npm run setup` fills it |
| `server/.env` | `NODE_ENV` | `development` | `production` enables Secure cookies and disables the seed |

`.env` files are git-ignored; only `.env.example` files are committed.

---

## Architecture note

```text
Browser :3000 (Next.js, TanStack Query)  ──fetch, credentials + X-CSRF-Token──▶  Express :4000/api
                                                                                  helmet → CORS(exact origin) → JSON(100kb)
                                                                                  → session (PostgreSQL store) → CSRF check
                                                                                  → loadActor (fresh user from DB)
                                                                                  → route → Zod validation → service
                                                                                  → transaction + row locks → SQL repos → PostgreSQL
```

- **Next.js only presents.** It never reads the database or the session. All rules live in the
  Express API: routes → services (transactions, permissions, business rules) → repositories
  (parameterized SQL).
- **Why raw SQL:** the important logic (scoped queries, version-conditioned updates, row locks)
  is visible and explainable line by line. Dynamic `ORDER BY` and `SET` columns come only from
  whitelists.

### Data model

| Table | Key columns |
| --- | --- |
| `users` | `role` (ADMIN / PROJECT_MANAGER / TEAM_MEMBER / VIEWER), `is_active`, `auth_version`, unique lowercase `email`, scrypt `password_hash` |
| `projects` | `name`, `description`, `archived_at`, `deleted_at` (soft delete), `created_by` |
| `project_members` | PK `(project_id, user_id)`, `role` (PROJECT_MANAGER / TEAM_MEMBER / VIEWER); **partial unique index ⇒ at most one manager per project** |
| `tasks` | `status`, `priority`, `assignee_id`, `due_date`, **`version`**; FK `(project_id, assignee_id) → project_members` so an assignee is always a member |
| `comments` | `task_id` (cascade on task delete), `author_id`, `body` |
| `user_sessions` | connect-pg-simple session store |

Roles are CHECK-constrained text rather than a lookup table: there are four fixed roles, and their
behavior is code, not data. The schema is one SQL migration:
[`server/migrations/1761200000000_initial-schema.sql`](server/migrations/1761200000000_initial-schema.sql).

### Authorization

- **Account role = ceiling, project role = scope.** Admins see and manage every project. Everyone
  else needs a membership. A Project Manager *account* can be a Viewer in someone else's project.

  | Action | Admin | Project manager | Project team member | Project viewer |
  | --- | :-: | :-: | :-: | :-: |
  | View project, tasks, team, comments | ✅ all | ✅ | ✅ | ✅ |
  | Create / archive / restore / delete project, replace manager | ✅ | ❌ | ❌ | ❌ |
  | Edit project details, add/remove members, change member roles | ✅ | ✅ | ❌ | ❌ |
  | Create / delete / assign tasks, edit any field | ✅ | ✅ | ❌ | ❌ |
  | Edit title, description, status of a task **assigned to me** | ✅ | ✅ | ✅ | ❌ |
  | Comment; delete own comment | ✅ | ✅ | ✅ | ❌ |
  | Delete others' comments | ✅ | ✅ | ❌ | ❌ |
  | Manage user accounts | ✅ | ❌ | ❌ | ❌ |

- Outside your projects → **404** (existence isn't revealed). Visible but not allowed → **403**.
  Archived project writes → **409 `PROJECT_ARCHIVED`**.
- A task PATCH that contains *any* field you may not edit is rejected entirely.
- Lists, counts and the dashboard use the same scoped SQL as single-resource reads.
- Removing a member, downgrading them to Viewer, or deactivating a user **unassigns their tasks in
  the same transaction and bumps those tasks' versions**. Guards prevent removing a project's only
  manager, deactivating yourself, or removing the last active admin (row locks make this safe
  under concurrent requests).

### Concurrent updates

Every task has a `version`. Clients send it with every change, including status changes and
deletes, and the server runs
`UPDATE tasks SET …, version = version + 1 WHERE id = $1 AND version = $2`. If no row matches,
someone saved first: the API returns **409 `TASK_VERSION_CONFLICT`** with the latest task, and the
UI shows Latest vs Mine for review. Authorization is checked first, so a user who lost access gets
403/404, never the newer data. Details and code pointers: [`specs/11-explain.md`](specs/11-explain.md).

### Security summary

scrypt password hashing with constant-time comparison · HttpOnly SameSite=Lax session cookie
with server-side sessions · session ID regenerated at login · 8-hour absolute expiry ·
`auth_version` revokes sessions on role, email, password or activation changes · CSRF:
synchronizer token header plus exact Origin check · identical error for unknown, wrong-password
and inactive logins · Zod `strict` validation on every input · `Cache-Control: no-store` ·
generic 500 messages.

---

## Tests and results

| Suite | Command | Result (2026-10-23) |
| --- | --- | --- |
| Unit (policy matrix, password hashing, app errors/CORS) | `npm test` | **9 / 9 pass** |
| Integration (real PostgreSQL: auth, CSRF, permission matrix, lifecycle, concurrency, validation) | `npm run test:integration` | **30 / 30 pass** |
| Browser (two-context conflict flow, viewer read-only) | `npm run test:e2e` | **2 / 2 pass** |
| Lint + typecheck + production builds | `npm run check` | **pass** |

Highlights: two simultaneous same-version updates produce exactly one 200 and one 409; a
member's mixed allowed/forbidden PATCH changes nothing; out-of-scope task and comment IDs return
404; deactivation kills existing sessions and unassigns tasks everywhere; two admins demoting each
other in parallel leave exactly one admin.

## Known limitations and next steps

- No login rate limiting yet (planned: 10 failed attempts per IP per 15 minutes).
- The conflict dialog compares field by field but offers whole-draft actions (Reload or Re-apply);
  a per-field picker is planned.
- No real-time push: lists refresh on window focus, and conflicts are caught on save.
- Soft-deleted projects can't be restored from the UI. There are no invitations or
  password-reset emails (admins create accounts).
- Roadmap: Kanban view (same versioned PATCH), audit history, SSE notifications, labels,
  multiple managers. See [`specs/00-plan.md`](specs/00-plan.md) §12.

## AI assistance

> **Participant: review and personalize this section before submission.** The brief requires
> stating which parts AI helped build and which decisions were yours.

- **Planning:** a first plan was drafted with ChatGPT. Claude Code reviewed it against the brief
  and turned it into the specification in `specs/` (changes and reasons in `specs/01-review.md`).
- **Decisions made by the participant during the session:** spec-driven workflow; PostgreSQL
  instead of the MongoDB starter; Team Members see all tasks in their projects (the brief says
  "view assigned tasks"); building during the live 3-hour window; Next.js + Express separation.
- **Implementation:** code was generated with Claude Code (Claude Opus) slice by slice (S1–S7 in
  `specs/07-tasks.md`), each slice verified by lint, typecheck and real-database tests before
  being committed.
- **Understanding the code:** `specs/11-explain.md` walks through the permission predicate, scoped
  SQL, version-conditioned update, cleanup transaction and session lifecycle, with file and line
  references.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `API startup failed. Check DATABASE_URL…` | PostgreSQL isn't running, or the URL/database is wrong. Test with `psql "$DATABASE_URL" -c 'select 1'`, then run `npm run db:migrate` |
| `relation "users" does not exist` | Run `npm run db:migrate` |
| `template database "template1" has a collation version mismatch` | Create the DB with `createdb -T template0 …` |
| Login works but every request is 401 / you bounce back to login | Use **`localhost`** (not `127.0.0.1`) for both apps so the cookie is sent; check `CLIENT_ORIGIN` matches the browser URL exactly |
| `CORS` errors in the browser console | `CLIENT_ORIGIN` must equal the web origin exactly (scheme, host, port; no trailing slash); restart the API |
| 403 `CSRF_FAILED` | Reload the page (the token is re-fetched); make sure requests come from `CLIENT_ORIGIN` |
| `EADDRINUSE` on 3000/4000 | Another dev server is running: `ss -ltnp \| grep -E ':(3000\|4000)'` and stop it |
| Integration tests refuse to run | `TEST_DATABASE_URL` must point to a database whose name ends in `_test` |
| `next build` fails fetching fonts | The app uses the system font stack and needs no network; remove any `next/font/google` import |
