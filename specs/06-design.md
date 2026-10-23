# 06 — UI design specification

Direction: a **restrained, light, information-dense** work tool in the style of Plane. Tables
first, little decoration. Every state is visible and every action that is not allowed is
explained.

## 1. Design tokens

Defined once in `client/src/app/globals.css` as CSS variables (shadcn convention) and used via
Tailwind classes. Do not hard-code hex values in components.

### Color

| Token | Hex | Use |
| --- | --- | --- |
| `--background` | `#F7F8FA` | Page background |
| `--card` / `--popover` | `#FFFFFF` | Surfaces, tables, dialogs |
| `--foreground` | `#101828` | Primary text |
| `--muted-foreground` | `#667085` | Secondary text, table meta, placeholders |
| `--border` / `--input` | `#E4E7EC` | Borders, dividers, input outlines |
| `--muted` | `#F2F4F7` | Table header background, hovered rows |
| `--primary` | `#4F46E5` | Primary buttons, active nav, links |
| `--primary-hover` | `#4338CA` | Hover on primary |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--ring` | `#6366F1` | Focus ring (2px, offset 2px) |
| `--destructive` | `#D92D20` | Delete or deactivate buttons, error text |
| `--warning-bg` / `--warning-fg` | `#FFFAEB` / `#B54708` | Archived banner, conflict callouts |
| `--success-fg` | `#067647` | Success toasts |

### Status badges (always icon + text, never color alone)

| Value | Label | Lucide icon | Background | Text |
| --- | --- | --- | --- | --- |
| TODO | To do | `Circle` | `#F2F4F7` | `#344054` |
| IN_PROGRESS | In progress | `CircleDot` | `#EFF8FF` | `#175CD3` |
| DONE | Done | `CircleCheck` | `#ECFDF3` | `#067647` |

### Priority badges

| Value | Label | Lucide icon | Background | Text |
| --- | --- | --- | --- | --- |
| LOW | Low | `ArrowDown` | `#F2F4F7` | `#475467` |
| MEDIUM | Medium | `Equal` | `#FFFAEB` | `#B54708` |
| HIGH | High | `ArrowUp` | `#FEF3F2` | `#B42318` |

### Role badges

Outline badge with text: `Admin`, `Manager`, `Member`, `Viewer`. The Admin badge uses
`--primary` text, the others use `--muted-foreground`.

### Typography

- Font stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
  This replaces the Arial in the current `globals.css`.
- Base 14px / 20px line height. Small meta 12px / 16px. Page title 20px / 28px semibold. Section
  title 16px / 24px semibold. Dashboard numbers 24px / 32px semibold, `tabular-nums`.
- Text in tables never wraps beyond 2 lines. Titles truncate with `…` and a `title` attribute.

### Spacing, shape, elevation

- 8px rhythm: `gap-2` (8), `gap-4` (16), `p-6` (24).
- Radius: `rounded-lg` (8px) for cards, inputs, buttons and dialogs. `rounded-full` for avatars
  and badges.
- Borders over shadows. Cards: `border bg-card`, no shadow. Dialogs and popovers: `shadow-lg`.
- Row height in tables: 44px. Control height: 36px (`h-9`).

### Motion

Only shadcn defaults: dialog fade/scale 150ms and toast slide-in. No other animation. Respect
`prefers-reduced-motion`.

## 2. Component inventory

Install with the shadcn CLI into `client/src/components/ui/`: `button`, `input`, `textarea`,
`label`, `select`, `dialog`, `alert-dialog`, `dropdown-menu`, `table`, `badge`, `tabs`, `sheet`,
`skeleton`, `sonner`, `tooltip`, `separator`, `avatar`, `card`, `form` (RHF bindings),
`pagination`.

App components (`client/src/components/`):

