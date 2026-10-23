"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ApiError, api, setCsrfToken, setUnauthorizedHandler } from "./api";
import type { User } from "./types";

type AuthState = {
  user: User | null | undefined; // undefined while loading
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type Me = { data: { user: User; csrfToken: string } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const res = await api<Me>("/auth/me");
        setCsrfToken(res.data.csrfToken);
        return res.data.user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw error;
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // A 401 anywhere means the session ended: clear every cached query and go to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(["me"], null);
      toast.error("Your session expired. Sign in again.");
      const next = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, router]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<Me>("/auth/login", { method: "POST", body: { email, password } });
    setCsrfToken(res.data.csrfToken);
    queryClient.clear();
    queryClient.setQueryData(["me"], res.data.user);
    return res.data.user;
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(["me"], null);
      router.replace("/login");
    }
  }, [queryClient, router]);

  const value = useMemo(() => ({ user: me.data, login, logout }), [me.data, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

// For pages inside the authenticated layout, where the user is known to exist.
export function useUser() {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}
