import { ArrowDown, ArrowUp, Circle, CircleCheck, CircleDot, Equal } from "lucide-react";
import { PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/format";
import type { AccountRole, ProjectRole, TaskPriority, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

// Icon + text, never color alone (specs/06-design.md §1).
export const STATUS_STYLE: Record<TaskStatus, { icon: typeof Circle; className: string }> = {
  TODO: { icon: Circle, className: "bg-[#f2f4f7] text-[#344054]" },
  IN_PROGRESS: { icon: CircleDot, className: "bg-[#eff8ff] text-[#175cd3]" },
  DONE: { icon: CircleCheck, className: "bg-[#ecfdf3] text-[#067647]" },
};

export const PRIORITY_STYLE: Record<TaskPriority, { icon: typeof Circle; className: string }> = {
  LOW: { icon: ArrowDown, className: "bg-[#f2f4f7] text-[#475467]" },
  MEDIUM: { icon: Equal, className: "bg-[#fffaeb] text-[#b54708]" },
  HIGH: { icon: ArrowUp, className: "bg-[#fef3f2] text-[#b42318]" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { icon: Icon, className } = STATUS_STYLE[status];
  return <span className={cn(pill, className)}><Icon className="size-3" aria-hidden />{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { icon: Icon, className } = PRIORITY_STYLE[priority];
  return <span className={cn(pill, className)}><Icon className="size-3" aria-hidden />{PRIORITY_LABEL[priority]}</span>;
}

export function RoleBadge({ role }: { role: AccountRole | ProjectRole | "ADMIN" }) {
  return (
    <span className={cn(pill, "border border-border bg-card", role === "ADMIN" ? "text-primary" : "text-muted-foreground")}>
      {ROLE_LABEL[role]}
    </span>
  );
}

export function StateBadge({ archived }: { archived: boolean }) {
  return archived
    ? <span className={cn(pill, "bg-warning-bg text-warning-fg")}>Archived</span>
    : <span className={cn(pill, "bg-[#ecfdf3] text-[#067647]")}>Active</span>;
}
