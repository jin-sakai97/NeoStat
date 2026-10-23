"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";
import { ACCOUNT_ROLE_LABEL } from "@/lib/format";
import { useApiMutation } from "@/lib/queries";
import type { AccountRole, User } from "@/lib/types";

type ProjectRef = { id: string; name: string; projectRole: string };

// Turns 409 guard errors into readable text with links to the blocking projects.
export function ConflictMessage({ error }: { error: ApiError }) {
  const projects = (error.details.projects as ProjectRef[] | undefined) ?? [];
  return (
    <div role="alert" className="space-y-1 text-sm text-destructive">
      <p>{error.message}</p>
      {projects.length > 0 && (
        <ul className="list-disc pl-5">
          {projects.map((p) => <li key={p.id}><Link className="underline" href={`/projects/${p.id}/team`}>{p.name}</Link> ({p.projectRole.replace("_", " ").toLowerCase()})</li>)}
        </ul>
      )}
    </div>
  );
}

const USER_FAMILIES = ["users", "members", "candidates", "tasks", "task", "activity", "project", "projects", "dashboard"] as const;

export function UserDialog({ user, self, onClose }: { user?: User; self?: boolean; onClose: () => void }) {
  const [values, setValues] = useState({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? ("TEAM_MEMBER" as AccountRole), password: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const mutation = useApiMutation((body: Record<string, string>) => user
    ? api(`/users/${user.id}`, { method: "PATCH", body })
    : api("/users", { method: "POST", body }), [...USER_FAMILIES]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const local: Record<string, string[]> = {};
    if (!values.name.trim()) local.name = ["Name is required."];
    if (!values.email.trim()) local.email = ["Email is required."];
    if ((!user || values.password) && values.password.length < 8) local.password = ["Use at least 8 characters."];
    setErrors(local);
    setFailure(null);
    if (Object.keys(local).length) return;
    const body: Record<string, string> = user
      ? Object.fromEntries(Object.entries(values).filter(([key, value]) => key === "password" ? value !== "" : value !== user[key as keyof User]))
      : values;
    if (user && Object.keys(body).length === 0) return onClose();
    mutation.mutate(body, {
      onSuccess: () => { toast.success(user ? "User updated" : "User created"); onClose(); },
      onError: (error) => {
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors);
        if (error instanceof ApiError) setFailure(error);
      },
    });
  };

  const field = (key: "name" | "email" | "password", label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`user-${key}`}>{label}</Label>
      <Input id={`user-${key}`} type={type} className="h-9" value={values[key]} autoComplete={key === "password" ? "new-password" : "off"}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `user-${key}-error` : undefined} />
      {errors[key] && <p id={`user-${key}-error`} className="text-sm text-destructive">{errors[key][0]}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>{user ? "Changing the role, email or password signs this person out everywhere." : "The account is active immediately. Share the password with them securely."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {field("name", "Name")}
          {field("email", "Email", "email")}
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Account role</Label>
            <Select value={values.role} disabled={self} onValueChange={(role) => setValues((v) => ({ ...v, role: role as AccountRole }))}>
              <SelectTrigger id="user-role" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ACCOUNT_ROLE_LABEL) as AccountRole[]).map((r) => <SelectItem key={r} value={r}>{ACCOUNT_ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
            {self && <p className="text-xs text-muted-foreground">You can&apos;t change your own role.</p>}
          </div>
          {field("password", user ? "New password (leave blank to keep)" : "Password", "password")}
          {failure && !Object.keys(failure.fieldErrors).length && <ConflictMessage error={failure} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : user ? "Save" : "Create user"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ActivationDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [failure, setFailure] = useState<ApiError | null>(null);
  const deactivating = user.isActive;
  const mutation = useApiMutation(() => api(`/users/${user.id}`, { method: "PATCH", body: { isActive: !deactivating } }), [...USER_FAMILIES]);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={deactivating ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
      description={<>
        {deactivating
          ? "They'll be signed out everywhere and unassigned from their tasks in all projects. Their memberships and comments stay."
          : "They can sign in again. Tasks unassigned during deactivation stay unassigned."}
        {failure && <div className="mt-3"><ConflictMessage error={failure} /></div>}
      </>}
      confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
      destructive={deactivating}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate(undefined, {
        onSuccess: () => { toast.success(deactivating ? "User deactivated" : "User reactivated"); onClose(); },
        onError: (e) => setFailure(e instanceof ApiError ? e : null),
      })}
    />
  );
}
