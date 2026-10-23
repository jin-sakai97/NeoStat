import type { AccountRole, ProjectRole, TaskPriority, TaskStatus } from "./types";

export const STATUS_LABEL: Record<TaskStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
export const ROLE_LABEL: Record<AccountRole | ProjectRole | "ADMIN", string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "Manager", TEAM_MEMBER: "Member", VIEWER: "Viewer",
};
export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  ADMIN: "Admin", PROJECT_MANAGER: "Project Manager", TEAM_MEMBER: "Team Member", VIEWER: "Viewer",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function timeAgo(iso: string) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return rtf.format(Math.round(value), "year");
}

// Due dates are date-only strings (YYYY-MM-DD); format without timezone shifts.
export function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
