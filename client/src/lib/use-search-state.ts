"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Filter state lives in the URL so reloads and back navigation keep it.
export function useSearchState<K extends string>(keys: readonly K[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""])) as Record<K, string>;

  const set = useCallback((changes: Partial<Record<K, string>>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes) as [string, string | undefined][]) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage && !("page" in changes)) next.delete("page");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, router, pathname]);

  return [values, set] as const;
}