| Component | Purpose |
| --- | --- |
| `AppShell` | Sidebar (desktop) or top bar with sheet (mobile), plus the content area |
| `PageHeader` | Title, optional subtitle and badges, and right-aligned actions |
| `StatusBadge`, `PriorityBadge`, `RoleBadge` | Per §1 tables |
| `UserAvatar` | Initials in a 24px circle. Background color picked deterministically from a 6-color palette by id hash |
| `DataTable` | Semantic `<table>` in a horizontally scrollable wrapper, with a header row, loading skeleton rows, empty and error slots |
| `Pager` | "Showing 1–25 of 132" plus Prev/Next buttons (disabled at the ends) |
| `SearchInput` | Debounced 300ms, synced to the URL `?q=` |
| `StateView` | One component for all non-data states (§5) |
| `ConfirmDialog` | `alert-dialog` with title, effect text, destructive confirm and pending state |
| `ArchivedBanner` | Warning banner: "This project is archived. It's read-only until an admin restores it." |
| `ConflictDialog` | §6 |
| `TaskForm` | RHF + Zod. Renders only the fields in `capabilities.editableFields`; the rest are read-only text |
| `CommentList`, `CommentComposer` | Task detail comments |

## 3. Layout

```text
Desktop ≥ 1024px
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ neostat.     │  PageHeader: Title                     [Secondary] [Primary] │
│              │  subtitle / badges                                           │
│ ▣ Dashboard  │ ──────────────────────────────────────────────────────────── │
│ ▤ Projects   │                                                              │
│ ☑ My Tasks   │   content (max-width 1200px, padding 24px)                   │
│ ◎ Users*     │                                                              │
│              │                                                              │
│              │                                                              │
│ ──────────── │                                                              │
│ (AV) Asha    │                                                              │
│ Admin  ⋯     │  ⋯ menu → Profile, Log out                                   │
└──────────────┴──────────────────────────────────────────────────────────────┘
 sidebar 232px, white, right border          * Users visible to Admin only

Mobile < 768px (target 390px)
┌──────────────────────────────┐
│ ☰  neostat.            (AV)  │  ☰ opens Sheet with the same nav
├──────────────────────────────┤
│ Title                        │
│ [Primary action]             │  actions wrap below the title
│ content, padding 16px        │  tables scroll horizontally inside their card
└──────────────────────────────┘
```

**Notifications bell (S11).** A `Bell` button in the sidebar footer row (desktop) and the mobile top
bar, left of the avatar. A badge shows the unread count (`99+` cap, hidden at 0), polled every
30 s (`GET /notifications/unread-count`). The button's accessible name is "Notifications, N unread".
It opens a dropdown panel (max-height with inner scroll) listing the latest 20:

```text
Notifications                                   [Mark all read]
● Priya Manager assigned you "Write checklist"        5 min ago
● Kabir Member commented on "Design hero"             1 h ago
  Priya Manager added you to Website Redesign         2 d ago
```

- Unread rows have a dot and `bg-muted`; read rows are plain. Selecting a row marks it read and
  goes to `/tasks/:id` (or `/projects/:id/tasks` for project additions).
- Empty state: "You're all caught up." Error state: a Retry link inside the panel.
- Names that are no longer visible read "a task you can no longer access" and are not links.

Nav icons (Lucide): `LayoutDashboard`, `FolderKanban`, `ListChecks`, `Users`, `UserCircle`,
`LogOut`. The active item has a `bg-muted` background, `--primary` text and a 2px left indicator.

## 4. Pages

Every route lives under `client/src/app/`. Authenticated pages are in the `(app)` route group,
whose layout runs the auth guard.

### `/` → redirect

Shows a centered spinner while `GET /auth/me` runs, then `router.replace('/dashboard')` or
`'/login'`.

### `/login`

```text
┌───────────────────────────────────────────┐
│               neostat.                    │
│        Sign in to your workspace          │
│ ┌───────────────────────────────────────┐ │
│ │ Email                                 │ │
│ │ [ you@company.com                   ] │ │
│ │ Password                              │ │
│ │ [ ••••••••••                     👁 ] │ │
│ │ ⚠ Email or password is incorrect.     │ │  role="alert", only after a failure
│ │ [        Sign in        ]             │ │  → "Signing in…" + disabled while pending
│ └───────────────────────────────────────┘ │
│ Demo accounts (dev only) ▾                │  collapsible list: role · email, password shown once
└───────────────────────────────────────────┘
```

- Card width 400px, vertically centered, `--background` page.
- The demo panel is shown only when `process.env.NODE_ENV !== "production"`. Clicking an email
  fills the form.
- 429 → "Too many attempts. Try again in a few minutes."
- After success, go to `?next=` if it is a same-origin path, otherwise `/dashboard`.

### `/dashboard`

