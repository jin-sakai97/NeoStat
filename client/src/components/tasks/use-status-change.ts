"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, isApiError } from "@/lib/api";
import { TASK_FAMILIES, useApiMutation } from "@/lib/queries";
import type { Task, TaskStatus } from "@/lib/types";

// The versioned status PATCH shared by the list dropdown and the board (specs/06-design.md §4).
// It waits for the server, never retries, and resolves to whether the change was saved.
export function useStatusChange() {
  const router = useRouter();
  const mutation = useApiMutation(
    ({ task, status }: { task: Task; status: TaskStatus }) => api(`/tasks/${task.id}`, { method: "PATCH", body: { version: task.version, status } }),
    TASK_FAMILIES,
  );

  const change = async (task: Task, status: TaskStatus) => {
    try {
      await mutation.mutateAsync({ task, status });
      toast.success("Status updated");
      return true;
    } catch (error) {
      if (isApiError(error, "TASK_VERSION_CONFLICT")) {
        toast.warning("Someone updated this task — refreshed to the latest version.", {
          action: { label: "Open task", onClick: () => router.push(`/tasks/${task.id}`) },
        });
      } else toast.error(error instanceof Error ? error.message : "Couldn't update the task.");
      return false;
    }
  };

  return { change, isPending: mutation.isPending };
}
