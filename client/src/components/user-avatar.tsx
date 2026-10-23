import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLORS = ["bg-indigo-100 text-indigo-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700"];

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function UserAvatar({ user, className }: { user: { id: string; name: string }; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", colorFor(user.id), className)}>
      {initials(user.name)}
    </span>
  );
}

export function UserChip({ user }: { user: { id: string; name: string } | null }) {
  if (!user) return <span className="text-muted-foreground">Unassigned</span>;
  return <span className="inline-flex min-w-0 items-center gap-2"><UserAvatar user={user} /><span className="truncate">{user.name}</span></span>;
}