```text
Dashboard                                   Good morning, Asha
┌────────────┐┌────────────┐┌────────────┐┌────────────┐
│ Active     ││ Open tasks ││ Assigned   ││ Overdue    │
│ projects 2 ││ 7          ││ to me 3    ││ 2 ⚠        │
└────────────┘└────────────┘└────────────┘└────────────┘
Recent projects                         View all →
┌──────────────────────────────────────────────────────┐
│ Website Redesign   Priya   6 tasks   1/6 done   2h ago│ (5 rows max)
└──────────────────────────────────────────────────────┘
My open tasks                           View all →
┌──────────────────────────────────────────────────────┐
│ ● Design new homepage hero  Website…  High  Due Oct 21 (overdue) │
└──────────────────────────────────────────────────────┘
```

- "Open tasks" is `todo + inProgress`. Overdue counts in `--destructive` with the
  `AlertTriangle` icon.
- Cards are 4 columns on desktop, 2 on mobile.
- Empty: "You're not on any projects yet. An admin can add you to one."

### `/projects`

```text
Projects                                              [+ New project]*  (*Admin)
[🔍 Search projects…        ]   ( Active | Archived )   segmented toggle
┌────────────────────┬──────────┬───────┬───────────┬──────────┬─────────┬───┐
│ Project            │ Manager  │ Tasks │ Completed │ State    │ Updated │   │
├────────────────────┼──────────┼───────┼───────────┼──────────┼─────────┼───┤
│ Website Redesign   │ (PM)Priya│ 6     │ 1 of 6    │ Active   │ 2h ago  │ ⋯ │
│ my role: Manager   │          │       │ ▓░░░░ 17% │          │         │   │
└────────────────────┴──────────┴───────┴───────────┴──────────┴─────────┴───┘
Showing 1–2 of 2                                              [Prev] [Next]
```

- The row's project name links to `/projects/:id/tasks`. The whole row is **not** clickable;
  only the link is.
- `⋯` menu items appear only when the capability allows: Edit details, Archive/Restore, Delete.
- Completed shows a mini progress bar (4px tall, `--primary`) plus text.
- **New project dialog:** Name\*, Description, Manager\* (a select of active PM accounts, from
  `GET /users?role=PROJECT_MANAGER&isActive=true`).
- URL holds `q`, `archived` and `page`, so reloads and back navigation keep the state.

### `/projects/:id` (Overview) · `/projects/:id/tasks` · `/projects/:id/team`

Shared project header (in `projects/[id]/layout.tsx`):

```text
← Projects
Website Redesign   [Active|Archived badge]   [Your role: Manager]        [⋯ actions]
Manager: (PM) Priya Manager · 4 members
( Overview | Tasks | Team )                                   tabs = links, aria-current
[ArchivedBanner if archived]
```

**Overview:** a description card (plain text, `whitespace-pre-wrap`; Edit button if
`canEditDetails`), a 4-card task summary (To do, In progress, Done, Overdue) and a lifecycle
card for Admin (Archive/Restore, Delete project, Change manager).

**Tasks:**

```text
[🔍 Search tasks…]  [Status ▾] [Priority ▾] [Assignee ▾]   Sort: [Updated ▾][↓]   [+ New task]*
┌─────────────────────────────┬─────────────┬──────────┬───────────┬───────────┬─────────┬───┐
│ Title                       │ Status      │ Priority │ Assignee  │ Due date  │ Updated │   │
├─────────────────────────────┼─────────────┼──────────┼───────────┼───────────┼─────────┼───┤
│ Concurrent editing demo     │ ○ To do     │ = Medium │ (MM) Meera│ Oct 26    │ 1h ago  │ ⋯ │
│ Design new homepage hero    │ ◉ In prog.  │ ↑ High   │ (MM) Meera│ Oct 21 ⚠  │ 3h ago  │ ⋯ │
└─────────────────────────────┴─────────────┴──────────┴───────────┴───────────┴─────────┴───┘
```

- The title links to `/tasks/:id`.
- The Status cell is a dropdown **only** if `editableFields` includes `status` and the project is
  active. Choosing a value sends `PATCH {version, status}` and runs the conflict flow on 409.
  Otherwise it is a plain badge.
