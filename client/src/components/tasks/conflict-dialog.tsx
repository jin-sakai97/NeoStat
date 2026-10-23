"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { Task, TaskField } from "@/lib/types";
import { type Draft, FIELD_LABEL, changedFields, toDraft } from "./task-form";

type Props = {
  base: Draft;
  draft: Draft;
  latest: Task;
  assigneeLabel: (id: string) => string;
  onCopy: () => void;
  onReload: () => void;
  onReapply: (keepLatest: TaskField[]) => void;
};

// Shown on 409 TASK_VERSION_CONFLICT. Nothing is saved until the user explicitly chooses.
export function ConflictDialog({ base, draft, latest, assigneeLabel, onCopy, onReload, onReapply }: Props) {
  const [confirmReload, setConfirmReload] = useState(false);
  const latestDraft = toDraft(latest);
  const mine = changedFields(draft, base);
  // A choice is only needed where they changed the field too and the values differ. Default: keep mine.
  const contested = (field: TaskField) => latestDraft[field] !== base[field] && latestDraft[field] !== draft[field];
  const [keepLatest, setKeepLatest] = useState<Partial<Record<TaskField, boolean>>>({});
  const picked = mine.filter((field) => contested(field) && keepLatest[field]);

  const pick = (field: TaskField, latestSide: boolean) => contested(field) && (
    <input
      type="radio"
      name={`keep-${field}`}
      className="mr-2 size-4 accent-primary align-middle"
      aria-label={`Keep ${latestSide ? "latest" : "my"} ${FIELD_LABEL[field]}`}
      checked={!!keepLatest[field] === latestSide}
      onChange={() => setKeepLatest((c) => ({ ...c, [field]: latestSide }))}
    />
  );

  const show = (field: TaskField, value: string, task?: Task) => {
    if (!value) return <span className="text-muted-foreground">{field === "assigneeId" ? "Unassigned" : field === "dueDate" ? "No due date" : "(empty)"}</span>;
    if (field === "status") return STATUS_LABEL[value as keyof typeof STATUS_LABEL];
    if (field === "priority") return PRIORITY_LABEL[value as keyof typeof PRIORITY_LABEL];
    if (field === "assigneeId") return task?.assignee?.name ?? assigneeLabel(value);
    if (field === "dueDate") return formatDate(value);
    return <span className="line-clamp-3 whitespace-pre-wrap break-words">{value}</span>;
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl" onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>This task was changed by someone else</DialogTitle>
          <DialogDescription>
            {latest.updatedBy.name} saved a newer version (v{latest.version}) {timeAgo(latest.updatedAt)}. Your changes have not been saved.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Your changes compared with the latest version</caption>
            <thead className="bg-muted text-left">
              <tr><th scope="col" className="px-3 py-2">Field</th><th scope="col" className="px-3 py-2">Latest (v{latest.version})</th><th scope="col" className="px-3 py-2">Your change</th></tr>
            </thead>
            <tbody>
              {mine.map((field) => (
                <tr key={field} className="border-t align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {FIELD_LABEL[field]}
                    {latestDraft[field] !== base[field] && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-normal text-warning-fg"><span className="size-1.5 rounded-full bg-warning-fg" aria-hidden />Changed by them too</span>
                    )}
                  </th>
                  <td className="px-3 py-2"><label className="cursor-pointer">{pick(field, true)}{show(field, latestDraft[field], latest)}</label></td>
                  <td className="px-3 py-2 font-medium"><label className="cursor-pointer">{pick(field, false)}{show(field, draft[field])}</label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mine.some(contested) && <p className="text-sm text-muted-foreground">Where both of you changed a field, choose which value to keep. Mine is selected by default.</p>}
        {confirmReload && (
          <p role="alert" className="rounded-md bg-warning-bg p-3 text-sm text-warning-fg">Discard your changes and load the latest version? This can&apos;t be undone.</p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onCopy}>Copy my changes</Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {confirmReload ? (
              <>
                <Button variant="outline" onClick={() => setConfirmReload(false)}>Keep my changes</Button>
                <Button variant="destructive" onClick={onReload}>Discard and reload</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfirmReload(true)}>Reload latest</Button>
                <Button onClick={() => onReapply(picked)}>Re-apply my changes</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
