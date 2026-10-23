"use client";

import { useState } from "react";
import { LoadingRows, QueryError } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { formatDate, formatDateTime, PRIORITY_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import { useTaskActivity } from "@/lib/queries";
import type { ActivityValue, Task, TaskActivity, TaskField } from "@/lib/types";
import { FIELD_LABEL } from "./task-form";

const NONE: Partial<Record<TaskField, string>> = { assigneeId: "unassigned", dueDate: "no due date", description: "empty" };

function show(field: TaskField, value: ActivityValue) {
  if (value === null || value === "") return NONE[field] ?? "empty";
  if (typeof value === "object") return value.name;
  if (field === "status") return STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value;
  if (field === "priority") return PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL] ?? value;
  if (field === "dueDate") return formatDate(value);
  return value;
}

function Change({ field, change }: { field: TaskField; change: NonNullable<TaskActivity["changes"][TaskField]> }) {
  // Long free text is summarized; the old text is not worth a screen of diff.
  if (field === "description") return <li>Edited the description</li>;
  return (
    <li>
      Changed <span className="font-medium">{FIELD_LABEL[field].toLowerCase()}</span> from{" "}
      <span className="break-words font-medium">{show(field, change.from)}</span> to{" "}
      <span className="break-words font-medium">{show(field, change.to)}</span>
    </li>
  );
}

// Newest first. History is written by the server in the same transaction as each task change.
export function History({ task }: { task: Task }) {
  const [pageSize, setPageSize] = useState(20);
  const activity = useTaskActivity(task.id, pageSize);

  return (
    <section className="rounded-lg border bg-card" aria-labelledby="history-heading">
      <h2 id="history-heading" className="border-b px-4 py-3 font-semibold">History {activity.data && `(${activity.data.meta.total})`}</h2>
      {activity.isPending ? <LoadingRows rows={2} /> : activity.isError ? <QueryError error={activity.error} retry={() => activity.refetch()} what="history" /> :
        activity.data.data.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No recorded changes yet.</p> : (
          <ul className="divide-y">
            {activity.data.data.map((entry) => {
              const fields = Object.keys(entry.changes) as TaskField[];
              return (
                <li key={entry.id} className="flex gap-3 px-4 py-3">
                  <UserAvatar user={entry.actor} className="mt-0.5 size-7" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p>
                      <span className="font-medium">{entry.actor.name}</span>{" "}
                      <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)} className="text-muted-foreground">· {timeAgo(entry.createdAt)} · v{entry.version}</time>
                    </p>
                    {entry.kind === "CREATED" ? <p className="mt-1">Created the task</p> : (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">{fields.map((field) => <Change key={field} field={field} change={entry.changes[field]!} />)}</ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      {activity.data && activity.data.meta.total > activity.data.data.length && (
        <div className="border-t p-3 text-center"><Button variant="outline" size="sm" onClick={() => setPageSize((n) => Math.min(n + 20, 100))}>Load more</Button></div>
      )}
    </section>
  );
}
