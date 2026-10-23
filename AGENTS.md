# NeoStat — reviewer instructions (Codex and other agents)

The behavior contract is in `specs/` (start at `specs/README.md`). Review each change against it
with the checklist in `specs/10-verification-log.md`, focusing on:

1. Permission scope: 404 for out-of-scope, 403 for forbidden, and field-level task rules
   (`specs/03-permissions.md`).
2. Task version checks on every UPDATE/DELETE, including cleanup paths.
3. Transaction boundaries and lock order.
4. API compatibility with `specs/05-api.md` (envelopes, codes, DTO fields).
5. Migrations: never edit applied migrations; the down migration must work.
6. Acceptance evidence: real-PostgreSQL tests for `specs/08-acceptance.md` rows.

Report findings as concrete file:line issues with a proposed fix. Frontend-specific Next.js rules
are in `client/AGENTS.md`.
