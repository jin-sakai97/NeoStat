# 00 — NeoStat master plan (revised)

Revision of the original ChatGPT plan. Every change is listed in `01-review.md` with its reason.
Details live in the numbered documents; this file is the overview a newcomer reads first.

## 1. Goal

Build a **local, multi-user project-management web app**: projects, team membership, tasks and
comments, with four account roles. Two things matter most:

1. **Server-enforced authorization.** The UI only *hides* buttons. The API *decides*.
2. **No lost updates.** If two people edit the same task, the second save fails with a clear
   conflict instead of silently overwriting the first.

Delivery: a **3-hour P0 core**, then P1 extras if time allows. P2 items are roadmap only.

## 2. Confirmed decisions

| Area | Decision |
| --- | --- |
| Delivery | 3-hour P0 core → P1 → P2 roadmap |
| Database | Local PostgreSQL 18 (`neostat`; tests use `neostat_test`) |
| Frontend | Existing Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 (`client/`) |
| Backend | Existing Express 5 + TypeScript (`server/`), separate process on port 4000 |
| DB access | `pg` with parameterized SQL; hand-written repositories; no ORM |
| Migrations | node-pg-migrate with **SQL migration files** |
| Auth | Email + password, scrypt hashes, `express-session` + `connect-pg-simple` cookie sessions |
| Roles | 4 account roles (ceiling) × 3 project roles (scope) |
| Visibility | Non-Admins see only projects they belong to; within those, all tasks |
| Member editing | Title, description and status of tasks **assigned to them** |
| Project lifecycle | Archive/restore (Admin) + soft delete (Admin) |
| Manager | Exactly one per project; only Admin appoints or replaces |
| Comments | Writable roles create; author, project manager or Admin deletes; no editing |
| Accounts | Admin-created and seeded; no public signup |
| Membership cleanup | Removing a member, downgrading to Viewer or deactivating a user unassigns their tasks atomically and bumps those tasks' versions |
| Concurrency | Optimistic: every task mutation sends `version`; stale → 409 with the latest task |
| Transactions | READ COMMITTED + row locks in a fixed global order (`03-permissions.md` §6) |
| UI | Plane-inspired, light, dense tables; shadcn/ui + Lucide + TanStack Query + RHF + Zod |
| MongoDB | Removed from the code. The running instance and its data are left untouched |

## 3. Architecture in one picture

```text
 Browser (localhost:3000)                    Express API (localhost:4000/api)            PostgreSQL
 ┌──────────────────────────┐   fetch,        ┌───────────────────────────────────┐      ┌──────────┐
 │ Next.js App Router pages │ credentials:    │ helmet → cors(exact origin)       │      │ users    │
 │ TanStack Query cache     │ "include",      │ → json(100kb) → session(PG store) │ pg   │ projects │
 │ RHF + Zod forms          │ X-CSRF-Token ──►│ → origin+csrf check → loadActor   │─────►│ members  │
 │ shadcn/ui components     │◄── JSON ────────│ → route → zod validate            │ Pool │ tasks    │
 │ (no secrets, no DB)      │  {data}/{error} │ → service (tx, locks, rules)      │      │ comments │
 └──────────────────────────┘                 │ → repository (parameterized SQL)  │      │ sessions │
                                              └───────────────────────────────────┘      └──────────┘
```

- Next.js only presents. It never reads the database or the session.
- Express owns authentication, validation, permissions, business rules and persistence.
- Layering: **routes → middleware → services → repositories**. There is no DI framework and no
  generic repository base class.
- Every statement in a transaction uses the **same checked-out client** (`withTransaction(fn)`).
- Dynamic `ORDER BY` columns come from a fixed whitelist map. All values are `$n` parameters.

Full tree and responsibilities: `09-architecture.md`.

## 4. Roles at a glance

Account roles: `ADMIN`, `PROJECT_MANAGER`, `TEAM_MEMBER`, `VIEWER`.
Project roles: `PROJECT_MANAGER`, `TEAM_MEMBER`, `VIEWER`.

- **Admin**: can do everything everywhere and needs no membership. Cannot see soft-deleted
  projects.
- **Designated manager** (one per project): edits project details, manages the team (not the
  manager slot), creates, edits, assigns and deletes tasks, and moderates comments.
- **Project Team Member**: reads everything in the project, edits title, description and status
  of tasks assigned to them, and comments.
- **Project Viewer**: read-only.

Full matrix, ceilings and lifecycle: `03-permissions.md`.

## 5. Data at a glance

`users`, `projects`, `project_members` (PK `project_id, user_id`), `tasks` (with `version`),
`comments`, `user_sessions`. A partial unique index keeps one manager per project. A composite FK
`tasks(project_id, assignee_id) → project_members` means an assignee is always a member.
Exact DDL: `04-data-model.md`.

## 6. Concurrency in one paragraph

