"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingRows } from "@/components/state-view";
import { useAuth } from "@/lib/auth";

// Client-side auth guard. The API enforces access on every request; this only routes the UI.
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);

  if (!user) return <p className="p-8 text-center text-muted-foreground" role="status">Loading…</p>;
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows />}>{children}</Suspense>
    </AppShell>
  );
}
