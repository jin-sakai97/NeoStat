# 09 — Architecture and final repository shape

This is how the repository must look when P0 is complete. Files marked *(P1)* are optional.

## 1. Final tree

```text
neostat/
├── CLAUDE.md                    Claude Code instructions → specs/
├── AGENTS.md                    Reviewer (Codex) checklist → specs/
├── README.md                    Setup, commands, demo accounts, architecture note, test results
├── package.json                 Workspaces + root scripts (see 00-plan §8)
├── compose.yaml                 Optional postgres:18 service, 127.0.0.1:5432, named volume
├── scripts/setup.mjs            Copies .env.example → .env (keeps existing), fills SESSION_SECRET
├── specs/                       This specification
├── client/
│   ├── AGENTS.md                Generated Next.js rules (keep)
│   ├── .env.example             NEXT_PUBLIC_API_URL=http://localhost:4000/api
│   ├── components.json          shadcn config
│   └── src/
│       ├── app/
│       │   ├── layout.tsx               <html>, fonts, <Providers>
│       │   ├── providers.tsx            QueryClientProvider, AuthProvider, Toaster
│       │   ├── globals.css              Tailwind + tokens (06-design §1)
│       │   ├── page.tsx                 / → redirect
│       │   ├── login/page.tsx
│       │   └── (app)/
│       │       ├── layout.tsx           Auth guard + AppShell
│       │       ├── dashboard/page.tsx
│       │       ├── projects/page.tsx
│       │       ├── projects/[id]/layout.tsx      Project header + tabs
│       │       ├── projects/[id]/page.tsx        Overview
│       │       ├── projects/[id]/tasks/page.tsx
│       │       ├── projects/[id]/team/page.tsx
│       │       ├── tasks/page.tsx                My Tasks
│       │       ├── tasks/[id]/page.tsx
│       │       ├── users/page.tsx
│       │       └── profile/page.tsx
│       ├── components/
│       │   ├── ui/                      shadcn generated primitives
│       │   ├── app-shell.tsx  page-header.tsx  state-view.tsx  data-table.tsx  pager.tsx
│       │   ├── badges.tsx  user-avatar.tsx  confirm-dialog.tsx  archived-banner.tsx
│       │   ├── tasks/  task-table.tsx  task-filters.tsx  task-form.tsx  task-dialog.tsx
│       │   │           conflict-dialog.tsx  comment-list.tsx  comment-composer.tsx
│       │   ├── projects/ project-table.tsx  project-dialog.tsx  manager-dialog.tsx
│       │   │             member-table.tsx  add-member-dialog.tsx
│       │   └── users/  user-table.tsx  user-dialog.tsx
│       └── lib/
│           ├── api.ts           fetch wrapper: base URL, credentials, CSRF header, ApiError
│           ├── auth.tsx         AuthProvider: me/login/logout, csrfToken in memory
│           ├── types.ts         DTOs from 05-api §5
│           ├── queries.ts       query-key factory + useX hooks
│           ├── schemas.ts       client Zod form schemas (mirror server limits)
│           └── format.ts        dates (relative, due), initials, role labels
└── server/
    ├── .env.example
    ├── migrations/1761200000000_initial-schema.sql
    ├── src/
    │   ├── index.ts             start: pool check → listen; graceful shutdown (pool.end)
    │   ├── app.ts               createApp({pool, sessionStore?, clientOrigin, …})
    │   ├── config/env.ts        Zod-validated env (DATABASE_URL, SESSION_SECRET ≥ 32 chars …)
    │   ├── db/
    │   │   ├── pool.ts          pg.Pool, withTransaction(fn), query helpers
    │   │   ├── errors.ts        pg error code → AppError mapping
    │   │   ├── fixtures.ts      fixed IDs + seed data (04-data-model §4)
    │   │   └── seed.ts          idempotent seed CLI
    │   ├── http/
    │   │   ├── errors.ts        AppError class, error codes, error handler
    │   │   ├── schemas.ts       all request Zod schemas
    │   │   ├── validate.ts      parse(schema, req.body|query|params) → 400 envelope
    │   │   ├── session.ts       express-session + connect-pg-simple config
    │   │   ├── csrf.ts          origin check + token check
    │   │   ├── actor.ts         loadActor middleware
    │   │   └── pagination.ts
    │   ├── domain/
    │   │   ├── policy.ts        effectiveRole, canManage, editableTaskFields, capabilities (pure)
    │   │   ├── passwords.ts     scrypt hash/verify
    │   │   ├── auth.service.ts
    │   │   ├── users.service.ts
    │   │   ├── projects.service.ts
    │   │   ├── members.service.ts
    │   │   ├── tasks.service.ts
    │   │   ├── comments.service.ts
    │   │   └── dashboard.service.ts
    │   ├── repos/               SQL only; snake_case ↔ DTO mapping
    │   │   ├── users.repo.ts  projects.repo.ts  members.repo.ts  tasks.repo.ts  comments.repo.ts
    │   └── routes/
    │       ├── auth.routes.ts  users.routes.ts  projects.routes.ts  members.routes.ts
    │       ├── tasks.routes.ts  comments.routes.ts  dashboard.routes.ts  health.routes.ts
    └── tests/
        ├── unit/policy.test.ts  unit/passwords.test.ts  unit/app.test.ts (no DB)
        └── integration/
            ├── helpers.ts          test DB guard (*_test), reset+migrate+seed, login agents
            ├── auth.test.ts  permissions.test.ts  tasks-concurrency.test.ts
            ├── lifecycle.test.ts  users.test.ts  contracts.test.ts
    e2e/ (P1)  playwright.config.ts, conflict.spec.ts  (at repo root or client/)
```

