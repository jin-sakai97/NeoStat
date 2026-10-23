"use client";

import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ArchivedBanner } from "@/components/archived-banner";
import { RoleBadge, StateBadge } from "@/components/badges";
import { ProjectActions, type ProjectAction } from "@/components/projects/project-dialogs";
import { LoadingRows, QueryError } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProject } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const project = useProject(id);
  const [action, setAction] = useState<ProjectAction | null>(null);

  if (project.isPending) return <LoadingRows />;
  if (project.isError) {
    return (
      <>
        <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Projects</Link>
        <div className="rounded-lg border bg-card"><QueryError error={project.error} retry={() => project.refetch()} what="project" /></div>
      </>
    );
  }
  const p = project.data;
  const caps = p.capabilities;
  const actions: [ProjectAction, string][] = [
    ...(caps.canEditDetails ? [["edit", "Edit details"] as [ProjectAction, string]] : []),
    ...(caps.canAssignManager ? [["manager", "Change manager"] as [ProjectAction, string]] : []),
    ...(caps.canArchive ? [[p.archivedAt ? "restore" : "archive", p.archivedAt ? "Restore project" : "Archive project"] as [ProjectAction, string]] : []),
    ...(caps.canDelete ? [["delete", "Delete project"] as [ProjectAction, string]] : []),
  ];
  const tabs = [["", "Overview"], ["/tasks", "Tasks"], ["/team", "Team"]];

  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Projects</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{p.name}</h1>
            <StateBadge archived={!!p.archivedAt} />
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">Your role: <RoleBadge role={p.myRole} /></span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Manager: {p.manager?.name ?? "None"} · {p.memberCount} {p.memberCount === 1 ? "member" : "members"}</p>
        </div>
        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="h-9"><MoreHorizontal />Project actions</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map(([key, label]) => (
                <DropdownMenuItem key={key} variant={key === "delete" ? "destructive" : "default"} onSelect={() => setAction(key)}>{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <nav aria-label="Project sections" className="mb-6 flex gap-1 border-b">
        {tabs.map(([suffix, label]) => {
          const href = `/projects/${id}${suffix}`;
          const active = pathname === href;
          return (
            <Link key={label} href={href} aria-current={active ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {label}
            </Link>
          );
        })}
      </nav>
      {p.archivedAt && <ArchivedBanner />}
      {children}
      {action && <ProjectActions project={p} action={action} onClose={() => setAction(null)} />}
    </>
  );
}