Each task has `version` (starting at 1). Clients send the version they last saw with every
mutation (edit, status change, reassignment, delete). The server runs
`UPDATE tasks SET …, version = version + 1 WHERE id = $1 AND version = $2 RETURNING *`. If no row
comes back and the task still exists and is visible, the response is **409
TASK_VERSION_CONFLICT** with the full current task. The UI keeps the user's draft and shows
Latest vs Mine. Nothing is ever force-saved or silently retried. Cleanup operations (unassignment)
also bump `version`, so tabs left open become stale correctly.

## 7. Schedule (3 hours after the environment gate)

| Slice | Minutes | Deliverable | P0 cut line inside the slice |
| --- | --: | --- | --- |
| S0 | before timer | Environment gate: DBs created, ports free, deps installed | — |
| S1 | 0–25 | PG pool, migration, seed, env examples, `/health` | Must be complete |
| S2 | 25–50 | Sessions, login/logout/me, CSRF + Origin, `loadActor`, permission policy module, rate limit | Must be complete |
| S3 | 50–85 | Projects, members, tasks, comments, users APIs with version checks; first integration tests | All endpoints in `05-api.md` marked P0 |
| S4 | 85–125 | App shell, login, dashboard, projects list/overview, task table, task detail | Polish is cuttable; flows are not |
| **M** | **125** | **Milestone: login + projects + tasks + role permissions demoable end-to-end and pushed** | — |
| S5 | 125–150 | Team and user admin dialogs, lifecycle actions, comments UI, conflict dialog | Per-field picker is P1 |
| S6 | 150–175 | Full permission-matrix and concurrency integration tests, manual two-browser demo, fixes | Playwright is P1 |
| S7 | 175–180 | README, architecture note, `npm run check`, commit and push, verify remote | Must be complete |

**Commit and push after every slice that passes its checks.** If time runs short, cut in this
order: visual polish → P1 items → dashboard extras. **Never cut** auth, server permission
checks, version checks or README demo credentials.

Detailed checklist: `07-tasks.md`.

## 8. Commands (final)

```bash
npm run setup            # copy .env.example → .env (keeps existing), generate SESSION_SECRET
npm run db:up            # optional Docker PG (other machines only)
npm run db:migrate       # apply SQL migrations to DATABASE_URL
npm run db:status        # list applied/pending migrations
npm run db:rollback      # roll back the last migration
npm run db:seed          # idempotent development fixtures
npm run dev              # client :3000 + API :4000
npm run check            # lint + typecheck + unit tests + production builds
npm run test:integration # real-PG API tests against TEST_DATABASE_URL (refuses non-_test DBs)
npm run test:e2e         # P1: Playwright two-context conflict demo
npm run build && npm start
```

Environment variables: `NEXT_PUBLIC_API_URL` (client) and `PORT`, `CLIENT_ORIGIN`,
`DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV` (server).

## 9. Demo accounts

All use the password **`NeoStatsDemo!2026`** (development only):

| Email | Account role | Notes |
| --- | --- | --- |
| admin@neostat.test | Admin | Primary demo admin |
| admin2@neostat.test | Admin | For last-admin / account tests |
| manager@neostat.test | Project Manager | Manages *Website Redesign* |
| manager2@neostat.test | Project Manager | Manages *Mobile App Launch* and the archived project |
| member@neostat.test | Team Member | In both active projects |
| member2@neostat.test | Team Member | In *Website Redesign* |
| viewer@neostat.test | Viewer | Viewer in *Website Redesign* |
| inactive@neostat.test | Team Member (inactive) | Login must fail with the generic message |

## 10. Reference products (inspiration only)

- **Plane** (github.com/makeplane/plane): navigation, dense task lists, task-detail layout.
  This is the primary visual reference.
- **PLANKA** (github.com/plankanban/planka): React + Node + PostgreSQL. Useful for separating
  projects, memberships and tasks.
- **Vikunja** (github.com/go-vikunja/vikunja): simple task editing, assignment and filtering.

Their permission models do **not** define ours. No source is imported.

## 11. Hackathon rules (brief received, event live)

- The database runs locally only. No Firebase, Supabase or other hosted backend.
- **The latest commit is evaluated.** Push after every green slice. After minute 150, never push
  a commit that fails `npm run check`.
- AI use is allowed, but every part must be explainable. Keep the code plain (`11-explain.md`,
  R13).

## 12. Extension roadmap (P2, after P0 acceptance passes)

1. Kanban board using the same versioned PATCH
2. Audit history (task, membership, lifecycle)
3. SSE/WebSocket change notifications
4. Saved filters and richer search
5. Labels, attachments, notifications
6. Invitations and password recovery
7. Restore and purge for soft-deleted projects
8. Multiple managers and custom project roles
9. Committed OpenAPI YAML and generated client types
10. Dark mode
