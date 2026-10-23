"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RoleBadge, StateBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { ProjectActions, ProjectDialog, type ProjectAction } from "@/components/projects/project-dialogs";
import { SearchInput } from "@/components/search-input";
import { LoadingRows, QueryError, StateView } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserChip } from "@/components/user-avatar";
import { useUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { useProjects } from "@/lib/queries";
import type { Project } from "@/lib/types";
import { useSearchState } from "@/lib/use-search-state";

export default function ProjectsPage() {
  const user = useUser();
  const [filters, setFilters] = useSearchState(["q", "archived", "page"] as const);
  const archived = filters.archived === "true";
  const projects = useProjects({ q: filters.q, archived, page: filters.page || 1 });
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<{ project: Project; action: ProjectAction } | null>(null);

  return (
    <>
      <PageHeader title="Projects" actions={user.role === "ADMIN" && <Button className="h-9" onClick={() => setCreating(true)}><Plus />New project</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput label="Search projects" value={filters.q} onChange={(q) => setFilters({ q })} />
        <div role="group" aria-label="Project state" className="inline-flex rounded-lg border bg-card p-0.5">
          {[["", "Active"], ["true", "Archived"]].map(([value, label]) => (
            <button key={label} type="button" aria-pressed={(filters.archived || "") === value} onClick={() => setFilters({ archived: value })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${(filters.archived || "") === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {projects.isPending ? <LoadingRows /> : projects.isError ? <QueryError error={projects.error} retry={() => projects.refetch()} what="projects" /> :
          projects.data.data.length === 0 ? (
            filters.q ? <StateView kind="no-results" title="No projects match your search." action={<Button variant="outline" onClick={() => setFilters({ q: "" })}>Clear search</Button>} />
              : archived ? <StateView kind="empty" title="No archived projects" />
                : <StateView kind="empty" title="No projects yet" hint={user.role === "ADMIN" ? "Create the first project and choose its manager." : "You're not on any projects yet. An admin can add you to one."} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">{archived ? "Archived projects" : "Active projects"}</TableCaption>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead scope="col" className="min-w-52">Project</TableHead>
                      <TableHead scope="col">Manager</TableHead>
                      <TableHead scope="col">Tasks</TableHead>
                      <TableHead scope="col">Completed</TableHead>
                      <TableHead scope="col">State</TableHead>
                      <TableHead scope="col">Updated</TableHead>
                      <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.data.data.map((p) => {
                      const percent = p.taskCounts.total ? Math.round((p.taskCounts.done / p.taskCounts.total) * 100) : 0;
                      const actions: [ProjectAction, string][] = [
                        ...(p.capabilities.canEditDetails ? [["edit", "Edit details"] as [ProjectAction, string]] : []),
                        ...(p.capabilities.canArchive ? [[p.archivedAt ? "restore" : "archive", p.archivedAt ? "Restore" : "Archive"] as [ProjectAction, string]] : []),
                        ...(p.capabilities.canDelete ? [["delete", "Delete"] as [ProjectAction, string]] : []),
                      ];
                      return (
                        <TableRow key={p.id} className="h-11">
                          <TableCell>
                            <Link href={`/projects/${p.id}/tasks`} className="font-medium hover:text-primary hover:underline">{p.name}</Link>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">Your role: <RoleBadge role={p.myRole} /></div>
                          </TableCell>
                          <TableCell><UserChip user={p.manager} /></TableCell>
                          <TableCell className="tabular-nums">{p.taskCounts.total}</TableCell>
                          <TableCell>
                            <div className="text-sm tabular-nums">{p.taskCounts.done} of {p.taskCounts.total}</div>
                            <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full bg-primary" style={{ width: `${percent}%` }} /></div>
                          </TableCell>
                          <TableCell><StateBadge archived={!!p.archivedAt} /></TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{timeAgo(p.updatedAt)}</TableCell>
                          <TableCell className="w-10">
                            {actions.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {actions.map(([key, label]) => (
                                    <DropdownMenuItem key={key} variant={key === "delete" ? "destructive" : "default"} onSelect={() => setAction({ project: p, action: key })}>{label}</DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pager meta={projects.data.meta} onPage={(page) => setFilters({ page: String(page) }, false)} />
            </>
          )}
      </div>
      {creating && <ProjectDialog onClose={() => setCreating(false)} />}
      {action && <ProjectActions project={action.project} action={action.action} onClose={() => setAction(null)} />}
    </>
  );
}
