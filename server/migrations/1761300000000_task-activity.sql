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