Removed in S1: `server/src/models/*`, `server/migrate-mongo-config.cjs`, the Mongo migration,
`mongoose` and `migrate-mongo` dependencies, and Mongo wording in the UI, README and env files.

## 2. Request lifecycle

```text
helmet → cors({origin, credentials}) → express.json({limit:"100kb"}) → no-store header
→ session (PG store) → csrf (non-GET) → [public routes] → loadActor → router
   router: validate(params/query/body) → service(actor, input)
      service: withTransaction(client → lock rows per 03 §6 → fresh reads → policy checks → repo writes)
      → DTO → res.status(…).json({data})
→ 404 handler → error handler (AppError → envelope; ZodError → 400; pg codes → 409/400/503; else 500)
```

Express 5 forwards rejected promises from async handlers to the error handler automatically.
Do **not** add express-async-handler.

## 3. Module rules

- **routes** do HTTP only: params, status codes, envelopes. No SQL.
- **services** own transactions, locking, policy calls and business rules. They take an `Actor`
  and plain input objects and return DTOs or throw `AppError`.
- **repos** are SQL functions that take a `PoolClient` or `Pool`. Only parameterized queries.
  Column whitelists for dynamic `SET` and `ORDER BY`.
- **policy.ts** is pure, with no I/O, so it is unit-tested exhaustively. Capabilities in DTOs
  come from it.
- No module imports from `routes/` except `app.ts`.

## 4. Security summary (for the README architecture note)

| Concern | Control |
| --- | --- |
| Password storage | scrypt (N=16384, r=8, p=1, 16-byte salt, 64-byte key), format `scrypt$16384$8$1$<salt b64>$<hash b64>`, `timingSafeEqual` |
| Session theft or fixation | HttpOnly cookie with an opaque ID only. Regenerate on login. 8 h absolute expiry. `auth_version` revocation |
| CSRF | SameSite=Lax + exact Origin check + synchronizer token header |
| Broken access control | Server-side policy on every route. 404 for out-of-scope. Field-level 403. Capabilities are only hints |
| Injection | Parameterized SQL. Whitelisted identifiers. React escaping. Plain-text bodies |
| Lost updates | Version-conditioned UPDATE/DELETE → 409 |
| Integrity | FKs, CHECKs, a partial unique index, transactions with ordered row locks |
| Brute force | Login rate limit, generic login error |
| Information leakage | Generic 500 messages. Hashes and tokens never serialized or logged |
| Secrets | `.env` ignored. `SESSION_SECRET` generated by setup and never printed |

## 5. Version notes (read before coding)

- **Next.js 16.4**: read `client/node_modules/next/dist/docs/` (or the root `node_modules`) for
  any API you use. `middleware.ts` is now `proxy.ts`, but we don't need it (the auth guard is
  client-side). `params` in pages and layouts is a Promise: use `use(params)` in client
  components or `await params` in server components. Check the installed docs for `useParams`
  and `useSearchParams` usage (`useSearchParams` needs a `<Suspense>` boundary).
- **React 19.3**: `use()` is available. Do not use `forwardRef` in new components (ref is a prop).
- **Tailwind 4**: CSS-first config (`@theme` in `globals.css`), no `tailwind.config.js`. Keep the
  existing `@tailwindcss/turbopack` rule in `next.config.ts` unless shadcn init requires PostCSS.
  If so, switch to `@tailwindcss/postcss` and verify `npm run build`.
- **Express 5.3**: async errors auto-forward. `req.query` is a getter (read-only), so parse it
  into a new object. Path syntax changed (`/*splat`).
- **Zod 4.6**: `z.email()`, `z.uuid()`, `z.iso.date()`, `z.strictObject()`. Error formatting via
  `z.flattenError(err).fieldErrors`.
- **node-pg-migrate**: SQL migrations with `-- Up Migration` / `-- Down Migration`. Set
  `--migrations-dir migrations` and `DATABASE_URL`.
- **connect-pg-simple**: pass `{ pool, tableName: "user_sessions", createTableIfMissing: false }`.