- The `⋯` menu has Open, Edit (dialog) and Delete (if `canDelete`).
- Overdue due dates show in red with `AlertTriangle` and the screen-reader text "overdue".
- Assignee filter options: Anyone, Unassigned, Me, then members.
- **New/Edit task dialog** (manager/Admin): Title\*, Description (textarea, 6 rows), Status,
  Priority, Assignee (select, "Unassigned" first, from `members?assignable=true`), Due date
  (`<input type="date">` with a clear button).

**Board view (S10).** A **List | Board** toggle (buttons with `aria-pressed`, state in the URL as
`?view=board`) sits at the start of the toolbar on `/projects/:id/tasks` only (not on My Tasks).

```text
[List|Board] [🔍 Search…] [Priority ▾] [Assignee ▾]                          [+ New task]*
┌ ○ To do · 3 ───────────┐ ┌ ◉ In progress · 2 ─────┐ ┌ ✓ Done · 1 ───────────┐
│ ┌────────────────────┐ │ │ ┌────────────────────┐ │ │                       │
│ │ Write checklist  ⋯ │ │ │ │ Design hero      ⋯ │ │ │   Drop a task here    │
│ │ = Medium  (MM) Meera│ │ │ │ ↑ High  Oct 21 ⚠   │ │ │                       │
│ └────────────────────┘ │ │ └────────────────────┘ │ │                       │
└────────────────────────┘ └────────────────────────┘ └───────────────────────┘
```

- Three columns by status, in order To do, In progress, Done. The Status filter and the sort
  control are hidden in this view (the column is the status; cards are newest-updated first).
  Search, Priority and Assignee filters still apply.
- The board loads up to 100 tasks (`pageSize=100`). If the project has more, a note says
  "Showing the 100 most recently updated tasks. Use filters or the list view for the rest."
- A card shows the title (links to `/tasks/:id`), priority badge, assignee chip and due date
  (overdue style as in the list).
- **Moving a card** sends exactly the list view's `PATCH {version, status}`: drag a card onto
  another column, or use the card's **Move to** menu (keyboard and touch path). Both exist only
  if `editableFields` includes `status` and the project is active; otherwise the card is plain.
- While the request runs the card appears in the target column, dimmed (`aria-busy`). Nothing is
  optimistic: on success the lists refetch, on any error the card returns to its column.
- On 409 `TASK_VERSION_CONFLICT` the card returns, the data is refetched, and a toast says
  "Someone updated this task — refreshed to the latest version." with an **Open task** action.
  The mutation is never retried (`03 §7`).
- Dragging uses native HTML drag and drop (no new dependency). Touch devices and keyboard users
  use the Move to menu. Columns are `role="group"` with the status name and count as the label.

**Team:**

```text
Team (4)                                                       [+ Add member]*
┌────────────────────┬──────────────────────────┬──────────────┬───────────┬───┐
│ Name               │ Email                    │ Project role │ Joined    │   │
├────────────────────┼──────────────────────────┼──────────────┼───────────┼───┤
│ (PM) Priya Manager │ manager@neostat.test     │ Manager 👑   │ Oct 23    │   │
│ (MM) Meera Member  │ member@neostat.test      │ [Member ▾]   │ Oct 23    │ ⋯ │
│ (II) Isha Inactive │ inactive@neostat.test    │ Member · Inactive │ …    │ ⋯ │
└────────────────────┴──────────────────────────┴──────────────┴───────────┴───┘
```

- The role dropdown appears only if `canManageTeam`. Options are limited by the account ceiling
  (a Viewer account shows only Viewer, and the dropdown is disabled with a tooltip "Account role
  allows Viewer only").
- The manager row has no actions. Admin sees **Change manager** in the page actions.
- **Add member dialog:** a searchable candidate list (`member-candidates?q=`) and a role select.
- **Remove / downgrade confirm:** "Remove Meera Member from Website Redesign? Their 2 assigned
  tasks will become unassigned. Their comments stay." (The count comes from the visible task list
  query with `assigneeId=userId`.)
- **Change manager dialog:** a select of active PM accounts. Note: "Priya Manager will stay on the
  project as a Team Member."

### `/tasks` (My Tasks)

The same task table component with `assigneeId=me` fixed, plus a **Project** column after Title.
No "New task" button. Empty: "Nothing assigned to you. Tasks assigned to you across projects
appear here."

