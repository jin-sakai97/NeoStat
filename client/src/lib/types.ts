// Mirrors specs/05-api.md §5. Keep in sync with server DTOs.

export type AccountRole = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
export type ProjectRole = "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskField = "title" | "description" | "status" | "priority" | "assigneeId" | "dueDate";

export interface UserSummary { id: string; name: string; email: string }
export interface User extends UserSummary {
  role: AccountRole; isActive: boolean; createdAt: string; updatedAt: string;
}

export interface ProjectCapabilities {
  canEditDetails: boolean; canManageTeam: boolean; canCreateTasks: boolean;
  canAssignManager: boolean; canArchive: boolean; canDelete: boolean;
}
export interface Project {
  id: string; name: string; description: string; archivedAt: string | null;
  manager: UserSummary | null; memberCount: number;
  taskCounts: { total: number; todo: number; inProgress: number; done: number; overdue: number };
  myRole: ProjectRole | "ADMIN"; capabilities: ProjectCapabilities;
  createdAt: string; updatedAt: string;
}

export interface Member {
  user: UserSummary & { isActive: boolean; accountRole: AccountRole };
  role: ProjectRole; joinedAt: string;
}
export interface Candidate extends UserSummary { accountRole: AccountRole }

export interface TaskCapabilities { editableFields: TaskField[]; canDelete: boolean; canComment: boolean }
export interface Task {
  id: string; projectId: string; projectName: string;
  title: string; description: string; status: TaskStatus; priority: TaskPriority;
  assignee: UserSummary | null; dueDate: string | null; isOverdue: boolean;
  version: number; createdBy: UserSummary; updatedBy: UserSummary;
  createdAt: string; updatedAt: string; capabilities: TaskCapabilities;
}

export interface Comment {
  id: string; taskId: string; author: UserSummary; body: string; createdAt: string; canDelete: boolean;
}

export interface Dashboard {
  activeProjectCount: number;
  taskCounts: { todo: number; inProgress: number; done: number };
  assignedToMeOpen: number; overdue: number;
  recentProjects: Project[]; myTasks: Task[];
}

export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface Paginated<T> { data: T[]; meta: PageMeta }
