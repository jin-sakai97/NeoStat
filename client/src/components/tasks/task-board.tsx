"use client";

import { AlertTriangle, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PriorityBadge, STATUS_STYLE } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserChip } from "@/components/user-avatar";
import { formatDate, STATUS_LABEL } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStatusChange } from "./use-status-change";

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

type Props = { tasks: Task[]; total: number };

// Kanban view of one project's tasks. Moving a card is the same versioned status PATCH as the
// list view; nothing is optimistic (specs/06-design.md §4, "Board view").
export function TaskBoard({ tasks, total }: Props) {
  const { change } = useStatusChange();
  // taskId -> column it is moving to, while its request is in flight.
  const [pending, setPending] = useState<Record<string, TaskStatus>>({});
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);

  const canMove = (task: Task) => task.capabilities.editableFields.includes("status");

  const move = async (task: Task, status: TaskStatus) => {
    if (status === task.status || pending[task.id]) return;
    setPending((p) => ({ ...p, [task.id]: status }));
    await change(task, status);
    setPending((p) => {
      const next = { ...p };
      delete next[task.id];
      return next;
    });
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((status) => {
          const column = tasks.filter((task) => (pending[task.id] ?? task.status) === status);
          const { icon: Icon } = STATUS_STYLE[status];
          const droppable = dragging !== null && dragging.status !== status;
          return (
            <div
              key={status}
              role="group"
              aria-label={`${STATUS_LABEL[status]}, ${column.length} ${column.length === 1 ? "task" : "tasks"}`}
              className={cn("min-h-40 rounded-lg border bg-muted/40 p-2 transition-colors", over === status && droppable && "border-primary bg-primary/5")}
              onDragOver={(event) => {
                if (!droppable) return;
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (dragging) void move(dragging, status);
                setDragging(null);
              }}
            >
              <h3 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold">
                <Icon className="size-4" aria-hidden />{STATUS_LABEL[status]}
                <span className="font-normal text-muted-foreground tabular-nums">· {column.length}</span>
              </h3>
              {column.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">{droppable ? "Drop a task here" : "No tasks"}</p>
              ) : (
                <ul className="space-y-2">
                  {column.map((task) => {
                    const moving = !!pending[task.id];
                    const movable = canMove(task);
                    return (
                      <li
                        key={task.id}
                        draggable={movable && !moving}
                        aria-busy={moving || undefined}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", task.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragging(task);
                        }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        className={cn(
                          "rounded-md border bg-card p-3 shadow-xs",
                          movable && !moving && "cursor-grab active:cursor-grabbing",
                          moving && "opacity-60",
                          dragging?.id === task.id && "opacity-40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/tasks/${task.id}`} className="min-w-0 break-words text-sm font-medium hover:text-primary hover:underline">{task.title}</Link>
                          {movable && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0" disabled={moving} aria-label={`Move ${task.title}`}><MoreHorizontal /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {COLUMNS.filter((target) => target !== (pending[task.id] ?? task.status)).map((target) => (
                                  <DropdownMenuItem key={target} onSelect={() => void move(task, target)}>Move to {STATUS_LABEL[target]}</DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                          <PriorityBadge priority={task.priority} />
                          {task.dueDate && (
                            <span className={cn("inline-flex items-center gap-1", task.isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                              {task.isOverdue && <AlertTriangle className="size-3.5" aria-hidden />}
                              {formatDate(task.dueDate)}{task.isOverdue && <span className="sr-only"> (overdue)</span>}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs"><UserChip user={task.assignee} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {total > tasks.length && (
        <p className="mt-3 text-sm text-muted-foreground">Showing the {tasks.length} most recently updated tasks. Use filters or the list view for the rest.</p>
      )}
    </div>
  );
}
