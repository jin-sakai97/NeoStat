"use client";

import { PageHeader } from "@/components/page-header";
import { TaskTable } from "@/components/tasks/task-table";

export default function MyTasksPage() {
  return (
    <>
      <PageHeader title="My Tasks" subtitle="Tasks assigned to you in active projects." />
      <TaskTable mine />
    </>
  );
}
