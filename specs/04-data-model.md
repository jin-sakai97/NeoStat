# 04 — Data model, migrations and seed

## 1. Conventions

- UUID primary keys, **generated in the application** (`crypto.randomUUID()`).
- `timestamptz` for timestamps (UTC). `date` for task due dates.
- snake_case columns in SQL; camelCase in JSON. Mapping happens in the repository `toDTO`
  functions.
- Every column is `NOT NULL` unless marked nullable.
- No hard deletes of users or projects. Tasks are hard-deleted, and their comments cascade.

## 2. Migration `server/migrations/1761200000000_initial-schema.sql`

node-pg-migrate SQL format. This is the exact content to commit:

```sql
-- Up Migration

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  name          varchar(80)  NOT NULL CHECK (btrim(name) <> ''),
  email         varchar(254) NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  password_hash text         NOT NULL,
  role          text         NOT NULL CHECK (role IN ('ADMIN','PROJECT_MANAGER','TEAM_MEMBER','VIEWER')),
  is_active     boolean      NOT NULL DEFAULT true,
  auth_version  integer      NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_name_idx ON users (name, id);

CREATE TABLE projects (
  id          uuid PRIMARY KEY,
  name        varchar(120)  NOT NULL CHECK (btrim(name) <> ''),
  description varchar(4000) NOT NULL DEFAULT '',
  archived_at timestamptz,
  deleted_at  timestamptz,
  created_by  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_live_updated_idx ON projects (updated_at DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL REFERENCES users (id)    ON DELETE RESTRICT,
  role       text NOT NULL CHECK (role IN ('PROJECT_MANAGER','TEAM_MEMBER','VIEWER')),
  added_by   uuid NOT NULL REFERENCES users (id)    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE UNIQUE INDEX project_members_one_manager ON project_members (project_id) WHERE role = 'PROJECT_MANAGER';
CREATE INDEX project_members_user_idx ON project_members (user_id, project_id);

CREATE TABLE tasks (
  id          uuid PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  title       varchar(160)  NOT NULL CHECK (btrim(title) <> ''),
  description varchar(5000) NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'TODO'   CHECK (status IN ('TODO','IN_PROGRESS','DONE')),
  priority    text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  assignee_id uuid,
  due_date    date,
  version     integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  updated_by  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- An assignee must be a member of the task's project. MATCH SIMPLE: NULL assignee skips the check.
  FOREIGN KEY (project_id, assignee_id) REFERENCES project_members (project_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX tasks_project_updated_idx ON tasks (project_id, updated_at DESC, id);
CREATE INDEX tasks_assignee_status_idx ON tasks (assignee_id, status) WHERE assignee_id IS NOT NULL;

CREATE TABLE comments (
  id         uuid PRIMARY KEY,
  task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body       varchar(2000) NOT NULL CHECK (btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_task_created_idx ON comments (task_id, created_at DESC, id);

-- connect-pg-simple schema (createTableIfMissing: false, tableName: 'user_sessions')
CREATE TABLE user_sessions (
  sid    varchar NOT NULL COLLATE "default" PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);

-- Down Migration

DROP TABLE user_sessions;
DROP TABLE comments;
DROP TABLE tasks;
DROP TABLE project_members;
DROP TABLE projects;
DROP TABLE users;
```

Rules that the database **cannot** express and services must enforce:

- Project-role ceiling versus account role.
- Assignee is not a Viewer and is active.
- At least one manager per project. The index guarantees "at most one". Services guarantee
  "at least one" because creation always inserts the manager and remove/downgrade of the manager
  is rejected.
- At least one active Admin.

The old Mongo migration (`server/migrations/202610230001-initial-collections.cjs`) and
`migrate-mongo-config.cjs` are removed in S1.

### 2a. Migration `server/migrations/1761300000000_task-activity.sql` (S9, task history)

