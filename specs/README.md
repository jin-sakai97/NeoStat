# NeoStat specification index

This folder is the **single source of truth** for what NeoStat does and how it is built.
Code must follow these documents. If code and spec disagree, either fix the code or update the
spec *first* (with a note in `10-verification-log.md`) — never silently redefine behavior in code.

## Status

| Item | State |
| --- | --- |
| Spec version | 1.0 (2026-10-23) |
| Active slice | **S0 — Environment gate** (see `07-tasks.md`) |
| Source plan | ChatGPT-authored plan, reviewed and revised in `01-review.md` |
| Challenge brief | **Cross-checked 2026-10-23** (see `01-review.md` §1). Hackathon is live |

## Documents

| # | File | What it answers |
| --- | --- | --- |
| 00 | [00-plan.md](00-plan.md) | The revised master plan: goal, stack, priorities, schedule |
| 01 | [01-review.md](01-review.md) | What was wrong/missing in the original plan and what changed |
| 02 | [02-requirements.md](02-requirements.md) | Requirement IDs (R01–R13), P0/P1/P2 tiers, ambiguity decisions, out-of-scope |
| 03 | [03-permissions.md](03-permissions.md) | Roles, permission matrix, lifecycle rules, locking rules |
| 04 | [04-data-model.md](04-data-model.md) | Exact PostgreSQL DDL, indexes, seed fixtures |
| 05 | [05-api.md](05-api.md) | Every endpoint: request, response, errors; DTO types |
| 06 | [06-design.md](06-design.md) | Visual system, page wireframes, states, copy, accessibility |
| 07 | [07-tasks.md](07-tasks.md) | Ordered, checkable implementation task list (S0–S7) |
| 08 | [08-acceptance.md](08-acceptance.md) | Acceptance scenarios mapped to requirement IDs |
| 09 | [09-architecture.md](09-architecture.md) | Final repository tree, module responsibilities, request lifecycle |
| 10 | [10-verification-log.md](10-verification-log.md) | Review findings and test evidence, appended per slice |
| 11 | [11-explain.md](11-explain.md) | Plain-language walkthrough for the live Q&A (written in S7 from real code) |

## Reading order

- **Implementing (Claude Code):** `00` → `07` (active slice) → the specific doc the task links to.
- **Reviewing (Codex / human):** `03` → `05` → `08` → `10`.
- **Explaining to judges:** `00` §Architecture, `03` §Permission predicate, `04` §Concurrency, `09`.

## Priority tiers (used everywhere)

- **P0** — required for the 3-hour core. Never cut silently.
- **P1** — do if P0 acceptance passes with time left.
- **P2** — roadmap only; mention in README "Known limitations / next steps".
