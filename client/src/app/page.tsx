"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user !== undefined) router.replace(user ? "/dashboard" : "/login");
  }, [user, router]);
  return <p className="p-8 text-center text-muted-foreground" role="status">Loading…</p>;
}
