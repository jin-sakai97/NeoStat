"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { UserChip } from "@/components/user-avatar";
import { ApiError, api, isApiError } from "@/lib/api";
import { formatDate, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/format";
import { TASK_FAMILIES, useApiMutation, useMembers } from "@/lib/queries";
import type { Task, TaskField, TaskPriority, TaskStatus } from "@/lib/types";
import { ConflictDialog } from "./conflict-dialog";

export type Draft = { title: string; description: string; status: TaskStatus; priority: TaskPriority; assigneeId: string; dueDate: string };

export const FIELD_LABEL: Record<TaskField, string> = {
  title: "Title", description: "Description", status: "Status", priority: "Priority", assigneeId: "Assignee", dueDate: "Due date",
};
const FIELDS = Object.keys(FIELD_LABEL) as TaskField[];
const UNASSIGNED = "__none";

export const toDraft = (task?: Task): Draft => ({
  title: task?.title ?? "", description: task?.description ?? "", status: task?.status ?? "TODO",
  priority: task?.priority ?? "MEDIUM", assigneeId: task?.assignee?.id ?? "", dueDate: task?.dueDate ?? "",
});

// Fields whose draft value differs from the base the user started editing from.
export const changedFields = (draft: Draft, base: Draft) => FIELDS.filter((field) => draft[field] !== base[field]);

const toBody = (draft: Draft, fields: TaskField[]) =>
  Object.fromEntries(fields.map((field) => [field,
    field === "assigneeId" || field === "dueDate" ? draft[field] || null : field === "title" ? draft.title.trim() : draft[field]]));

type Props = {
  projectId: string;
  task?: Task;             // absent ⇒ create
  layout: "dialog" | "page";
  onDone?: (task?: Task) => void;
};

export function TaskForm({ projectId, task, layout, onDone }: Props) {
  const creating = !task;
  const [base, setBase] = useState<Task | undefined>(task);
  const [draft, setDraft] = useState<Draft>(() => toDraft(task));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Task | null>(null);
  const [lostAccess, setLostAccess] = useState<string | null>(null);
  const members = useMembers(projectId, { assignable: true });

  const baseDraft = toDraft(base);
  const dirtyFields = creating ? [] : changedFields(draft, baseDraft);
  const dirty = creating || dirtyFields.length > 0;

  // Background refreshes update the base only while the user has no unsaved changes.
  const [seenVersion, setSeenVersion] = useState(task?.version);
  if (task && task.version !== seenVersion) {
    setSeenVersion(task.version);
    if (!dirty && task.version !== base?.version) {
      setBase(task);
      setDraft(toDraft(task));
    }
  }

  const editable: TaskField[] = creating ? FIELDS : base!.capabilities.editableFields;
  const can = (field: TaskField) => !lostAccess && editable.includes(field);

  const save = useApiMutation(
    (body: Record<string, unknown>) => creating
      ? api<{ data: Task }>(`/projects/${projectId}/tasks`, { method: "POST", body })
      : api<{ data: Task }>(`/tasks/${base!.id}`, { method: "PATCH", body: { version: base!.version, ...body } }),
    TASK_FAMILIES,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (!draft.title.trim()) return setErrors({ title: ["Title is required."] });
    const fields = creating ? FIELDS.filter((field) => field !== "status" || draft.status !== "TODO") : dirtyFields;
    save.mutate(toBody(draft, fields), {
      onSuccess: (res) => {
        toast.success(creating ? "Task created" : "Task saved");
        if (!creating) {
          setBase(res.data);
          setDraft(toDraft(res.data));
        }
        onDone?.(res.data);
      },
      onError: (error) => {
        if (isApiError(error, "TASK_VERSION_CONFLICT")) setConflict(error.details.currentTask as Task);
        else if (error instanceof ApiError && (error.status === 403 || error.status === 404) && !creating) {
          setLostAccess(error.status === 404 ? "This task was deleted or you lost access to it." : "You no longer have permission to make these changes.");
        } else if (error instanceof ApiError && error.fieldErrors && Object.keys(error.fieldErrors).length) {
          setErrors(error.fieldErrors);
        } else setFormError(error.message);
      },
    });
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const fieldError = (field: string) => errors[field]?.[0] && (
    <p id={`${field}-error`} className="text-sm text-destructive">{errors[field][0]}</p>
  );
  const memberOptions = members.data?.data ?? [];
  const assigneeLabel = (id: string) => memberOptions.find((m) => m.user.id === id)?.user.name ?? base?.assignee?.name ?? "Unknown member";

  const copyDraft = async () => {
    const text = FIELDS.filter((f) => draft[f]).map((f) => `${FIELD_LABEL[f]}: ${f === "assigneeId" ? assigneeLabel(draft[f]) : draft[f]}`).join("\n");
    await navigator.clipboard.writeText(text).then(() => toast.success("Your changes were copied"), () => toast.error("Couldn't copy to the clipboard"));
  };

  const readOnly = (field: TaskField) => {
    if (field === "status") return <StatusBadge status={draft.status} />;
    if (field === "priority") return <PriorityBadge priority={draft.priority} />;
    if (field === "assigneeId") return <UserChip user={base?.assignee ?? null} />;
    if (field === "dueDate") return draft.dueDate ? formatDate(draft.dueDate) : <span className="text-muted-foreground">No due date</span>;
    return null;
  };

  const meta = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-status">Status</Label>
        {can("status") ? (
          <Select value={draft.status} onValueChange={(v) => set("status", v as TaskStatus)}>
            <SelectTrigger id="task-status" className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
          </Select>
        ) : <div id="task-status">{readOnly("status")}</div>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-priority">Priority</Label>
        {can("priority") ? (
          <Select value={draft.priority} onValueChange={(v) => set("priority", v as TaskPriority)}>
            <SelectTrigger id="task-priority" className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
          </Select>
        ) : <div id="task-priority">{readOnly("priority")}</div>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-assignee">Assignee</Label>
        {can("assigneeId") ? (
          <Select value={draft.assigneeId || UNASSIGNED} onValueChange={(v) => set("assigneeId", v === UNASSIGNED ? "" : v)}>
            <SelectTrigger id="task-assignee" className="h-9 w-full" aria-invalid={!!errors.assigneeId} aria-describedby={errors.assigneeId ? "assigneeId-error" : undefined}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {draft.assigneeId && !memberOptions.some((m) => m.user.id === draft.assigneeId) && <SelectItem value={draft.assigneeId}>{assigneeLabel(draft.assigneeId)}</SelectItem>}
              {memberOptions.map((m) => <SelectItem key={m.user.id} value={m.user.id}>{m.user.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : <div id="task-assignee">{readOnly("assigneeId")}</div>}
        {fieldError("assigneeId")}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-due">Due date</Label>
        {can("dueDate") ? (
          <div className="flex gap-2">
            <Input id="task-due" type="date" className="h-9" value={draft.dueDate} onChange={(e) => set("dueDate", e.target.value)}
              aria-invalid={!!errors.dueDate} aria-describedby={errors.dueDate ? "dueDate-error" : undefined} />
            {draft.dueDate && <Button type="button" variant="ghost" size="icon-lg" aria-label="Clear due date" onClick={() => set("dueDate", "")}><X /></Button>}
          </div>
        ) : <div id="task-due">{readOnly("dueDate")}</div>}
        {fieldError("dueDate")}
      </div>
    </div>
  );

  const canSave = !lostAccess && editable.length > 0;

  return (
    <form onSubmit={submit} noValidate className={layout === "page" ? "grid gap-6 lg:grid-cols-3" : "space-y-4"}>
      <div className={layout === "page" ? "space-y-4 lg:col-span-2" : "space-y-4"}>
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Title</Label>
          {can("title") ? (
            <Input id="task-title" className="h-9" value={draft.title} maxLength={160} onChange={(e) => set("title", e.target.value)}
              aria-invalid={!!errors.title} aria-describedby={errors.title ? "title-error" : undefined} />
          ) : <p id="task-title" className="font-medium">{draft.title}</p>}
          {fieldError("title")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-description">Description</Label>
          {can("description") ? (
            <Textarea id="task-description" rows={6} maxLength={5000} value={draft.description} onChange={(e) => set("description", e.target.value)}
              aria-invalid={!!errors.description} aria-describedby={errors.description ? "description-error" : undefined} />
          ) : <p id="task-description" className="whitespace-pre-wrap text-sm">{draft.description || <span className="text-muted-foreground">No description.</span>}</p>}
          {fieldError("description")}
        </div>
        {layout === "dialog" && meta}
        {lostAccess && (
          <div role="alert" className="rounded-md border border-[#fecdca] bg-[#fef3f2] p-3 text-sm text-destructive">
            {lostAccess} <Button type="button" variant="link" className="h-auto p-0" onClick={copyDraft}>Copy my changes</Button>
          </div>
        )}
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        {canSave && (
          <div className="flex justify-end gap-2">
            {!creating && dirty && <Button type="button" variant="outline" onClick={() => setDraft(baseDraft)}>Discard changes</Button>}
            {onDone && layout === "dialog" && <Button type="button" variant="outline" onClick={() => onDone()}>Cancel</Button>}
            <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : creating ? "Create task" : "Save changes"}</Button>
          </div>
        )}
      </div>
      {layout === "page" && <aside className="rounded-lg border bg-card p-4">{meta}</aside>}

      {conflict && base && (
        <ConflictDialog
          base={baseDraft}
          draft={draft}
          latest={conflict}
          assigneeLabel={assigneeLabel}
          onCopy={copyDraft}
          onReload={() => { setBase(conflict); setDraft(toDraft(conflict)); setConflict(null); }}
          onReapply={(keepLatest) => {
            const allowed = conflict.capabilities.editableFields;
            const dropped = dirtyFields.filter((field) => !allowed.includes(field));
            const latest = toDraft(conflict);
            setBase(conflict);
            setDraft((d) => ({ ...d, ...Object.fromEntries([...dropped, ...keepLatest].map((field) => [field, latest[field]])) }));
            setConflict(null);
            if (dropped.length) toast.warning(`You can no longer change: ${dropped.map((f) => FIELD_LABEL[f]).join(", ")}`);
            else toast.info("Your changes are applied on top of the latest version. Review them and save again.");
          }}
        />
      )}
    </form>
  );
}
