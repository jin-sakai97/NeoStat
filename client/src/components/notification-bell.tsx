"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useApiMutation, useNotifications, useUnreadCount } from "@/lib/queries";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

// Where selecting a row goes, or null when the target is no longer visible to the recipient.
const target = (n: Notification) =>
  n.kind === "ADDED_TO_PROJECT" ? (n.project ? `/projects/${n.project.id}/tasks` : null) : n.task ? `/tasks/${n.task.id}` : null;

function Message({ n }: { n: Notification }) {
  const who = <span className="font-medium">{n.actor.name}</span>;
  const quoted = (name: string) => <span className="font-medium">&ldquo;{name}&rdquo;</span>;
  const gone = <span className="text-muted-foreground">a task you can no longer access</span>;
  if (n.kind === "ADDED_TO_PROJECT") return <>{who} added you to {n.project ? <span className="font-medium">{n.project.name}</span> : <span className="text-muted-foreground">a project you can no longer access</span>}</>;
  if (n.kind === "COMMENT_ADDED") return <>{who} commented on {n.task ? quoted(n.task.title) : gone}</>;
  return <>{who} assigned you {n.task ? quoted(n.task.title) : gone}</>;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = useUnreadCount();
  const list = useNotifications(open);
  const markRead = useApiMutation((id: string) => api(`/notifications/${id}/read`, { method: "POST" }), ["notifications"]);
  const markAll = useApiMutation(() => api("/notifications/read-all", { method: "POST" }), ["notifications"]);
  const unread = count.data ?? 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" className="h-7" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate(undefined)}>Mark all read</Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.isPending ? (
            <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : list.isError ? (
            <p role="alert" className="px-3 py-6 text-center text-sm">Couldn&apos;t load notifications. <button className="underline" onClick={() => list.refetch()}>Retry</button></p>
          ) : list.data.data.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            list.data.data.map((n) => (
              <DropdownMenuItem key={n.id} className={cn("items-start gap-2 rounded-none px-3 py-2.5", !n.readAt && "bg-muted")}
                onSelect={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                  const href = target(n);
                  if (href) router.push(href);
                }}>
                <UserAvatar user={n.actor} className="mt-0.5 size-6 shrink-0" />
                <span className="min-w-0 flex-1 text-sm whitespace-normal break-words">
                  <Message n={n} />
                  <span className="mt-0.5 block text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unread" />}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
