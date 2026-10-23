"use client";

import { Crown, MoreHorizontal, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { RoleBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadingRows, QueryError, StateView } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserChip } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { TEAM_FAMILIES, useApiMutation, useCandidates, useMembers, useProject, useTasks } from "@/lib/queries";
import type { AccountRole, Member, Project, ProjectRole } from "@/lib/types";

const CEILING: Record<AccountRole, ProjectRole[]> = {
  ADMIN: [], PROJECT_MANAGER: ["TEAM_MEMBER", "VIEWER"], TEAM_MEMBER: ["TEAM_MEMBER", "VIEWER"], VIEWER: ["VIEWER"],
};
const LABEL: Record<ProjectRole, string> = { PROJECT_MANAGER: "Manager", TEAM_MEMBER: "Team Member", VIEWER: "Viewer" };

function AddMemberDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("TEAM_MEMBER");
  const [error, setError] = useState<string | null>(null);
  const candidates = useCandidates(project.id, q, true);
  const selected = candidates.data?.data.find((c) => c.id === userId);
  const allowed = selected ? CEILING[selected.accountRole] : (["TEAM_MEMBER", "VIEWER"] as ProjectRole[]);
  const mutation = useApiMutation(() => api(`/projects/${project.id}/members`, { method: "POST", body: { userId, role: allowed.includes(role) ? role : allowed[0] } }), TEAM_FAMILIES);
  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Add someone to {project.name}. Their account role limits which project roles they can have.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="candidate-search">Find a person</Label>
            <Input id="candidate-search" type="search" className="h-9" placeholder="Name or email" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
            <div role="listbox" aria-label="People" className="max-h-48 overflow-y-auto rounded-md border">
              {candidates.isPending ? <p className="p-3 text-sm text-muted-foreground">Loading…</p> :
                (candidates.data?.data.length ?? 0) === 0 ? <p className="p-3 text-sm text-muted-foreground">No one else to add.</p> :
                  candidates.data!.data.map((c) => (
                    <button key={c.id} type="button" role="option" aria-selected={userId === c.id} onClick={() => setUserId(c.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${userId === c.id ? "bg-muted font-medium" : ""}`}>
                      <UserChip user={c} /><span className="truncate text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">Project role</Label>
            <Select value={allowed.includes(role) ? role : allowed[0]} onValueChange={(v) => setRole(v as ProjectRole)}>
              <SelectTrigger id="member-role" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{allowed.map((r) => <SelectItem key={r} value={r}>{LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button disabled={!userId || mutation.isPending} onClick={() => mutation.mutate(undefined, {
            onSuccess: () => { toast.success("Member added"); onClose(); },
            onError: (e) => setError(e.message),
          })}>{mutation.isPending ? "Adding…" : "Add member"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Removal and downgrade-to-viewer both unassign tasks; the confirm text says how many.
function MemberChangeDialog({ project, member, newRole, onClose }: { project: Project; member: Member; newRole: ProjectRole | null; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const assigned = useTasks({ projectId: project.id, assigneeId: member.user.id, pageSize: 1, archived: project.archivedAt ? true : undefined });
  const count = assigned.data?.meta.total;
  const mutation = useApiMutation(() => newRole
    ? api(`/projects/${project.id}/members/${member.user.id}`, { method: "PATCH", body: { role: newRole } })
    : api(`/projects/${project.id}/members/${member.user.id}`, { method: "DELETE" }), TEAM_FAMILIES);
  const tasksText = count === undefined ? "Their assigned tasks" : count === 1 ? "Their 1 assigned task" : `Their ${count} assigned tasks`;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={newRole ? `Make ${member.user.name} a Viewer?` : `Remove ${member.user.name} from ${project.name}?`}
      description={<>{tasksText} will become unassigned. Their comments stay.{newRole && " They will have read-only access."}</>}
      confirmLabel={newRole ? "Change to Viewer" : "Remove member"}
      pending={mutation.isPending}
      error={error}
      onConfirm={() => mutation.mutate(undefined, {
        onSuccess: () => { toast.success(newRole ? "Role updated" : "Member removed"); onClose(); },
        onError: (e) => setError(e.message),
      })}
    />
  );
}

function RoleSelect({ project, member, onDowngrade }: { project: Project; member: Member; onDowngrade: () => void }) {
  const allowed = CEILING[member.user.accountRole];
  const mutation = useApiMutation((role: ProjectRole) => api(`/projects/${project.id}/members/${member.user.id}`, { method: "PATCH", body: { role } }), TEAM_FAMILIES);
  if (allowed.length <= 1) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span tabIndex={0}><RoleBadge role={member.role} /></span></TooltipTrigger>
        <TooltipContent>Account role allows Viewer only</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Select value={member.role} disabled={mutation.isPending} onValueChange={(role) => {
      if (role === "VIEWER") return onDowngrade();
      mutation.mutate(role as ProjectRole, { onSuccess: () => toast.success("Role updated"), onError: (e) => toast.error(e.message) });
    }}>
      <SelectTrigger size="sm" aria-label={`Project role for ${member.user.name}`} className="w-36"><SelectValue /></SelectTrigger>
      <SelectContent>{allowed.map((r) => <SelectItem key={r} value={r}>{LABEL[r]}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export default function ProjectTeamPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project } = useProject(id);
  const members = useMembers(id);
  const [adding, setAdding] = useState(false);
  const [change, setChange] = useState<{ member: Member; newRole: ProjectRole | null } | null>(null);
  if (!project) return null;
  const canManage = project.capabilities.canManageTeam;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Team {members.data && `(${members.data.meta.total})`}</h2>
        {canManage && <Button className="h-9" onClick={() => setAdding(true)}><Plus />Add member</Button>}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {members.isPending ? <LoadingRows /> : members.isError ? <QueryError error={members.error} retry={() => members.refetch()} what="team" /> :
          members.data.data.length === 0 ? <StateView kind="empty" title="No members yet" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Project team</TableCaption>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col">Email</TableHead>
                    <TableHead scope="col">Project role</TableHead>
                    <TableHead scope="col">Joined</TableHead>
                    <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data.data.map((m) => {
                    const isManager = m.role === "PROJECT_MANAGER";
                    return (
                      <TableRow key={m.user.id} className="h-11">
                        <TableCell><span className="inline-flex items-center gap-2"><UserChip user={m.user} />{!m.user.isActive && <span className="text-xs text-muted-foreground">· Inactive</span>}</span></TableCell>
                        <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                        <TableCell>
                          {isManager ? <span className="inline-flex items-center gap-1 text-sm font-medium"><Crown className="size-3.5 text-warning-fg" aria-hidden />Manager</span>
                            : canManage ? <RoleSelect project={project} member={m} onDowngrade={() => setChange({ member: m, newRole: "VIEWER" })} />
                              : <RoleBadge role={m.role} />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(m.joinedAt)}</TableCell>
                        <TableCell className="w-10">
                          {canManage && !isManager && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.user.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem variant="destructive" onSelect={() => setChange({ member: m, newRole: null })}>Remove from project</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
      </div>
      {project.capabilities.canAssignManager && <p className="mt-3 text-sm text-muted-foreground">To change the manager, use <strong>Project actions → Change manager</strong>.</p>}
      {adding && <AddMemberDialog project={project} onClose={() => setAdding(false)} />}
      {change && <MemberChangeDialog project={project} member={change.member} newRole={change.newRole} onClose={() => setChange(null)} />}
    </div>
  );
}
