// Pure permission rules (specs/03-permissions.md §2). No I/O: services pass in fresh data.

export type AccountRole = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
export type ProjectRole = "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
export type EffectiveRole = "ADMIN" | ProjectRole | null;
export type TaskField = "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate";

export type Actor = { id: string; name: string; email: string; role: AccountRole; isActive: boolean };

export const ALL_TASK_FIELDS: TaskField[] = ["title", "description", "status", "priority", "assigneeId", "dueDate"];
const MEMBER_TASK_FIELDS: TaskField[] = ["title", "description", "status"];

// Which project roles each account role may hold.
export const ROLE_CEILING: Record<AccountRole, ProjectRole[]> = {
  ADMIN: [],
  PROJECT_MANAGER: ["PROJECT_MANAGER", "TEAM_MEMBER", "VIEWER"],
  TEAM_MEMBER: ["TEAM_MEMBER", "VIEWER"],
  VIEWER: ["VIEWER"],
};

// null means the actor cannot see the project at all (respond 404).
export function effectiveRole(actor: Actor, membershipRole: ProjectRole | null): EffectiveRole {
  if (!actor.isActive) return null;
  if (actor.role === "ADMIN") return "ADMIN";
  return membershipRole;
}

export const canManage = (role: EffectiveRole) => role === "ADMIN" || role === "PROJECT_MANAGER";
export const canWrite = (role: EffectiveRole) => canManage(role) || role === "TEAM_MEMBER";

export function editableTaskFields(role: EffectiveRole, assigneeId: string | null, actorId: string): TaskField[] {
  if (canManage(role)) return [...ALL_TASK_FIELDS];
  if (role === "TEAM_MEMBER" && assigneeId === actorId) return [...MEMBER_TASK_FIELDS];
  return [];
}

export function canDeleteComment(role: EffectiveRole, authorId: string, actorId: string) {
  if (canManage(role)) return true;
  return role === "TEAM_MEMBER" && authorId === actorId;
}

export function projectCapabilities(role: EffectiveRole, archived: boolean) {
  const admin = role === "ADMIN";
  const writable = !archived;
  return {
    canEditDetails: canManage(role) && writable,
    canManageTeam: canManage(role) && writable,
    canCreateTasks: canManage(role) && writable,
    canAssignManager: admin,
    canArchive: admin,
    canDelete: admin,
  };
}

export function taskCapabilities(role: EffectiveRole, archived: boolean, assigneeId: string | null, actorId: string) {
  if (archived) return { editableFields: [] as TaskField[], canDelete: false, canComment: false };
  return {
    editableFields: editableTaskFields(role, assigneeId, actorId),
    canDelete: canManage(role),
    canComment: canWrite(role),
  };
}
