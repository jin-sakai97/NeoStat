"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingRows, QueryError } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/format";
import { useApiMutation, useComments } from "@/lib/queries";
import type { Comment, Task } from "@/lib/types";

// Comments never change the task version, so they only refresh the comment list.
export function Comments({ task }: { task: Task }) {
  const [pageSize, setPageSize] = useState(20);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);
  const comments = useComments(task.id, pageSize);
  const create = useApiMutation((text: string) => api(`/tasks/${task.id}/comments`, { method: "POST", body: { body: text } }), ["comments"]);
  const remove = useApiMutation((id: string) => api(`/comments/${id}`, { method: "DELETE" }), ["comments"]);

  return (
    <section className="rounded-lg border bg-card" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="border-b px-4 py-3 font-semibold">Comments {comments.data && `(${comments.data.meta.total})`}</h2>
      {task.capabilities.canComment && (
        <form className="space-y-2 border-b p-4" onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim()) return setError("Write something first.");
          setError(null);
          create.mutate(body, { onSuccess: () => { setBody(""); toast.success("Comment added"); }, onError: (e) => setError(e.message) });
        }}>
          <Label htmlFor="new-comment" className="sr-only">Write a comment</Label>
          <Textarea id="new-comment" rows={3} maxLength={2000} placeholder="Write a comment…" value={body} onChange={(e) => setBody(e.target.value)}
            aria-invalid={!!error} aria-describedby={error ? "comment-error" : undefined} />
          {error && <p id="comment-error" role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={create.isPending}>{create.isPending ? "Posting…" : "Comment"}</Button></div>
        </form>
      )}
      {comments.isPending ? <LoadingRows rows={2} /> : comments.isError ? <QueryError error={comments.error} retry={() => comments.refetch()} what="comments" /> :
        comments.data.data.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">No comments yet.</p> : (
          <ul className="divide-y">
            {comments.data.data.map((c) => (
              <li key={c.id} className="flex gap-3 px-4 py-3">
                <UserAvatar user={c.author} className="mt-0.5 size-7" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-medium">{c.author.name}</span> <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)} className="text-muted-foreground">· {timeAgo(c.createdAt)}</time></p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                </div>
                {c.canDelete && <Button variant="ghost" size="icon-sm" aria-label="Delete comment" onClick={() => setDeleting(c)}><Trash2 /></Button>}
              </li>
            ))}
          </ul>
        )}
      {comments.data && comments.data.meta.total > comments.data.data.length && (
        <div className="border-t p-3 text-center"><Button variant="outline" size="sm" onClick={() => setPageSize((n) => Math.min(n + 20, 100))}>Load more</Button></div>
      )}
      {deleting && (
        <ConfirmDialog open onOpenChange={(open) => !open && setDeleting(null)} title="Delete this comment?"
          description="The comment will be removed permanently." confirmLabel="Delete comment" pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, {
            onSuccess: () => { toast.success("Comment deleted"); setDeleting(null); },
            onError: (e) => { toast.error(e.message); setDeleting(null); },
          })} />
      )}
    </section>
  );
}
