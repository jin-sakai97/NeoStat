import { CloudOff, FileQuestion, Inbox, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";

type Kind = "empty" | "no-results" | "error" | "not-found" | "forbidden";

const ICONS = { empty: Inbox, "no-results": SearchX, error: CloudOff, "not-found": FileQuestion, forbidden: Lock };

export function StateView({ kind, title, hint, action }: { kind: Kind; title: string; hint?: string; action?: ReactNode }) {
  const Icon = ICONS[kind];
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center" role={kind === "error" ? "alert" : undefined}>
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// Maps a failed query to the right page-level state (404 out of scope, 403, or retryable error).
export function QueryError({ error, retry, what }: { error: unknown; retry: () => void; what: string }) {
  if (error instanceof ApiError && error.status === 404) {
    return <StateView kind="not-found" title={`This ${what} doesn't exist or you don't have access to it.`} />;
  }
  if (error instanceof ApiError && error.status === 403) {
    return <StateView kind="forbidden" title={error.message} />;
  }
  return (
    <StateView
      kind="error"
      title={`We couldn't load ${what === "users" || what === "tasks" || what === "projects" ? what : `this ${what}`}.`}
      hint={error instanceof Error ? error.message : undefined}
      action={<Button variant="outline" onClick={retry}>Retry</Button>}
    />
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}
