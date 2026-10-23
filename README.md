# NeoStat — MERN hackathon starter

Prepared from the **Full Stack Engineering Hackathon: Guidelines & Prerequisites** PDF. The PDF provides setup guidance, not the application challenge. This repository is a runnable starting point; authentication and domain features await the challenge brief.

Uses **MongoDB + Express + React (Next.js App Router) + Node.js**, with TypeScript and Tailwind CSS. The PDF prefers PostgreSQL but explicitly accepts other databases; MongoDB follows the requested MERN stack. The React frontend and Express backend run as separate processes.

## Quick start

Requires Node.js **22+**, npm, Git, and a running MongoDB instance. Docker is optional.

```bash
npm ci
npm run setup
```

`setup` copies the environment examples and preserves any existing `.env` files.

Choose one database option:

- **Existing local MongoDB:** leave `MONGODB_URI=mongodb://127.0.0.1:27017/neostat` in `server/.env`. On the machine where this project was prepared, MongoDB was already running on port 27017.
- **Docker:** run `npm run db:up`. Do this only if another MongoDB instance is not already using port 27017. The development container binds only to the local machine and keeps data in a named volume.
- **Hosted MongoDB:** put your connection string, including the database name, in `server/.env`. Configure database credentials and network access in your provider.

Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. The page calls the Express server at **http://localhost:4000/api** and shows the API/database connection result. Use **Check again** to retry after a connection failure.

## Commands

Run commands from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start both servers with automatic reload |
| `npm run dev:client` / `npm run dev:server` | Start either server separately |
| `npm run build` | Build both applications |
| `npm start` | Run both built applications; build first |
| `npm run check` | Lint, typecheck, API tests, and production builds |
| `npm test` | API behavior tests; no database required |
| `npm run db:up` / `npm run db:down` | Start/stop the optional Docker database; retain its volume |
| `npm run db:migrate` | Apply pending database migrations |
| `npm run db:status` | List migration status |
| `npm run db:rollback` | Roll back the last migration |
| `npm run db:seed` | Insert sample profiles and notes without replacing existing records |

## Environment variables

| File | Variable | Default/example |
| --- | --- | --- |
| `client/.env` | `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` |
| `server/.env` | `PORT` | `4000` |
| `server/.env` | `CLIENT_ORIGIN` | `http://localhost:3000` |
| `server/.env` | `MONGODB_URI` | `mongodb://127.0.0.1:27017/neostat` |
| `server/.env` | `NODE_ENV` | `development` (`test` / `production` also accepted) |

`NEXT_PUBLIC_*` values are public browser configuration and are embedded at build time. Never put credentials there. Restart development servers after changing environment files; rebuild the frontend when changing its production API URL. CORS expects the exact frontend origin (scheme, host, and port; no trailing slash). If Next.js uses a different port, update `CLIENT_ORIGIN`.

Secrets stay in ignored `.env` files; only `.env.example` files are committed. For production, set `NODE_ENV=production` for the backend and provide a secured MongoDB connection. The Compose file is intended for local development.

## Structure

```text
client/
  src/app/             Next.js routes, layout, and Tailwind styling
  src/lib/api.ts       Browser-to-Express API connection
server/
  src/app.ts           Express app, routes, CORS, validation, errors
  src/index.ts         Server startup and graceful shutdown
  src/config/          Validated environment configuration
  src/db/              Database connection and seed script
  src/models/          Mongoose User and Note models
  migrations/          Versioned database migrations
  tests/               API tests using Node test runner and Supertest
  migrate-mongo-config.cjs
scripts/setup.mjs      Non-destructive environment setup
compose.yaml          Optional local MongoDB
package.json          npm workspaces and shared commands
```

## Database and sample data

The initial migration creates `users` and `notes`, a unique user email index, a unique sparse note seed key index, and an owner lookup index. Applied migrations are recorded in the `migrations` collection. Automatic Mongoose index creation is disabled so migrations control the database setup.

The seed script creates two sample profiles (`alex@example.test`, `sam@example.test`) and a welcome note for each. Re-running it preserves existing record content and does not duplicate the sample records. Seeding is disabled when `NODE_ENV=production`.

**Sample login credentials: not applicable yet.** These are data fixtures, not login accounts. No login, password storage, session management, or authorization is implemented. Add those once the challenge specifies access rules, then update this README with working demo credentials and verify two independent browser sessions.

Inspect data in MongoDB Compass or `mongosh`:

```bash
mongosh mongodb://127.0.0.1:27017/neostat
# In the shell:
db.users.find()
db.notes.find()
```

Create a future migration from `server/`:

```bash
npx migrate-mongo create describe-your-change -f migrate-mongo-config.cjs
```

Implement both `up` and `down`, then run root migration commands. Do not edit already-applied migrations. The initial rollback removes its indexes but deliberately preserves documents and collections; reapply it to restore the indexes.

## Architecture and security

Next.js owns the UI. Express owns API input validation, future business rules and permissions, and database access. The browser never connects to MongoDB. Mongoose models define document structure; Zod validates API inputs and server configuration. User emails are unique at the database level; note ownership is an ObjectId reference, not a MongoDB-enforced foreign key. Future write endpoints must validate owner existence and authorize access on the server.

The starter exposes only public diagnostic endpoints. Helmet adds HTTP security headers, JSON request sizes are limited, CORS allows the configured frontend origin, and errors return meaningful status codes without database details. CORS is not authentication. Before exposing user data, implement authentication, authorization, and appropriate abuse controls. Decide on cookies (with CSRF protection) or tokens when implementing login.

## API checks

```bash
curl http://localhost:4000/api/hello
curl 'http://localhost:4000/api/hello?name=Alex'
curl http://localhost:4000/api/health
```

- `GET /api/hello?name=Alex`: hello-world response; optional `name` must be 1–80 characters.
- `GET /api/health`: HTTP 200 when MongoDB responds; HTTP 503 if database readiness is lost.
- Invalid input/JSON: HTTP 400. Oversized JSON: HTTP 413. Unknown routes: HTTP 404.

The API connects to MongoDB before listening. If MongoDB is unavailable at startup, it exits with a setup message instead of pretending to be ready.

## Readiness and remaining challenge work

- [x] Next.js, React, TypeScript, Tailwind, and separate Express API scaffolded.
- [x] npm workspaces, root development/build commands, environment templates, and lockfile.
- [x] MongoDB connection, versioned migration, repeatable sample seed, and API connection page.
- [x] Server validation, error responses, and focused API tests.
- [ ] Implement the application specified in the challenge brief.
- [ ] Add authentication/permissions, demo login credentials, and test two browser sessions.
- [ ] Add tests for the challenge's critical business rules.
- [ ] Confirm your browser, editor, API client, and GitHub access are ready.

Git is already initialized. Commit the scaffold and subsequent work with clear messages when ready.

Verification on setup: lint, TypeScript checks, four API tests, both production builds, live API responses, and a Chromium browser connection check passed. The migration and repeated seed were checked against local MongoDB. `npm audit --omit=dev` reported zero vulnerabilities; the full audit reported five high-severity entries in the development-only Next.js ESLint dependency chain (`braces` / `micromatch` / `fast-glob`). The suggested automatic fix downgrades Next.js lint configuration across major versions, so it was not applied.

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Mongoose connections](https://mongoosejs.com/docs/connections.html).