```sql
-- Up Migration

CREATE TABLE task_activity (
  id         uuid PRIMARY KEY,
  task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  actor_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind       text NOT NULL CHECK (kind IN ('CREATED','UPDATED')),
  -- { "<apiField>": { "from": <value|null>, "to": <value|null> } } for the fields that changed.
  -- assigneeId values are { "id": uuid, "name": text } snapshots; every other value is a string.
  changes    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes) = 'object'),
  version    integer NOT NULL CHECK (version > 0),   -- tasks.version after this change
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_activity_task_idx ON task_activity (task_id, created_at DESC, id);

-- Down Migration

DROP TABLE task_activity;
```

Rules:

- A row is written **inside the same transaction** as the task change, after the task row is
  locked (`03 §6`), so history and `tasks.version` can never disagree and no new lock order exists.
- `CREATED` has `changes = {}` and `version = 1`. `UPDATED` lists only fields whose value really
  changed (a PATCH that re-sends current values writes no row, but still bumps `version`).
- The cleanup that unassigns tasks (member removed, user deactivated) writes one `UPDATED` row per
  affected task: `changes = { assigneeId: { from: {id, name}, to: null } }`, actor = whoever
  triggered it.
- Comments are not activity (they have their own list). Deleting a task deletes its history
  (cascade). Seed tasks start with no history; the UI says so.
- Project, membership and user lifecycle audit stay on the roadmap (`00-plan.md` §12).

### 2b. Migration `server/migrations/1761400000000_notifications.sql` (S11)

```sql
-- Up Migration

CREATE TABLE notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,   -- recipient
  actor_id   uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,   -- who caused it
  kind       text NOT NULL CHECK (kind IN ('TASK_ASSIGNED','COMMENT_ADDED','ADDED_TO_PROJECT')),
  task_id    uuid REFERENCES tasks (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> actor_id),
  CHECK ((kind = 'ADDED_TO_PROJECT' AND project_id IS NOT NULL) OR (kind <> 'ADDED_TO_PROJECT' AND task_id IS NOT NULL))
);
CREATE INDEX notifications_user_idx   ON notifications (user_id, created_at DESC, id);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- Down Migration

DROP TABLE notifications;
```

Rules: `TASK_ASSIGNED` when a task is created with, or PATCHed to, an assignee other than the actor
(recipient = the new assignee). `COMMENT_ADDED` when someone else comments on a task that has an
assignee (recipient = the assignee). `ADDED_TO_PROJECT` when someone else adds a member
(recipient = the new member). Deleting a task or project cascades. No retention job yet.

## 3. Key queries (for explanation)

**Visible projects for an actor** (the scoped query used by lists, counts and the dashboard):

```sql
SELECT p.*, pm.role AS my_role
FROM projects p
LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
WHERE p.deleted_at IS NULL
  AND ($2::boolean OR pm.user_id IS NOT NULL)      -- $2 = actor is ADMIN
  AND (CASE WHEN $3::boolean THEN p.archived_at IS NOT NULL ELSE p.archived_at IS NULL END)
  AND ($4::text IS NULL OR p.name ILIKE '%' || $4 || '%')
ORDER BY p.updated_at DESC, p.id
LIMIT $5 OFFSET $6;
```

(Escape `%` and `_` in `$4` before binding.)

**Version-conditioned update**: see `03-permissions.md` §7.

**Overdue**: `t.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date AND t.status <> 'DONE'`.

**Sort whitelist** (tasks):

| `sort` | SQL |
| --- | --- |
| `updatedAt` | `t.updated_at` |
| `title` | `lower(t.title)` |
| `dueDate` | `t.due_date` with `NULLS LAST` in both directions |
| `priority` | `CASE t.priority WHEN 'LOW' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END` |
| `status` | `CASE t.status WHEN 'TODO' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END` |

The tie-breaker is always `, t.id ASC`.

## 4. Seed contract (`npm run db:seed`)

- Refuses to run when `NODE_ENV=production`.
- Idempotent: `INSERT … ON CONFLICT DO NOTHING` with **fixed UUIDs** from
  `server/src/db/fixtures.ts`. It never updates existing rows, so passwords, edits, assignments and
  versions survive a re-seed.
- Prints a one-line summary of inserted and existing counts. It never prints passwords.
- Password for every account: `NeoStatsDemo!2026` (hashed at seed time).

