# NeoStat — Claude Code instructions

Spec-driven project. **Read `specs/README.md` first**, then the active slice in
`specs/07-tasks.md`. The specs are the source of truth. If code needs to differ from the spec,
update the spec first and log it in `specs/10-verification-log.md`.

## Key rules

- Authorization lives on the server (`server/src/domain/policy.ts` + services). UI capability
  flags are hints only.
- Every task UPDATE/DELETE is conditioned on `version` (`specs/03-permissions.md` §7). Never
  force-save or auto-retry a stale mutation.
- Transactions: one checked-out client per transaction, row locks in the order in
  `specs/03-permissions.md` §6.
- SQL: parameterized values only. Dynamic columns come from whitelists.
- API shapes and error codes: `specs/05-api.md`. UI: `specs/06-design.md`.
- Before using any Next.js API, read the matching guide in `node_modules/next/dist/docs/`
  (Next 16; see `client/AGENTS.md`). Version notes: `specs/09-architecture.md` §5.
- Never commit `.env` files, the confidential challenge brief, or secrets. Never print
  `SESSION_SECRET`.
- Leave the running MongoDB instance and its data alone.

## Commands

```bash
npm run dev               # client :3000 + API :4000
npm run check             # lint + typecheck + unit tests + builds
npm run test:integration  # real PostgreSQL (TEST_DATABASE_URL must end in _test)
npm run db:migrate && npm run db:seed
```

## Workflow per slice

Implement → `npm run check` + `npm run test:integration` → append evidence to
`specs/10-verification-log.md` → tick tasks in `specs/07-tasks.md` → commit `S<n>: …` → push.
