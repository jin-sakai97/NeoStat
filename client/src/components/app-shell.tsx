"use client";

import { FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, UserCircle, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RoleBadge } from "@/components/badges";
import { UserAvatar } from "@/components/user-avatar";
import { useAuth, useUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const pathname = usePathname();
  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/tasks", label: "My Tasks", icon: ListChecks },
    ...(user.role === "ADMIN" ? [{ href: "/users", label: "Users", icon: Users }] : []),
    { href: "/profile", label: "Profile", icon: UserCircle },
  ];
  return (
    <nav aria-label="Main" className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-primary bg-muted text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon className="size-4" aria-hidden />{label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-muted" aria-label="Account menu">
          <UserAvatar user={user} className="size-8 text-xs" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <RoleBadge role={user.role} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem asChild><Link href="/profile"><UserCircle className="size-4" />Profile</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}><LogOut className="size-4" />Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const Logo = () => <Link href="/dashboard" className="text-lg font-bold tracking-tight">neo<span className="text-primary">stat</span>.</Link>;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:pl-[232px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r bg-card px-3 py-4 lg:flex">
        <div className="mb-6 px-3"><Logo /></div>
        <NavLinks />
        <div className="mt-auto border-t pt-3"><UserMenu /></div>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 py-2 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger>
          <SheetContent side="left" className="flex w-[260px] flex-col px-3 py-4">
            <SheetTitle className="mb-4 px-3"><Logo /></SheetTitle>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t pt-3"><UserMenu /></div>
          </SheetContent>
        </Sheet>
        <Logo />
        <span className="w-8" />
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
