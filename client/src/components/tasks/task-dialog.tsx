"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, isApiError } from "@/lib/api";
import { TASK_FAMILIES, useApiMutation } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { TaskForm } from "./task-form";

export function TaskDialog({ projectId, task, open, onOpenChange }: { projectId: string; task?: Task; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>{task ? `Editing version ${task.version}.` : "New tasks start as To do with Medium priority unless you change them."}</DialogDescription>
        </DialogHeader>
        <TaskForm projectId={projectId} task={task} layout="dialog" onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

// Deletion also sends the version; a conflict asks for a fresh confirmation against the latest version.
export function DeleteTaskDialog({ task, onClose, onDeleted }: { task: Task; onClose: () => void; onDeleted?: () => void }) {
  const [target, setTarget] = useState(task);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation((version: number) => api(`/tasks/${task.id}`, { method: "DELETE", body: { version } }), TASK_FAMILIES);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={target.version === task.version ? "Delete this task?" : "This task changed since you opened it"}
      description={target.version === task.version
        ? <>“{task.title}” and all its comments will be permanently deleted.</>
        : <>{target.updatedBy.name} updated it. Latest: “{target.title}”, version {target.version}. Delete it anyway?</>}
      confirmLabel={target.version === task.version ? "Delete task" : `Delete anyway (v${target.version})`}
      pending={mutation.isPending}
      error={error}
      onConfirm={() => mutation.mutate(target.version, {
        onSuccess: () => { toast.success("Task deleted"); onClose(); onDeleted?.(); },
        onError: (err) => {
          if (isApiError(err, "TASK_VERSION_CONFLICT")) { setTarget(err.details.currentTask as Task); setError(null); }
          else setError(err.message);
        },
      })}
    />
  );
}