### `/tasks/:id`

```text
← Website Redesign / Tasks
┌──────────────────────────────────────────────┬──────────────────────────┐
│ Concurrent editing demo            v3        │ Status    [○ To do ▾]    │
│ ┌──────────────────────────────────────────┐ │ Priority  [= Medium ▾]   │
│ │ Title  [ Concurrent editing demo       ] │ │ Assignee  [(MM) Meera ▾] │
│ │ Description                              │ │ Due date  [2026-10-26 ×] │
│ │ [                                      ] │ │ ──────────────────────── │
│ │ [                                      ] │ │ Created by Priya · Oct 23│
│ └──────────────────────────────────────────┘ │ Updated by Meera · 2m ago│
│ [Cancel]                [Save changes]       │ [🗑 Delete task]*         │
├──────────────────────────────────────────────┴──────────────────────────┤
│ Comments (2)                                                            │
│ [ Write a comment…                                         ] [Comment]  │
│ (PM) Priya · 2h ago                                              [🗑]   │
│   Kicking this off — Meera, please take the first pass.                 │
└─────────────────────────────────────────────────────────────────────────┘
```

- Main column 2/3, sidebar 1/3. On mobile the sidebar stacks **above** the comments.
- A single form contains all editable fields, and one **Save changes** button sends only the
  dirty fields plus the `version`. The button is disabled until the form is dirty, and shows
  "Saving…" while pending.
- Fields not in `editableFields` render as read-only text with the same layout (not disabled
  inputs).
- The version label `v3` is muted, with the tooltip "Edit version — used to detect conflicting
  saves".
- Viewer, or archived project: no inputs, and a lock note: "You have view-only access to this
  task." / the archived banner.
- Comments: newest first, a "Load more" button, and the composer is hidden for viewers or when
  archived. Body is plain text (`whitespace-pre-wrap`, never `dangerouslySetInnerHTML`).
  The delete icon appears if `canDelete`, with a confirm.

### `/users` (Admin)

```text
Users                                                      [+ New user]
[🔍 Search…]  [Role ▾]  [Active ▾]
┌────────────────────┬────────────────────────┬──────────────┬──────────┬───┐
│ Name               │ Email                  │ Account role │ State    │   │
│ (AA) Asha Admin    │ admin@neostat.test     │ Admin        │ ● Active │ ⋯ │
│ (II) Isha Inactive │ inactive@neostat.test  │ Member       │ ○ Inactive│ ⋯│
└────────────────────┴────────────────────────┴──────────────┴──────────┴───┘
```

- `⋯` menu: Edit, Reset password, Deactivate / Reactivate. Your own row shows no
  Deactivate and no role change (tooltip "You can't change your own access").
- **Deactivate confirm:** "Deactivate Meera Member? They'll be signed out everywhere and
  unassigned from their open tasks in all projects. Their memberships and comments stay."
- 409 errors are shown inline in the dialog in human terms, e.g. ROLE_CONFLICT → "Remove or
  downgrade these memberships first:" followed by a list of project links.
- A non-Admin who navigates here sees the `StateView` forbidden state.

### `/profile`

A card with name (editable), email, account role and a list of "Your projects" with project
roles. Save shows a toast "Profile updated".

## 5. States (`StateView`) — every page must handle all of these

| State | Visual | Copy (example) |
| --- | --- | --- |
| Loading | Skeleton rows (5) or skeleton cards. Never a blank page | — |
| Empty (no data yet) | Icon + title + hint + optional primary action | "No tasks yet" / "Create the first task for this project." |
| No matches | Icon `SearchX` + "Clear filters" button | "No tasks match these filters." |
| Error (recoverable) | Icon `CloudOff` + **Retry** button | "We couldn't load tasks. Check your connection and try again." |
| Not found / out of scope (404) | Icon `FileQuestion` + back link | "This project doesn't exist or you don't have access to it." |
| Forbidden (403 page-level) | Icon `Lock` | "Only admins can manage users." |
| Archived | `ArchivedBanner` + write controls hidden | per §4 |
| Insufficient permission (action) | Control hidden. Where its absence would confuse, a disabled control with a tooltip giving the reason | "Only the project manager can assign tasks." |
| Session expired (401) | Toast "Your session expired. Sign in again." → `/login?next=…` | |

