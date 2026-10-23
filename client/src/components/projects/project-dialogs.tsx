"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { PROJECT_FAMILIES, TEAM_FAMILIES, useApiMutation, useUsers } from "@/lib/queries";
import type { Project } from "@/lib/types";

export type ProjectAction = "edit" | "archive" | "restore" | "delete" | "manager";

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.[0] ? <p id={`${id}-error`} className="text-sm text-destructive">{errors[0]}</p> : null;
}

// /users is admin-only, so only fetch it where an admin picks a manager.
function useManagerOptions(enabled = true) {
  return useUsers({ role: "PROJECT_MANAGER", isActive: true, pageSize: 100 }, enabled);
}

// Create (no project) or edit name/description.
export function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [managerId, setManagerId] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const managers = useManagerOptions(!project);
  const mutation = useApiMutation(
    (body: Record<string, string>) => project
      ? api<{ data: Project }>(`/projects/${project.id}`, { method: "PATCH", body })
      : api<{ data: Project }>("/projects", { method: "POST", body }),
    PROJECT_FAMILIES,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const local: Record<string, string[]> = {};
    if (!name.trim()) local.name = ["Name is required."];
    if (!project && !managerId) local.managerId = ["Choose a project manager."];
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    const body: Record<string, string> = project
      ? Object.fromEntries(Object.entries({ name: name.trim(), description }).filter(([k, v]) => v !== project[k as "name" | "description"]))
      : { name: name.trim(), description, managerId };
    if (project && Object.keys(body).length === 0) return onClose();
    mutation.mutate(body, {
      onSuccess: (res) => {
        toast.success(project ? "Project updated" : "Project created");
        onClose();
        if (!project) router.push(`/projects/${res.data.id}/tasks`);
      },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
        else setFormError(error.message);
      },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>{project ? "Update the name and description." : "Every project has exactly one manager."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" className="h-9" value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "project-name-error" : undefined} />
            <FieldError id="project-name" errors={errors.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
            <FieldError id="project-description" errors={errors.description} />
          </div>
          {!project && (
            <div className="space-y-1.5">
              <Label htmlFor="project-manager">Project manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger id="project-manager" className="h-9 w-full" aria-invalid={!!errors.managerId} aria-describedby={errors.managerId ? "project-manager-error" : undefined}>
                  <SelectValue placeholder={managers.isPending ? "Loading…" : "Choose a manager"} />
                </SelectTrigger>
                <SelectContent>
                  {(managers.data?.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError id="project-manager" errors={errors.managerId} />
            </div>
          )}
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : project ? "Save" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagerDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const managers = useManagerOptions();
  const mutation = useApiMutation((id: string) => api(`/projects/${project.id}/manager`, { method: "PUT", body: { userId: id } }), TEAM_FAMILIES);
  const options = (managers.data?.data ?? []).filter((u) => u.id !== project.manager?.id);
  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change project manager</DialogTitle>
          <DialogDescription>{project.manager ? `${project.manager.name} will stay on the project as a Team Member and keep their tasks.` : "Choose the project's manager."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-manager">New manager</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id="new-manager" className="h-9 w-full"><SelectValue placeholder="Choose a Project Manager account" /></SelectTrigger>
            <SelectContent>{options.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button disabled={!userId || mutation.isPending} onClick={() => mutation.mutate(userId, {
            onSuccess: () => { toast.success("Manager changed"); onClose(); },
            onError: (e) => setError(e.message),
          })}>{mutation.isPending ? "Saving…" : "Change manager"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LIFECYCLE = {
  archive: { title: "Archive this project?", text: "It becomes read-only for everyone and leaves the active list. An admin can restore it later.", label: "Archive", done: "Project archived", destructive: false },
  restore: { title: "Restore this project?", text: "It becomes active again and team members can resume work.", label: "Restore", done: "Project restored", destructive: false },
  delete: { title: "Delete this project?", text: "It disappears for everyone, including its tasks and comments. This can't be undone from the app.", label: "Delete project", done: "Project deleted", destructive: true },
};

function LifecycleDialog({ project, action, onClose }: { project: Project; action: "archive" | "restore" | "delete"; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = LIFECYCLE[action];
  const mutation = useApiMutation(
    () => action === "delete" ? api(`/projects/${project.id}`, { method: "DELETE" }) : api(`/projects/${project.id}/${action}`, { method: "POST" }),
    PROJECT_FAMILIES,
  );
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={copy.title}
      description={<><strong>{project.name}</strong>: {copy.text}</>}
      confirmLabel={copy.label}
      destructive={copy.destructive}
      pending={mutation.isPending}
      error={error}
      onConfirm={() => mutation.mutate(undefined, {
        onSuccess: () => {
          toast.success(copy.done);
          onClose();
          if (action === "delete") router.push("/projects");
        },
        onError: (e) => setError(e.message),
      })}
    />
  );
}

export function ProjectActions({ project, action, onClose }: { project: Project; action: ProjectAction; onClose: () => void }) {
  if (action === "edit") return <ProjectDialog project={project} onClose={onClose} />;
  if (action === "manager") return <ManagerDialog project={project} onClose={onClose} />;
  return <LifecycleDialog project={project} action={action} onClose={onClose} />;
}
