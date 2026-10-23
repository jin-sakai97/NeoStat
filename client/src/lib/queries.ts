"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "./api";
import { useUser } from "./auth";
import type { Candidate, Comment, Dashboard, Member, Notification, Paginated, Project, Task, TaskActivity, User } from "./types";

type Query = Record<string, string | number | boolean | undefined | null>;
type One<T> = { data: T };

// Visible lists refetch on this interval (paused while the tab is hidden). Single-task detail is not
// polled: an open edit form must not change underneath the user, and the 409 flow covers staleness.
const POLL_MS = 30_000;

// Every key starts with the user id so a different identity never sees cached data.
function useKey(...parts: unknown[]) {
  const user = useUser();
  return [user.id, ...parts];
}

export function useDashboard() {
  const queryKey = useKey("dashboard");
  return useQuery({ queryKey, queryFn: () => api<One<Dashboard>>("/dashboard").then((r) => r.data), refetchInterval: POLL_MS });
}

export function useProjects(query: Query) {
  const queryKey = useKey("projects", query);
  return useQuery({ queryKey, queryFn: () => api<Paginated<Project>>("/projects", { query }), placeholderData: keepPreviousData, refetchInterval: POLL_MS });
}

export function useProject(id: string) {
  const queryKey = useKey("project", id);
  return useQuery({ queryKey, queryFn: () => api<One<Project>>(`/projects/${id}`).then((r) => r.data) });
}

export function useTasks(query: Query) {
  const queryKey = useKey("tasks", query);
  return useQuery({ queryKey, queryFn: () => api<Paginated<Task>>("/tasks", { query }), placeholderData: keepPreviousData, refetchInterval: POLL_MS });
}

export function useTask(id: string) {
  const queryKey = useKey("task", id);
  return useQuery({ queryKey, queryFn: () => api<One<Task>>(`/tasks/${id}`).then((r) => r.data) });
}

export function useComments(taskId: string, pageSize: number) {
  const queryKey = useKey("comments", taskId, pageSize);
  return useQuery({
    queryKey,
    queryFn: () => api<Paginated<Comment>>(`/tasks/${taskId}/comments`, { query: { pageSize } }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  });
}

export function useTaskActivity(taskId: string, pageSize: number) {
  const queryKey = useKey("activity", taskId, pageSize);
  return useQuery({
    queryKey,
    queryFn: () => api<Paginated<TaskActivity>>(`/tasks/${taskId}/activity`, { query: { pageSize } }),
    placeholderData: keepPreviousData,
  });
}

// The unread badge polls; the list is only fetched while the panel is open.
export function useUnreadCount() {
  const queryKey = useKey("notifications", "count");
  return useQuery({ queryKey, queryFn: () => api<One<{ count: number }>>("/notifications/unread-count").then((r) => r.data.count), refetchInterval: POLL_MS });
}

export function useNotifications(enabled: boolean) {
  const queryKey = useKey("notifications", "list");
  return useQuery({ queryKey, enabled, queryFn: () => api<Paginated<Notification>>("/notifications", { query: { pageSize: 20 } }), refetchInterval: enabled ? POLL_MS : false });
}

export function useMembers(projectId: string, options: { assignable?: boolean; enabled?: boolean } = {}) {
  const queryKey = useKey("members", projectId, options.assignable ?? false);
  return useQuery({
    queryKey,
    enabled: options.enabled ?? true,
    queryFn: () => api<Paginated<Member>>(`/projects/${projectId}/members`, { query: { assignable: options.assignable, pageSize: 100 } }),
  });
}

export function useCandidates(projectId: string, q: string, enabled: boolean) {
  const queryKey = useKey("candidates", projectId, q);
  return useQuery({
    queryKey,
    enabled,
    queryFn: () => api<Paginated<Candidate>>(`/projects/${projectId}/member-candidates`, { query: { q, pageSize: 20 } }),
  });
}

export function useUsers(query: Query, enabled = true) {
  const queryKey = useKey("users", query);
  return useQuery({ queryKey, enabled, queryFn: () => api<Paginated<User>>("/users", { query }), placeholderData: keepPreviousData });
}

// Mutations: no retries, wait for the server, then invalidate the related resource families.
type Family = "dashboard" | "projects" | "project" | "tasks" | "task" | "activity" | "notifications" | "comments" | "members" | "candidates" | "users";

export function useApiMutation<TVars, TResult = unknown>(fn: (vars: TVars) => Promise<TResult>, invalidate: Family[]) {
  const queryClient = useQueryClient();
  const user = useUser();
  const refresh = () => Promise.all(invalidate.map((family) => queryClient.invalidateQueries({ queryKey: [user.id, family] })));
  return useMutation({
    mutationFn: fn,
    onSuccess: refresh,
    // A conflict or vanished resource means our cached copy is stale: refetch it too.
    onError: (error) => { if (isApiError(error, "TASK_VERSION_CONFLICT", "NOT_FOUND", "PROJECT_ARCHIVED")) void refresh(); },
  });
}

export const TASK_FAMILIES: Family[] = ["task", "activity", "tasks", "project", "projects", "dashboard"];
export const TEAM_FAMILIES: Family[] = ["members", "candidates", "project", "projects", "tasks", "task", "activity", "dashboard"];
export const PROJECT_FAMILIES: Family[] = ["project", "projects", "dashboard", "tasks"];
