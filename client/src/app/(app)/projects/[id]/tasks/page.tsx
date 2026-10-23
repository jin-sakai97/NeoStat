"use client";

import { useParams } from "next/navigation";
import { TaskTable } from "@/components/tasks/task-table";
import { useProject } from "@/lib/queries";

export default function ProjectTasksPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);
  if (!project) return null;
  return <TaskTable projectId={id} canCreate={project.capabilities.canCreateTasks} archived={!!project.archivedAt} />;
}
