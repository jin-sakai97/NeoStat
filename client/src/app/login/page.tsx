"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().min(1, "Enter your email."), password: z.string().min(1, "Enter your password.") });
type Values = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  ["Admin", "admin@neostat.test"], ["Project Manager", "manager@neostat.test"], ["Project Manager 2", "manager2@neostat.test"],
  ["Team Member", "member@neostat.test"], ["Team Member 2", "member2@neostat.test"], ["Viewer", "viewer@neostat.test"],
] as const;
const DEMO_PASSWORD = "NeoStatsDemo!2026";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Try again in a few minutes." : err instanceof Error ? err.message : "Sign-in failed.");
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold tracking-tight">neo<span className="text-primary">stat</span>.</p>
          <h1 className="mt-2 text-muted-foreground">Sign in to your workspace</h1>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border bg-card p-6">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" className="h-9"
              aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...form.register("email")} />
            {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-9 pr-10"
                aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...form.register("password")} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {error && <p role="alert" className="rounded-md bg-[#fef3f2] px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-9 w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</Button>
        </form>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 rounded-lg border bg-card">
            <button type="button" onClick={() => setDemoOpen((v) => !v)} aria-expanded={demoOpen}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
              Demo accounts (development only)
              <ChevronDown className={`size-4 transition-transform ${demoOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {demoOpen && (
              <div className="border-t px-4 py-3 text-sm">
                <p className="mb-2 text-muted-foreground">Password for all: <code className="text-foreground">{DEMO_PASSWORD}</code></p>
                <ul className="space-y-1">
                  {DEMO_ACCOUNTS.map(([role, email]) => (
                    <li key={email}>
                      <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                        onClick={() => { form.setValue("email", email); form.setValue("password", DEMO_PASSWORD); }}>
                        <span className="text-muted-foreground">{role} · </span>{email}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
