"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { RoleBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { ACCOUNT_ROLE_LABEL } from "@/lib/format";
import { useApiMutation, useProjects } from "@/lib/queries";
import type { User } from "@/lib/types";

function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useApiMutation((body: { currentPassword: string; newPassword: string }) => api("/profile/password", { method: "POST", body }), []);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const fields = [
    { key: "currentPassword", label: "Current password", autoComplete: "current-password" },
    { key: "newPassword", label: "New password", autoComplete: "new-password", hint: "8–128 characters." },
    { key: "confirm", label: "Confirm new password", autoComplete: "new-password" },
  ] as const;

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 font-semibold">Change password</h2>
      <p className="mb-4 text-sm text-muted-foreground">You&apos;ll stay signed in here. Other devices are signed out.</p>
      <form className="space-y-4" noValidate onSubmit={(event) => {
        event.preventDefault();
        const local: Record<string, string> = {};
        if (!values.currentPassword) local.currentPassword = "Enter your current password.";
        if (values.newPassword.length < 8) local.newPassword = "Use at least 8 characters.";
        else if (values.newPassword !== values.confirm) local.confirm = "Passwords don't match.";
        setErrors(local);
        if (Object.keys(local).length) return;
        change.mutate({ currentPassword: values.currentPassword, newPassword: values.newPassword }, {
          onSuccess: () => { setValues({ currentPassword: "", newPassword: "", confirm: "" }); toast.success("Password changed"); },
          onError: (e) => {
            if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
              setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
            } else setErrors({ form: e.message });
          },
        });
      }}>
        {fields.map(({ key, label, autoComplete, ...rest }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`pw-${key}`}>{label}</Label>
            <Input id={`pw-${key}`} type="password" className="h-9" maxLength={128} autoComplete={autoComplete} value={values[key]} onChange={set(key)}
              aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `pw-${key}-error` : undefined} />
            {errors[key] ? <p id={`pw-${key}-error`} className="text-sm text-destructive">{errors[key]}</p>
              : "hint" in rest && <p className="text-xs text-muted-foreground">{rest.hint}</p>}
          </div>
        ))}
        {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
        <Button type="submit" disabled={change.isPending}>{change.isPending ? "Changing…" : "Change password"}</Button>
      </form>
    </section>
  );
}

export default function ProfilePage() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const projects = useProjects({ pageSize: 100 });
  const save = useApiMutation((value: string) => api<{ data: User }>("/profile", { method: "PATCH", body: { name: value } }), ["members", "projects"]);

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 font-semibold">Your account</h2>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return setError("Name is required.");
            setError(null);
            save.mutate(name.trim(), {
              onSuccess: (res) => { queryClient.setQueryData(["me"], res.data); toast.success("Profile updated"); },
              onError: (e) => setError(e.message),
            });
          }}>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Display name</Label>
              <Input id="profile-name" className="h-9" maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
                aria-invalid={!!error} aria-describedby={error ? "profile-name-error" : undefined} />
              {error && <p id="profile-name-error" className="text-sm text-destructive">{error}</p>}
            </div>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd>
              <dt className="text-muted-foreground">Account role</dt><dd>{ACCOUNT_ROLE_LABEL[user.role]}</dd>
            </dl>
            <Button type="submit" disabled={save.isPending || name.trim() === user.name}>{save.isPending ? "Saving…" : "Save"}</Button>
          </form>
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-4 font-semibold">Your projects</h2>
          {projects.data?.data.length ? (
            <ul className="divide-y text-sm">
              {projects.data.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/projects/${p.id}`} className="hover:text-primary hover:underline">{p.name}</Link>
                  <RoleBadge role={p.myRole} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{projects.isPending ? "Loading…" : "No active projects."}</p>}
        </section>
        <PasswordForm />
      </div>
    </>
  );
}
