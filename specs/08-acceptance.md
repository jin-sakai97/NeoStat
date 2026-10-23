# 08 — Acceptance scenarios

**I** = automated integration test (real PostgreSQL `neostat_test`, Supertest, no mocks).
**U** = unit test. **M** = manual browser check. **E** = Playwright (P1).
Seed names refer to `04-data-model.md` §4. WR = Website Redesign, MA = Mobile App Launch,
LC = Legacy CRM (archived).

## A. Authentication — R01, R02

| # | Scenario | Expected | Type | Tier |
| --- | --- | --- | --- | --- |
| A1 | Each active seeded account logs in | 200, `user.role` correct, cookie `neostat.sid` HttpOnly | I | P0 |
| A2 | Wrong password / unknown email / inactive@ | All three return 401 with an identical body | I | P0 |
| A3 | Anonymous `GET /projects` | 401 UNAUTHENTICATED | I | P0 |
| A4 | Logout, then `GET /auth/me` with the same cookie | 401 | I | P0 |
| A5 | Admin deactivates member@ while member@ has a session | member@'s next request → 401 | I | P0 |
| A6 | Mutation with no or wrong `X-CSRF-Token` | 403 CSRF_FAILED, no change | I | P0 |
| A7 | Mutation with `Origin: http://evil.test` | 403 CSRF_FAILED | I | P0 |
| A8 | 11th failed login from the same IP within 15 min | 429 | I | P1 |
| A9 | Log out as Admin, log in as Viewer in the same tab | No Admin data visible (the cache was cleared) | M | P0 |
| A10 | Response bodies never contain `password_hash`, `passwordHash` or `auth_version` | Assert on user DTOs | I | P0 |

## B. Authorization — R02, R03, R05, R06, R07

| # | Scenario | Expected | Type | Tier |
| --- | --- | --- | --- | --- |
| B1 | admin@ `GET /projects` | WR and MA listed with no membership | I | P0 |
| B2 | manager2@ `GET /projects/:WR` | 404 | I | P0 |
| B3 | member2@ lists projects | Only WR. `total` = 1 | I | P0 |
| B4 | member@ `POST /projects/:WR/tasks` | 403 | I | P0 |
| B5 | member@ PATCH title on *Concurrent editing demo* (assigned to them) | 200, version 2 | I | P0 |
| B6 | member@ PATCH *Write accessibility checklist* (unassigned) | 403 | I | P0 |
| B7 | member@ PATCH `{version, priority}` on own task | 403 | I | P0 |
| B8 | member@ PATCH `{version, title, priority}` | 403 **and the title is unchanged in the DB** | I | P0 |
| B9 | viewer@ PATCH a task / POST a comment / POST a member / DELETE a comment | 403 for each | I | P0 |
| B10 | manager2@ `GET /tasks/:id` of a WR task, `GET /tasks/:id/comments`, `DELETE /comments/:id` of a WR comment | 404 for each | I | P0 |
| B11 | manager@ (Viewer in MA) PATCH an MA task | 403 | I | P0 |
| B12 | manager@ adds viewer@ as TEAM_MEMBER in MA | 400 (ceiling) | I | P0 |
| B13 | Non-admin `GET /users` | 403 | I | P0 |
| B14 | manager@ assigns a WR task to viewer@ | 400 VALIDATION_ERROR on assigneeId | I | P0 |
| B15 | member@ deletes their own comment / Kabir's comment | 204 / 403 | I | P0 |
| B16 | manager@ deletes Kabir's comment in WR | 204 | I | P0 |
| B17 | Capabilities in DTOs match the policy for each role | `editableFields` per `03 §2` | I+U | P0 |
| B18 | Policy matrix: every row of `03 §3` × 4 roles | Pure function cases | U | P0 |

## C. Lifecycle and integrity — R03, R04, R05

| # | Scenario | Expected | Type | Tier |
| --- | --- | --- | --- | --- |
| C1 | Admin creates a project with managerId = manager2@ | 201. Exactly one PM membership row | I | P0 |
| C2 | Create a project with managerId = member@ | 400 | I | P0 |
| C3 | Admin `PUT /projects/:WR/manager {manager2@}` | manager2@ is PM, manager@ is TM, exactly 1 PM row | I | P0 |
| C4 | manager@ removes member@ from WR | 204. member@'s WR tasks are unassigned with version +1. Comments remain | I | P0 |
| C5 | Downgrade member2@ to Viewer in WR | Assignments cleared with version +1 | I | P0 |
| C6 | Remove or downgrade the designated manager | 409 MANAGER_REQUIRED | I | P0 |
| C7 | Deactivate manager@ | 409 MANAGER_REQUIRED | I | P0 |
| C8 | Deactivate member@ | Tasks in WR and MA unassigned with version +1. Memberships kept. Sessions dead | I | P0 |
| C9 | Reactivate member@ | Can log in. Assignments are not restored | I | P0 |
| C10 | admin@ deactivates or demotes themselves | 409 SELF_LOCKOUT | I | P0 |
| C11 | admin@ demotes admin2@, then tries to demote the last admin through another path | 2nd → 409 LAST_ADMIN | I | P0 |
| C12 | Concurrent: admin@ and admin2@ demote each other in parallel | Exactly one succeeds. One active admin remains | I | P0 |
| C13 | Writes in LC (archived): task PATCH, POST comment, POST member, PATCH project | 409 PROJECT_ARCHIVED | I | P0 |
| C14 | GET on LC and its tasks by kabir (member2@) | 200 | I | P0 |
| C15 | Admin restores LC, then archives it again | 200 both. Idempotent on repeat | I | P0 |
| C16 | Admin soft-deletes a project | Gone from lists and the dashboard. `GET /projects/:id`, its tasks and its comments → 404, **including for Admin** | I | P0 |
| C17 | Duplicate email on create or patch | 409 EMAIL_EXISTS | I | P0 |
| C18 | Add an existing member | 409 MEMBER_EXISTS | I | P0 |
| C19 | Change member2@ account role to VIEWER while TM in WR | 409 ROLE_CONFLICT with `details.projects` listing WR | I | P0 |

