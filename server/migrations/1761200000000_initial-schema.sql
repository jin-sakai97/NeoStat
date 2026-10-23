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
