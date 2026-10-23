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