## D. Concurrency — R08

| # | Scenario | Expected | Type | Tier |
| --- | --- | --- | --- | --- |
| D1 | Clients A and B GET the demo task (v1). A PATCHes and gets 200 v2. B PATCHes with v1 | B gets 409 TASK_VERSION_CONFLICT. `details.currentTask.version` = 2. The DB holds A's values | I | P0 |
| D2 | A and B PATCH the same task with v1 at the same moment (`Promise.all`) | Exactly one 200 and one 409. Final version = 2 | I | P0 |
| D3 | Stale status-only PATCH, stale assignee change, stale DELETE | 409 for each. The task still exists for the stale DELETE | I | P0 |
| D4 | Member removed (C4) while member@ holds v1 | member@ PATCH → 404 (lost access) — **not** 409 with data | I | P0 |
| D5 | Unassignment (deactivation) bumps the version. A manager holding the old version PATCHes | 409 | I | P0 |
| D6 | POST and DELETE a comment | `tasks.version` and `updated_at` unchanged | I | P0 |
| D7 | PATCH without `version` | 400 | I | P0 |
| D8 | UI: two browsers, save in A then B | B shows the conflict dialog. B's draft is visible and kept. Nothing is saved until B acts | M | P0 |
| D9 | UI: Reload latest with a dirty draft | Confirm shown before discarding | M | P0 |
| D10 | UI: Re-apply → Save | Saves with the new version. A second conflict repeats the dialog | M | P0 |
| D11 | Playwright version of D8 | Passes | E | P1 |

## E. CRUD and contract — R03–R09

| # | Scenario | Expected | Type | Tier |
| --- | --- | --- | --- | --- |
| E1 | Malformed UUID in the path | 400 | I | P0 |
| E2 | Unknown body key (`{version:1, foo:1}`) | 400 with fieldErrors | I | P0 |
| E3 | Invalid enum, bad date `2026-13-01`, title of 161 chars, whitespace-only title | 400 | I | P0 |
| E4 | PATCH `{version, dueDate:null, assigneeId:null}` | Both cleared. Other fields unchanged | I | P0 |
| E5 | `GET /tasks?sort=priority&order=desc` | HIGH → MEDIUM → LOW, ties by id | I | P0 |
| E6 | `GET /tasks?sort=dueDate&order=asc` | Nulls last | I | P0 |
| E7 | `pageSize=101` → 400. `page=999` → `[]` with the correct total | | I | P0 |
| E8 | `GET /tasks?projectId=<MA>` as member2@ | 404 | I | P0 |
| E9 | Delete a task with comments | Comments gone (cascade) | I | P0 |
| E10 | Invalid JSON body / > 100 kb | 400 INVALID_JSON / 413 | U | P0 |
| E11 | Dashboard counts as member2@ only include WR | | I | P0 |
| E12 | `assigneeId=me` and `unassigned` filters | Correct sets | I | P0 |
| E13 | Create a task, then PATCH title + status, then PATCH re-sending the same title | `GET /tasks/:id/activity` → CREATED (v1) and one UPDATED (v2) listing exactly title and status with from/to; the no-op PATCH adds no row | I | P1 |
| E14 | Reassign, then remove the assignee from the project | UPDATED rows with `assigneeId` `{id,name}` → `{id,name}` and `→ null`, actor = the remover, version matches the task | I | P1 |
| E15 | `GET /tasks/:id/activity` as a non-member / unknown task / viewer | 404 / 404 / 200 | I | P1 |
| E16 | A stale PATCH (409) and a forbidden PATCH (403) | No activity row | I | P1 |

## F. Browser and submission — R10–R12

| # | Scenario | Type | Tier |
| --- | --- | --- | --- |
| F1 | **Demo script:** admin@ creates a project with manager2@ → manager2@ adds member@ and creates a task assigned to member@ → member@ moves it to In progress and comments → viewer@ (after being added as Viewer) sees it read-only → two-browser conflict on *Concurrent editing demo* (manager@ vs member@) | M | P0 |
| F2 | Each page shows loading, empty, error (stop the API → Retry works after a restart), 404, forbidden and archived states | M | P0 |
| F3 | Keyboard only: login, task edit + save, comment, delete-comment dialog (focus returns) | M | P0 |
| F4 | 390px width: no horizontal page scroll. Tables scroll inside their card | M | P0 |
| F5 | Fresh DB: migrate, seed, seed again → no duplicates, no resets | I/M | P0 |
| F6 | A new clone following only the README reaches a working login | M | P0 |
| F7 | Desktop and mobile screenshots of login, task list and task detail in the README | M | P1 |