Toasts (sonner, bottom-right, 4 s): success for each mutation ("Task saved", "Member added"…).
Errors use the API `message`. `role="status"` / `aria-live` is built into sonner.

## 6. Conflict experience

When a task form opens, keep `{ base: Task, draft: FormValues }`. Background refetches update the
**query cache** but never reset a dirty form (RHF `values` is not bound to query data while the
form is dirty).

On `409 TASK_VERSION_CONFLICT`:

```text
┌─ This task was changed by someone else ───────────────────────────────┐
│ Meera Member saved a newer version (v4) 2 minutes ago.                 │
│ Your changes have not been saved.                                      │
│                                                                        │
│ Field        Latest (v4)            Your change                        │
│ ─────────────────────────────────────────────────────────────────────  │
│ Status       ◉ In progress          ✓ Done                             │
│ Title        Concurrent editing…    Concurrent editing demo (final)    │
│                                                                        │
│ [Copy my changes]        [Reload latest]   [Re-apply my changes]      │
└────────────────────────────────────────────────────────────────────────┘
```

- Rows list only the fields the user changed. Each row shows the latest value next to theirs, and
  marks fields where the latest value also changed from the base with the "changed by them too"
  dot (`--warning-fg`).
- **Reload latest**: if the draft has changes, show a confirm "Discard your changes and load the
  latest version?" Then reset the form to `currentTask` and set the base to it.
- **Re-apply my changes**: set the base to `currentTask`, keep the draft values, re-check
  `editableFields` from `currentTask.capabilities` (remove fields no longer allowed and tell the
  user), then **the user presses Save again**. There is no automatic resubmit.
- **P1:** a per-row radio "Keep latest / Use mine" (default Latest) replaces the two-button choice.
- A second conflict repeats the same flow.
- **Delete conflict:** "This task changed since you opened it" with the latest summary and a new
  "Delete anyway (v4)" confirm that sends the new version.
- **Lost permission (403 or 404 on save):** keep the form read-only with a **Copy my changes**
  button (copies a plain-text summary to the clipboard) and the message "You no longer have
  permission to edit this task." For 404: "This task was deleted or you lost access."
- Inline status changes in tables: a 409 shows a toast "Someone updated this task — refreshed to
  the latest version." and the row refreshes. No draft exists, so nothing is lost.

## 7. Data fetching rules (TanStack Query)

- `QueryClient` defaults: `staleTime: 10_000`, `refetchOnWindowFocus: true`, `retry`: queries
  retry once only for network errors or 5xx, never for 4xx. `mutations.retry: 0`.
- **P1:** `refetchInterval: 30_000` on list and detail queries while
  `document.visibilityState === "visible"`.
- Query keys: `[userId, "projects", filters]`, `[userId, "project", id]`,
  `[userId, "tasks", filters]`, `[userId, "task", id]`, `[userId, "comments", taskId, page]`,
  `[userId, "members", projectId, filters]`, `[userId, "users", filters]`, `[userId, "dashboard"]`.
- On mutation success, invalidate: task → `task`, `tasks`, `project`, `dashboard`. Membership →
  `members`, `project`, `tasks`. Project lifecycle → `projects`, `project`, `dashboard`.
- Logout or a 401 → `queryClient.clear()` and route to `/login`. The CSRF token is held in memory
  (a React context), never in localStorage.
- Writes wait for the server. **No optimistic UI** for task edits, because the version must come
  from the server.

## 8. Accessibility checklist

- Every input has a `<Label>`. Icon-only buttons have `aria-label` ("Task actions", "Delete
  comment").
- Field errors: `aria-invalid` plus `aria-describedby` pointing at the error text (shadcn `form`
  does this).
- Dialogs: Radix traps focus, closes on Escape and returns focus to the trigger.
- Headings: one `h1` per page (PageHeader). Sections use `h2`.
- Tables: `<th scope="col">` and a `<caption className="sr-only">`.
- Visible focus ring on every interactive element (`focus-visible:ring-2 ring-ring
  ring-offset-2`).
- Color contrast ≥ 4.5:1 for text (the token pairs above meet this).
- Conflict and submission errors are announced (dialog title, plus `role="alert"` for inline
  errors).
- Keyboard check before submission: login → open task → edit → save → comment → delete-comment
  dialog, all without a mouse.
