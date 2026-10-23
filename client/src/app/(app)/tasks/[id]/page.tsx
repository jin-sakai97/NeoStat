"use client";

import { ArrowLeft, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArchivedBanner } from "@/components/archived-banner";
import { LoadingRows, QueryError } from "@/components/state-view";
import { Comments } from "@/components/tasks/comments";
import { History } from "@/components/tasks/history";
import { DeleteTaskDialog } from "@/components/tasks/task-dialog";
import { TaskForm } from "@/components/tasks/task-form";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useProject, useTask } from "@/lib/queries";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const task = useTask(id);
  const project = useProject(task.data?.projectId ?? "");
  const [deleting, setDeleting] = useState(false);

  if (task.isPending) return <LoadingRows />;
  if (task.isError) {
    return (
      <>
        <Link href="/tasks" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />My Tasks</Link>
        <div className="rounded-lg border bg-card"><QueryError error={task.error} retry={() => task.refetch()} what="task" /></div>
      </>
    );
  }
  const t = task.data;
  const archived = !!project.data?.archivedAt;
  const readOnly = t.capabilities.editableFields.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          <Link href={`/projects/${t.projectId}/tasks`} className="hover:text-foreground hover:underline">{t.projectName}</Link>
          <span aria-hidden>/</span><span>Tasks</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="text-xl font-semibold break-words">{t.title}</h1>
            <Tooltip>
              <TooltipTrigger asChild><span tabIndex={0} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">v{t.version}</span></TooltipTrigger>
              <TooltipContent>Edit version — used to detect conflicting saves</TooltipContent>
            </Tooltip>
          </div>
          {t.capabilities.canDelete && <Button variant="destructive" className="h-9" onClick={() => setDeleting(true)}><Trash2 />Delete task</Button>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Created by {t.createdBy.name} · <time dateTime={t.createdAt} title={formatDateTime(t.createdAt)}>{timeAgo(t.createdAt)}</time>
          {" · "}Updated by {t.updatedBy.name} · <time dateTime={t.updatedAt} title={formatDateTime(t.updatedAt)}>{timeAgo(t.updatedAt)}</time>
        </p>
      </div>
      {archived && <ArchivedBanner />}
      {readOnly && !archived && (
        <p className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"><Lock className="size-4" aria-hidden />You have view-only access to this task.</p>
      )}
      <TaskForm key={t.id} projectId={t.projectId} task={t} layout="page" />
      <Comments task={t} />
      <History task={t} />
      {deleting && <DeleteTaskDialog task={t} onClose={() => setDeleting(false)} onDeleted={() => router.push(`/projects/${t.projectId}/tasks`)} />}
    </div>
  );
}