### Users

| Fixed ID suffix | Name | Email | Role | Active |
| --- | --- | --- | --- | --- |
| …0001 | Asha Admin | admin@neostat.test | ADMIN | ✅ |
| …0002 | Arjun Admin | admin2@neostat.test | ADMIN | ✅ |
| …0003 | Priya Manager | manager@neostat.test | PROJECT_MANAGER | ✅ |
| …0004 | Rohan Manager | manager2@neostat.test | PROJECT_MANAGER | ✅ |
| …0005 | Meera Member | member@neostat.test | TEAM_MEMBER | ✅ |
| …0006 | Kabir Member | member2@neostat.test | TEAM_MEMBER | ✅ |
| …0007 | Vikram Viewer | viewer@neostat.test | VIEWER | ✅ |
| …0008 | Isha Inactive | inactive@neostat.test | TEAM_MEMBER | ❌ |

Fixed UUIDs use the pattern `00000000-0000-4000-8000-00000000000N` for users,
`…-8000-1000000000NN` for projects, `…-8000-2000000000NN` for tasks and `…-8000-3000000000NN` for
comments. All of these are valid v4-shaped UUIDs that pass `z.uuid()`.

### Projects and memberships

| Project | State | Manager | Members |
| --- | --- | --- | --- |
| **Website Redesign** | Active | Priya (manager@) | Meera TM, Kabir TM, Vikram Viewer, Isha TM (inactive) |
| **Mobile App Launch** | Active | Rohan (manager2@) | Meera TM, Priya **Viewer** (shows that a PM account can be a viewer) |
| **Legacy CRM Migration** | Archived | Rohan (manager2@) | Kabir TM |

Overlap: Meera is in both active projects. Priya manages one project and is a viewer in the other.
Kabir is in Website Redesign and the archived project.

### Tasks (dates relative to the seed run date `D`, stored as absolute dates)

| Project | Title | Status | Priority | Assignee | Due |
| --- | --- | --- | --- | --- | --- |
| Website Redesign | **Concurrent editing demo** | TODO | MEDIUM | Meera | D+3 |
| Website Redesign | Audit current site navigation | DONE | LOW | Kabir | D−10 |
| Website Redesign | Design new homepage hero | IN_PROGRESS | HIGH | Meera | D−2 (overdue) |
| Website Redesign | Write accessibility checklist | TODO | MEDIUM | — | — |
| Website Redesign | Migrate blog content | TODO | LOW | Kabir | D+14 |
| Website Redesign | Set up analytics dashboard | IN_PROGRESS | MEDIUM | Priya | D+7 |
| Mobile App Launch | Prepare App Store listing | TODO | HIGH | Meera | D+5 |
| Mobile App Launch | Fix login crash on Android | IN_PROGRESS | HIGH | Rohan | D−1 (overdue) |
| Mobile App Launch | Beta tester feedback triage | DONE | MEDIUM | Meera | D−5 |
| Mobile App Launch | Push notification copy | TODO | LOW | — | — |
| Legacy CRM Migration | Export customer records | DONE | HIGH | Kabir | D−30 |
| Legacy CRM Migration | Decommission old server | TODO | MEDIUM | — | — |

Every task starts at `version = 1`. The demo task's description is: "Open this task in two
browsers as manager@ and member@, edit both, and save one after the other."

### Comments

- *Concurrent editing demo*: Priya, "Kicking this off — Meera, please take the first pass."
  Then Meera, "On it."
- *Design new homepage hero*: Kabir, "Shared two layout options in the drive."
- *Fix login crash on Android*: Meera, "Reproduced on Android 15."
- *Export customer records*: Rohan, "Export verified and archived."

## 5. Test database

- `TEST_DATABASE_URL` must point to a database whose name **ends in `_test`**. The integration
  test bootstrap refuses to run otherwise.
- Before each test file: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, then run migrations
  and the seed, so every test starts from the fixtures.
- Test files run serially (`--test-concurrency=1`). Inside a test, concurrency comes from real
  parallel HTTP requests (`Promise.all`) through separate pool connections.
