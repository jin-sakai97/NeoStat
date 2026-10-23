"use client";

import { AlertTriangle, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PriorityBadge, STATUS_STYLE } from "@/components/badges";
import { Pager } from "@/components/pager";
import { SearchInput } from "@/components/search-input";
import { LoadingRows, QueryError, StateView } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserChip } from "@/components/user-avatar";
import { api, isApiError } from "@/lib/api";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import { TASK_FAMILIES, useApiMutation, useMembers, useTasks } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";
import { useSearchState } from "@/lib/use-search-state";
import { DeleteTaskDialog, TaskDialog } from "./task-dialog";

const ANY = "__any";
const FILTER_KEYS = ["q", "status", "priority", "assignee", "sort", "order", "page"] as const;

function InlineStatus({ task }: { task: Task }) {
  const mutation = useApiMutation(
    (status: TaskStatus) => api(`/tasks/${task.id}`, { method: "PATCH", body: { version: task.version, status } }),
    TASK_FAMILIES,
  );
  const editable = task.capabilities.editableFields.includes("status");
  const { icon: Icon, className } = STATUS_STYLE[task.status];
  if (!editable) {
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}><Icon className="size-3" aria-hidden />{STATUS_LABEL[task.status]}</span>;
  }
  return (
    <Select value={task.status} disabled={mutation.isPending} onValueChange={(status) =>
      mutation.mutate(status as TaskStatus, {
        onSuccess: () => toast.success("Status updated"),
        onError: (error) => {
          if (isApiError(error, "TASK_VERSION_CONFLICT")) toast.warning("Someone updated this task — refreshed to the latest version.");
          else toast.error(error.message);
        },
      })}>
      <SelectTrigger size="sm" aria-label={`Status of ${task.title}`} className={`h-7 border-0 ${className}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((status) => <SelectItem key={status} value={status}>{STATUS_LABEL[status]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

type Props = { projectId?: string; mine?: boolean; canCreate?: boolean; archived?: boolean };

export function TaskTable({ projectId, mine, canCreate, archived }: Props) {
  const [filters, setFilters] = useSearchState(FILTER_KEYS);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const members = useMembers(projectId ?? "", { enabled: !!projectId });

  const query = {
    projectId,
    archived: archived ? true : undefined,
    assigneeId: mine ? "me" : filters.assignee || undefined,
    q: filters.q, status: filters.status, priority: filters.priority,
    sort: filters.sort || "updatedAt", order: filters.order || "desc", page: filters.page || 1,
  };
  const tasks = useTasks(query);
  const filtered = !!(filters.q || filters.status || filters.priority || filters.assignee);

  const select = (key: "status" | "priority" | "assignee", label: string, options: [string, string][]) => (
    <Select value={filters[key] || ANY} onValueChange={(value) => setFilters({ [key]: value === ANY ? "" : value })}>
      <SelectTrigger aria-label={label} className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{`Any ${label.toLowerCase()}`}</SelectItem>
        {options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput label="Search tasks" value={filters.q} onChange={(q) => setFilters({ q })} />
        {select("status", "Status", Object.entries(STATUS_LABEL))}
        {select("priority", "Priority", Object.entries(PRIORITY_LABEL))}
        {projectId && select("assignee", "Assignee", [["unassigned", "Unassigned"], ["me", "Me"],
          ...(members.data?.data ?? []).map((m) => [m.user.id, m.user.name] as [string, string])])}
        <Select value={`${filters.sort || "updatedAt"}:${filters.order || "desc"}`} onValueChange={(value) => {
          const [sort, order] = value.split(":");
          setFilters({ sort, order });
        }}>
          <SelectTrigger aria-label="Sort" className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt:desc">Recently updated</SelectItem>
            <SelectItem value="dueDate:asc">Due date (soonest)</SelectItem>
            <SelectItem value="priority:desc">Priority (high first)</SelectItem>
            <SelectItem value="status:asc">Status</SelectItem>
            <SelectItem value="title:asc">Title (A–Z)</SelectItem>
          </SelectContent>
        </Select>
        {canCreate && <Button className="h-9 sm:ml-auto" onClick={() => setCreating(true)}><Plus />New task</Button>}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {tasks.isPending ? <LoadingRows /> : tasks.isError ? <QueryError error={tasks.error} retry={() => tasks.refetch()} what="tasks" /> :
          tasks.data.data.length === 0 ? (
            filtered
              ? <StateView kind="no-results" title="No tasks match these filters." action={<Button variant="outline" onClick={() => setFilters({ q: "", status: "", priority: "", assignee: "" })}>Clear filters</Button>} />
              : mine
                ? <StateView kind="empty" title="Nothing assigned to you" hint="Tasks assigned to you across projects appear here." />
                : <StateView kind="empty" title="No tasks yet" hint={canCreate ? "Create the first task for this project." : "Tasks will appear here once the manager adds them."} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">{mine ? "Tasks assigned to me" : "Project tasks"}</TableCaption>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead scope="col" className="min-w-56">Title</TableHead>
                      {mine && <TableHead scope="col">Project</TableHead>}
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Priority</TableHead>
                      <TableHead scope="col">Assignee</TableHead>
                      <TableHead scope="col">Due date</TableHead>
                      <TableHead scope="col">Updated</TableHead>
                      <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.data.data.map((task) => (
                      <TableRow key={task.id} className="h-11">
                        <TableCell className="max-w-80"><Link href={`/tasks/${task.id}`} className="block truncate font-medium hover:text-primary hover:underline" title={task.title}>{task.title}</Link></TableCell>
                        {mine && <TableCell><Link href={`/projects/${task.projectId}/tasks`} className="text-muted-foreground hover:underline">{task.projectName}</Link></TableCell>}
                        <TableCell><InlineStatus task={task} /></TableCell>
                        <TableCell><PriorityBadge priority={task.priority} /></TableCell>
                        <TableCell className="max-w-44"><UserChip user={task.assignee} /></TableCell>
                        <TableCell className="whitespace-nowrap">
                          {task.dueDate ? (
                            <span className={task.isOverdue ? "inline-flex items-center gap-1 font-medium text-destructive" : ""}>
                              {task.isOverdue && <AlertTriangle className="size-3.5" aria-hidden />}
                              {formatDate(task.dueDate)}{task.isOverdue && <span className="sr-only"> (overdue)</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(task.updatedAt)}</TableCell>
                        <TableCell className="w-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${task.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild><Link href={`/tasks/${task.id}`}>Open</Link></DropdownMenuItem>
                              {task.capabilities.editableFields.length > 0 && <DropdownMenuItem onSelect={() => setEditing(task)}>Edit</DropdownMenuItem>}
                              {task.capabilities.canDelete && <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(task)}>Delete</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pager meta={tasks.data.meta} onPage={(page) => setFilters({ page: String(page) }, false)} />
            </>
          )}
      </div>

      {projectId && creating && <TaskDialog projectId={projectId} open onOpenChange={setCreating} />}
      {editing && <TaskDialog projectId={editing.projectId} task={editing} open onOpenChange={(open) => !open && setEditing(null)} />}
      {deleting && <DeleteTaskDialog task={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
