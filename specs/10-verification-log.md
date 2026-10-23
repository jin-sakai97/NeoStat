# 10 — Verification log and review checklist

Append one entry per slice. Record **actual** command output (counts), not intentions. If a
check was skipped, say so.

## Reviewer checklist (use on every slice diff)

1. **Scope**: Does every read path filter `deleted_at IS NULL` and apply membership (or the
   Admin flag)? Do list counts and `total` use the same predicate as the rows?
2. **Authorization**: Does every mutation re-read the actor and membership inside the
   transaction? Is 404 vs 403 ordered per `03 §4`? Are capabilities derived from `policy.ts`?
3. **Field rule**: Does a task PATCH reject any key outside `editableFields` with 403 *before*
   writing?
4. **Version**: Is every task UPDATE/DELETE conditioned on `version = $n`? Is the version bumped
   exactly once (including in cleanup)? Does 409 carry the full DTO only after authorization?
5. **Transactions**: Is one client used per transaction? Are locks taken in the `03 §6` order?
   Is `release()` called in `finally`?
6. **SQL safety**: Are all values `$n`? Do dynamic identifiers come only from whitelists?
7. **API compatibility**: Do envelopes, codes and DTO fields match `05-api.md`? Is `.strict()`
   on schemas?
8. **Migrations**: Are already-applied migrations never edited? Does the down migration work?
9. **Secrets**: No `.env` staged. No hashes, tokens or secrets in logs or responses.
10. **Evidence**: Are the tests real-PG for permissions and concurrency? Are the results pasted
    below?

## Log

### 2026-10-23 — Spec review (before S0)

- Original plan reviewed. Changes C1–C16 recorded in `01-review.md` §3.
- Environment measured: PG 18.6 accepting connections; `npm test` 4/4 pass; Docker socket
  denied; ports 3000/4000 occupied by running dev servers; `neostat` / `neostat_test` databases
  do not exist; role `mrrobot` lacks CREATEDB.
- Open item: cross-check against the actual challenge brief (only the Guidelines were available).

### 2026-10-23 — Brief cross-check

- Read the full challenge PDF (5 pages). No behavior changes. Added R13 explainability and the
  live-event rules. Rate limit moved to P1. Team Members see all project tasks (participant
  decision).

### 2026-10-23 — S0 + S1 Database foundation

- S0: scaffold + specs pushed (`9a8b990`). Databases created from `template0` (template1 has a
  collation-version mismatch). Ports 3000/4000 free.
- S1 commands: `db:migrate` ✅ · `db:status` → applied · `db:seed` → 38 inserted, re-run → 0 ·
  `db:rollback` + `db:migrate` + `db:seed` ✅ · counts users 8 / projects 3 / members 10 / tasks 12 /
  comments 5 · `npm run check` → lint ✅ typecheck ✅ unit 4/4 ✅ builds ✅ · `GET /api/health` → 200.
- Known: the starter home page still calls the removed `/api/hello`; replaced in S4.

<!-- Template for next entries:
### YYYY-MM-DD HH:MM — S<n> <name>
- Commit: <sha>
- Commands: `npm run check` → … ; `npm run test:integration` → N pass / M fail
- Acceptance rows covered: A1–A8, …
- Findings: … (fixed in <sha> / deferred with reason)
-->
