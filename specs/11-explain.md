# 11 — Explaining NeoStat (live Q&A prep)

*Stub. Completed in S7 from the real code, with file:line references.*

## Mechanisms to explain

1. Permission predicate: `server/src/domain/policy.ts`
2. Scoped project query: `server/src/repos/projects.repo.ts`
3. Version-conditioned update (409): `server/src/domain/tasks.service.ts`
4. Unassign cleanup transaction: `server/src/domain/members.service.ts`
5. Session lifecycle (login → cookie → loadActor → logout): `server/src/http/`

## Likely "modify / extend" requests → where to change

| Request | Change |
| --- | --- |
| Add a task field (e.g. estimate) | New migration → `tasks.repo.ts` columns/whitelist → zod schema → DTO → `policy.editableTaskFields` → TaskForm |
| Let Viewers comment | `policy.ts` canComment → test B9 |
| Allow multiple managers | Drop the partial unique index (new migration) → manager-replacement service |
| Add a label/priority filter | `GET /tasks` query schema → repo WHERE clause → TaskFilters |
