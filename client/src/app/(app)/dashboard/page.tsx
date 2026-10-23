"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { QueryError, StateView } from "@/components/state-view";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/lib/auth";
import { formatDate, timeAgo } from "@/lib/format";
import { useDashboard } from "@/lib/queries";

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums ${alert && value > 0 ? "text-destructive" : ""}`}>
        {value}{alert && value > 0 && <AlertTriangle className="size-5" aria-label="needs attention" />}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const user = useUser();
  const dashboard = useDashboard();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${greeting}, ${user.name.split(" ")[0]}`} />
      {dashboard.isPending ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : dashboard.isError ? (
        <div className="rounded-lg border bg-card"><QueryError error={dashboard.error} retry={() => dashboard.refetch()} what="dashboard" /></div>
      ) : dashboard.data.activeProjectCount === 0 ? (
        <div className="rounded-lg border bg-card"><StateView kind="empty" title="You're not on any projects yet" hint="An admin can add you to one." /></div>
      ) : (
        <div className="space-y-6">
          <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active projects" value={dashboard.data.activeProjectCount} />
            <Stat label="Open tasks" value={dashboard.data.taskCounts.todo + dashboard.data.taskCounts.inProgress} />
            <Stat label="Assigned to me" value={dashboard.data.assignedToMeOpen} />
            <Stat label="Overdue" value={dashboard.data.overdue} alert />
          </section>
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">Recent projects</h2>
              <Link href="/projects" className="text-sm text-primary hover:underline">View all →</Link>
            </div>
            <ul className="divide-y">
              {dashboard.data.recentProjects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <Link href={`/projects/${p.id}/tasks`} className="min-w-40 flex-1 font-medium hover:text-primary hover:underline">{p.name}</Link>
                  <span className="text-muted-foreground">{p.manager?.name ?? "No manager"}</span>
                  <span className="tabular-nums">{p.taskCounts.done}/{p.taskCounts.total} done</span>
                  <span className="text-muted-foreground">{timeAgo(p.updatedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">My open tasks</h2>
              <Link href="/tasks" className="text-sm text-primary hover:underline">View all →</Link>
            </div>
            {dashboard.data.myTasks.length === 0 ? <StateView kind="empty" title="Nothing assigned to you right now." /> : (
              <ul className="divide-y">
                {dashboard.data.myTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <StatusBadge status={t.status} />
                    <Link href={`/tasks/${t.id}`} className="min-w-40 flex-1 font-medium hover:text-primary hover:underline">{t.title}</Link>
                    <span className="text-muted-foreground">{t.projectName}</span>
                    <PriorityBadge priority={t.priority} />
                    {t.dueDate && <span className={t.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}>Due {formatDate(t.dueDate)}{t.isOverdue && " (overdue)"}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {dashboard.isFetching && !dashboard.isPending && <span className="sr-only" role="status">Refreshing</span>}
    </>
  );
}
