"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ProjectActions } from "@/components/projects/project-dialogs";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries";

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);
  const [editing, setEditing] = useState(false);
  if (!project) return null;
  const counts = project.taskCounts;
  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Description</h2>
          {project.capabilities.canEditDetails && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
        </div>
        <p className="whitespace-pre-wrap text-sm">{project.description || <span className="text-muted-foreground">No description yet.</span>}</p>
      </section>
      <section aria-label="Task summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["To do", counts.todo], ["In progress", counts.inProgress], ["Done", counts.done], ["Overdue", counts.overdue]].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${label === "Overdue" && Number(value) > 0 ? "text-destructive" : ""}`}>{value}</p>
          </div>
        ))}
      </section>
      {editing && <ProjectActions project={project} action="edit" onClose={() => setEditing(false)} />}
    </div>
  );
}
