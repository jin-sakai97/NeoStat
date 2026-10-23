"use client";

import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { RoleBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { SearchInput } from "@/components/search-input";
import { LoadingRows, QueryError, StateView } from "@/components/state-view";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserChip } from "@/components/user-avatar";
import { ActivationDialog, UserDialog } from "@/components/users/user-dialogs";
import { useUser } from "@/lib/auth";
import { ACCOUNT_ROLE_LABEL } from "@/lib/format";
import { useUsers } from "@/lib/queries";
import type { AccountRole, User } from "@/lib/types";
import { useSearchState } from "@/lib/use-search-state";

const ANY = "__any";

export default function UsersPage() {
  const me = useUser();
  const [filters, setFilters] = useSearchState(["q", "role", "active", "page"] as const);
  const isAdmin = me.role === "ADMIN";
  const users = useUsers({ q: filters.q, role: filters.role, isActive: filters.active || undefined, page: filters.page || 1 }, isAdmin);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);

  if (!isAdmin) {
    return <div className="rounded-lg border bg-card"><StateView kind="forbidden" title="Only admins can manage users." /></div>;
  }

  return (
    <>
      <PageHeader title="Users" actions={<Button className="h-9" onClick={() => setEditing("new")}><Plus />New user</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput label="Search users" value={filters.q} onChange={(q) => setFilters({ q })} />
        <Select value={filters.role || ANY} onValueChange={(v) => setFilters({ role: v === ANY ? "" : v })}>
          <SelectTrigger aria-label="Role" className="h-9 w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any role</SelectItem>
            {(Object.keys(ACCOUNT_ROLE_LABEL) as AccountRole[]).map((r) => <SelectItem key={r} value={r}>{ACCOUNT_ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.active || ANY} onValueChange={(v) => setFilters({ active: v === ANY ? "" : v })}>
          <SelectTrigger aria-label="State" className="h-9 w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any state</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {users.isPending ? <LoadingRows /> : users.isError ? <QueryError error={users.error} retry={() => users.refetch()} what="users" /> :
          users.data.data.length === 0 ? <StateView kind="no-results" title="No users match these filters." action={<Button variant="outline" onClick={() => setFilters({ q: "", role: "", active: "" })}>Clear filters</Button>} /> : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">User accounts</TableCaption>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead scope="col">Name</TableHead>
                      <TableHead scope="col">Email</TableHead>
                      <TableHead scope="col">Account role</TableHead>
                      <TableHead scope="col">State</TableHead>
                      <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.data.data.map((u) => (
                      <TableRow key={u.id} className="h-11">
                        <TableCell><UserChip user={u} />{u.id === me.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell><RoleBadge role={u.role} /></TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 text-sm ${u.isActive ? "text-success-fg" : "text-muted-foreground"}`}>
                            <span className={`size-2 rounded-full ${u.isActive ? "bg-success-fg" : "border border-muted-foreground"}`} aria-hidden />
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </TableCell>
                        <TableCell className="w-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(u)}>Edit</DropdownMenuItem>
                              {u.id !== me.id && (
                                <DropdownMenuItem variant={u.isActive ? "destructive" : "default"} onSelect={() => setToggling(u)}>{u.isActive ? "Deactivate" : "Reactivate"}</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pager meta={users.data.meta} onPage={(page) => setFilters({ page: String(page) }, false)} />
            </>
          )}
      </div>
      {editing && <UserDialog user={editing === "new" ? undefined : editing} self={editing !== "new" && editing.id === me.id} onClose={() => setEditing(null)} />}
      {toggling && <ActivationDialog user={toggling} onClose={() => setToggling(null)} />}
    </>
  );
}
