# 01 — Review of the original plan

Reviewer: Claude Code, 2026-10-23. Inputs: the ChatGPT plan ("NeoStats: implementation
specification and Claude Code handoff"), the *Guidelines & Prerequisites* PDF text, and the
repository at commit `d986205` plus its uncommitted working tree.

**Verdict:** the plan is strong on domain rules, security and the stale-update protection, which
is the hardest part. It needed priority tiers, a simpler concurrency mechanism, a few missing
endpoints and rules, and corrections to its environment claims. The revised plan is in
`00-plan.md`. Everything below has already been applied to the other spec files.

## 1. Brief cross-check (2026-10-23)

The full 5-page PDF (*Part 1 Challenge Brief* plus *Part 2 Guidelines*) was read and compared
with these specs. Keep the PDF itself out of the repository, because it is marked confidential.

| Brief item | Spec status |
| --- | --- |
| Admin: manage users, create/delete projects, assign PMs, view all projects | ✅ `03-permissions.md` |
| PM: manage assigned projects, add/remove members, task CRUD, assign, change status | ✅ |
| TM: view their projects, view assigned tasks, update their tasks, comment, change status | ✅ Sees all tasks in joined projects (participant's decision) and edits assigned ones |
| Viewer: read-only on projects and tasks | ✅ Scoped to joined projects, because the brief treats Viewer as a *project-level* role |
| CRUD: users (deactivate), projects (archive), members (add/remove/role), tasks, comments | ✅ |
| Concurrency: version 7→8, stale → 409, UI guides review | ✅ Exact match (`03 §7`, `06 §6`) |
| Data model hint: users, roles, projects, project_members, tasks, comments | ✅ Roles are CHECK-constrained text (explained in the README) |
| API: naming, HTTP semantics, validation, authz, errors, pagination, filtering | ✅ `05-api.md` |
| AI policy: explain all code; say which parts AI built and which decisions were your own; may be asked to modify, debug or extend live | ➕ Added R13 and `11-explain.md` |
| Local DB only (no BaaS); push regularly; **the latest commit is evaluated** | ➕ Added to `00-plan.md` §11 |
| Get the core flows (login, projects, tasks, permissions) working first, then polish | ➕ Milestone in `00-plan.md` §7 |
| Seed: a user per role + projects + tasks | ✅ `04 §4` |
| Tests for permissions and conflict detection | ✅ The P0 test focus |
| Architecture note: data model, authorization, concurrent updates | ✅ R12 |

Verdict: the specs match the brief. No behavior changes were needed. The login rate limit was
moved to P1 because the brief does not ask for it.

What the Guidelines *do* require has been checked and is covered:

| Guideline requirement | Covered by |
| --- | --- |
| Separate frontend and API processes; plan base URL, CORS, cookies | `00-plan.md` §Architecture, `05-api.md` §Connection |
| Server enforces validation and permissions | `03-permissions.md`, R02, R09 |
| Migrations reproducible from scratch with documented commands | R10, `04-data-model.md` |
| Seed script with sample users and data | `04-data-model.md` §Seed |
| `.env` ignored, `.env.example` committed, no secrets | `07-tasks.md` S1 |
| Meaningful status codes and clear UI messages | `05-api.md` §Errors, `06-design.md` §States |
| Commit early and often with clear messages | `07-tasks.md` (commit after every slice) |
| Tests for critical business logic | `08-acceptance.md` |
| README: setup, env vars, migrations, seed, start both, sample logins | R12, `07-tasks.md` S7 |
| Architecture note: choices, data model, security and integrity | R12, `09-architecture.md` |
| Two browser sessions as different users | Concurrent-edit demo, `08-acceptance.md` C-series |

## 2. Environment claims corrected

Measured on 2026-10-23:

| Plan claim | Actual | Consequence |
| --- | --- | --- |
| PostgreSQL 18.6 did not respond | `pg_isready` → **accepting connections** on `localhost:5432` | Local PG is the primary database option |
| `npm test` fails with `listen EPERM` | `npm test` → **4/4 pass** | No action; the earlier failure was a sandbox artifact |
| Docker socket denied | Still denied (`permission denied … docker.sock`) | Compose is optional for other machines only |
| Node 22+ | Node **v26.12.0**, npm 11.20 | Satisfies `engines: >=22`; `.nvmrc` stays `22` |
| — | DB role `mrrobot` exists **without CREATEDB**; no `neostat` / `neostat_test` databases exist | S0 must create them as the `postgres` superuser |
| — | `postgres` database shows a collation-version warning (glibc 2.43 → 2.44) | Harmless for new databases; ignore |
| — | Ports **3000 and 4000 are already in use** (a running `next-server` and node process) | Stop the old dev servers before S1 |
| — | MongoDB listening on `127.0.0.1:27017` | Leave it running and untouched |
| — | Next.js **16.4.2**, React 19.3, Express 5.3, Zod 4.6 | APIs differ from older docs; see §4 |

## 3. Changes to the plan, with reasons

| # | Original | Revised | Why |
| --- | --- | --- | --- |
| C1 | No must/should split; everything is "core" | **P0/P1/P2 tiers** on every requirement and task | A 3-hour build needs an explicit cut line, so cuts never land on auth, permissions or conflict protection |
| C2 | SERIALIZABLE transactions + up to 2 retries + 503 RETRY_LATER | **READ COMMITTED + row locks in a fixed global order** (`03-permissions.md` §Locking). Version check stays a conditional `UPDATE … WHERE version = $n` | Same guarantees for these invariants, no retry loop, easier to explain to judges, no false 503s in demos |
| C3 | Committed OpenAPI contract (P0) | `05-api.md` is the contract; TypeScript DTOs mirror it in `client/src/lib/types.ts`. OpenAPI YAML → **P2** | Writing OpenAPI by hand costs ~20 min and gets no extra credit under the guidelines |
| C4 | Per-field Latest/Mine merge UI (P0) | **P0:** conflict dialog shows Latest vs Mine for each changed field, with **Reload latest** or **Re-apply my changes**. **P1:** a per-field picker | Same safety (nothing is overwritten silently; the user decides explicitly) at about a third of the UI cost |
| C5 | Playwright suite (P0) | **P0:** Supertest integration tests against real PG, covering the permission matrix and concurrency. **P1:** one Playwright two-context conflict test. Manual two-browser demo is always required | The integration tests are what prove R02/R08; the browser run is about the demo |
| C6 | Assignee picker source unspecified | Added `GET /projects/:id/members?assignable=true` | Otherwise the UI cannot list eligible assignees |
| C7 | "Mixed allowed/forbidden fields → 403" left a question open: what if a forbidden field is sent unchanged? | **Any forbidden key present in the body → 403**, whatever its value. The client must send **only changed fields** | One deterministic rule that is easy to test |
| C8 | Seed accounts partially listed | Exact fixture table in `04-data-model.md` (8 accounts, 3 projects, 12 tasks) | Repeatable demos and tests |
| C9 | No database bootstrap step | S0 creates the `neostat` and `neostat_test` databases owned by `mrrobot` | The `mrrobot` role cannot create databases |
| C10 | Composite FK only | Composite FK kept **plus** service rule: Viewer members cannot be assignees. Downgrade to Viewer clears assignments explicitly | An FK cannot see roles |
| C11 | Migrations: "stable node-pg-migrate" | **SQL-file migrations** in node-pg-migrate (`-- Up Migration` / `-- Down Migration`) | Plain SQL: what you ship is exactly what you explain |
| C12 | Synchronizer CSRF token | Kept (P0), **plus** strict `Origin` check and JSON-only mutation bodies | Defense in depth; each part is about 15 lines |
| C13 | "Codex reviews" | Kept as an optional `AGENTS.md`; the review checklist lives in `10-verification-log.md` so any reviewer can use it | Works whether or not Codex is used |
| C14 | Framework versions not considered | `09-architecture.md` §Version notes: Next 16 (`proxy.ts`, not `middleware.ts`; read `node_modules/next/dist/docs`), Express 5 (async errors auto-forwarded), Zod 4 (`z.email()`, `z.uuid()`, `z.iso.date()`) | Prevents writing code against outdated APIs |
| C15 | Auth gating unspecified | Client-side guard in the `(app)` route-group layout using `GET /auth/me`. No server-side session reads in Next | The cookie belongs to the API; Next is presentation only |
| C16 | Dashboard/overdue time zone | Kept Asia/Kolkata and defined it in SQL: `due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date` | Deterministic |

## 4. Things that were good and are kept unchanged

- Account role as a ceiling plus project role for scope. 404 for out-of-scope, 403 for
  forbidden-but-visible.
- Exactly one manager per project (partial unique index), and only Admin replaces the manager.
- Archive vs soft-delete semantics.
- Atomic unassignment that bumps the version on membership removal or deactivation.
- Server-side cookie sessions in PG, `auth_version` invalidation, scrypt hashing.
- The version-conditioned `UPDATE`, a 409 response that carries the full current task, and the
  rule that authorization comes before conflict disclosure.
- The table-first, Plane-inspired UI. The reference projects are for inspiration only.

## 5. Residual risks

| Risk | Mitigation |
| --- | --- |
| 3 h is aggressive for this scope | P0 cut line; S4/S5 UI polish is the first thing cut |
| shadcn CLI and Tailwind 4 with the existing custom Turbopack CSS rule | S4 task T4.1 checks `npm run build` straight after `shadcn init`; fall back to hand-copied components |
| Brief may contradict assumptions | §1 action; ambiguity table in `02-requirements.md` is easy to revise |
| GitHub repo visibility unknown | Never commit the brief text; paraphrase only |
