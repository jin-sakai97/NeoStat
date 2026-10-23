# 02 — Requirements, priorities and decisions

## 1. Requirement IDs

| ID | Requirement | Tier |
| --- | --- | --- |
| R01 | Users log in with email and password, stay authenticated across reloads (8 h max) and log out | P0 |
| R02 | The server enforces account-role, project-role, ownership and field-level permissions on every request | P0 |
| R03 | Admin creates, reads, updates, deactivates and reactivates user accounts | P0 |
| R04 | Projects: create, read, edit, archive/restore, soft-delete | P0 |
| R05 | Membership: add, remove, change role; Admin replaces the manager | P0 |
| R06 | Tasks: create, read, edit, assign, change status, delete | P0 |
| R07 | Comments: create, read, delete when authorized | P0 |
| R08 | Stale task mutations fail with 409 and never overwrite newer data | P0 |
| R09 | APIs validate input, use consistent error envelopes, paginate and filter | P0 |
| R10 | Reproducible local setup: migrations, idempotent seed, documented commands | P0 |
| R11 | UI shows permissions, loading, errors, empty states, archived state and conflicts | P0 (polish P1) |
| R12 | Submission: source, README, architecture and AI note, working demo accounts | P0 |
| R13 | Explainability (brief §9): README AI-assistance note separating AI-built parts from the participant's own decisions; participant can walk through the 5 key mechanisms (`11-explain.md`) and make small live changes | P0 |

## 2. Feature tiers

### P0 — must ship in the 3-hour core

- Everything in R01–R12 as specified in `03`–`06`.
- Integration tests (real PG) for: login and logout, CSRF rejection, the scope 404 rule, the
  member field rule, the mixed-field 403, stale-version 409, simultaneous same-version update
  (one wins), cleanup bumping versions, last-admin guard, and archived write block.
- A manual two-browser conflict demo, written down in the README.
- Conflict dialog with Latest vs Mine for each changed field and **Reload latest** / **Re-apply
  my changes**.

### P1 — if P0 passes with time left

- Login rate limit (10 failed attempts / IP / 15 min → 429). ✅ done

- Per-field Latest/Mine picker in the conflict dialog. ✅ done
- One Playwright test: two contexts, conflict appears, draft is preserved.
- 30-second background refetch for visible lists (window-focus refetch is P0 because it is free). ✅ done (lists only; single-task detail is not polled so an open edit form never changes underneath the user)
- Desktop and mobile screenshots in the README.
- Account-role change returning `ROLE_CONFLICT` with the blocking projects listed in the UI
  (the API check itself is P0). ✅ done: `ConflictMessage` in `components/users/user-dialogs.tsx` links each blocking project
- Change own password (`POST /profile/password`, see `05-api.md`). ✅ done
- Mobile navigation sheet (P0 fallback: the sidebar collapses to a top bar with links).

- Task activity history: who changed which field of a task, from what to what (`04 §2a`, S9).

- Kanban board view of a project's tasks; moving a card is the same versioned status PATCH (`06 §4`, S10).

### P2 — roadmap

See `00-plan.md` §12.

## 3. Ambiguity decisions

These are **our decisions**, not text from the brief. Revisit them once the brief is
cross-checked.

| # | Question | Decision |
| --- | --- | --- |
| A1 | Account role vs project role? | Account role is a ceiling. Project role sets permissions inside a project |
| A2 | Does Admin need membership? | No. Admin can do everything in all non-deleted projects |
| A3 | Can a Project Manager see every project? | No. Membership is required, and managing requires being the designated manager |
| A4 | Are Viewers organization-wide? | No. They see joined projects only (brief §4 lists "project-level role", so Viewer is a project role) |
| A5 | Do members see colleagues' tasks? | Yes, all tasks within joined projects (brief says "view assigned tasks"; the participant chose the broader reading for collaboration) |
| A6 | What does "update their tasks" mean? | Title, description and status of tasks assigned to them |
| A7 | Who edits project name and description? | Admin and the designated manager |
| A8 | Delete or archive? | Both: archive/restore (reversible) and soft delete (P0 has no restore) |
| A9 | Writes in archived projects? | Blocked (409 PROJECT_ARCHIVED). Exceptions: Admin restore, soft delete, manager replacement, and deactivation cleanup |
| A10 | How many managers? | Exactly one, who must hold the PROJECT_MANAGER account role |
| A11 | Can managers appoint managers? | No, only Admin |
| A12 | Who comments or deletes comments? | Project roles PM and TM comment. Author, designated manager or Admin delete |
| A13 | Tasks of removed or deactivated users? | Unassigned atomically with a version bump. Authorship is kept |
| A14 | Signup, invites, email? | None. Admin creates accounts |
| A15 | Task fields? | Status TODO/IN_PROGRESS/DONE (any transition). Priority LOW/MEDIUM/HIGH. Optional date-only due date. At most one assignee |
| A16 | Real-time collaboration? | Not required. Refetch on focus plus conflict detection |
| A17 | Auto-merge conflicts? | No. Show latest, keep the draft, let the user decide |
| A18 | Version on delete and quick status change? | Yes. Every user task mutation requires a version |
| A19 | Deployment? | Local only |
| A20 | PATCH with a forbidden field whose value is unchanged? | Still 403. The client sends only changed fields |
| A21 | Can a member self-assign? | No. Assignment is manager/Admin only |
| A22 | Overdue? | `due_date` before today in Asia/Kolkata, and status ≠ DONE |
| A23 | Task moves between projects? | Not supported |
| A24 | Comment edits? | Not supported |

## 4. Explicitly out of scope (all tiers below P2)

Public signup, OAuth/SSO, email sending, file uploads, real-time sockets, dark mode,
internationalization, deployment, multi-tenant organizations, task dependencies or subtasks,
time tracking.
