// Deterministic development fixtures (specs/04-data-model.md §4).
export const DEMO_PASSWORD = "NeoStatsDemo!2026";

const id = (group: string, n: number) => `00000000-0000-4000-8000-${group}${String(n).padStart(11, "0")}`;

export const U = {
  admin: id("0", 1), admin2: id("0", 2), manager: id("0", 3), manager2: id("0", 4),
  member: id("0", 5), member2: id("0", 6), viewer: id("0", 7), inactive: id("0", 8),
};
export const P = { website: id("1", 1), mobile: id("1", 2), legacy: id("1", 3) };

export const users = [
  { id: U.admin, name: "Asha Admin", email: "admin@neostat.test", role: "ADMIN", isActive: true },
  { id: U.admin2, name: "Arjun Admin", email: "admin2@neostat.test", role: "ADMIN", isActive: true },
  { id: U.manager, name: "Priya Manager", email: "manager@neostat.test", role: "PROJECT_MANAGER", isActive: true },
  { id: U.manager2, name: "Rohan Manager", email: "manager2@neostat.test", role: "PROJECT_MANAGER", isActive: true },
  { id: U.member, name: "Meera Member", email: "member@neostat.test", role: "TEAM_MEMBER", isActive: true },
  { id: U.member2, name: "Kabir Member", email: "member2@neostat.test", role: "TEAM_MEMBER", isActive: true },
  { id: U.viewer, name: "Vikram Viewer", email: "viewer@neostat.test", role: "VIEWER", isActive: true },
  { id: U.inactive, name: "Isha Inactive", email: "inactive@neostat.test", role: "TEAM_MEMBER", isActive: false },
];

export const projects = [
  { id: P.website, name: "Website Redesign", description: "Refresh the marketing site: navigation, homepage and accessibility.", archived: false },
  { id: P.mobile, name: "Mobile App Launch", description: "Ship version 1.0 of the mobile app to both stores.", archived: false },
  { id: P.legacy, name: "Legacy CRM Migration", description: "Move customer records off the old CRM. Completed and archived.", archived: true },
];

export const members = [
  { projectId: P.website, userId: U.manager, role: "PROJECT_MANAGER" },
  { projectId: P.website, userId: U.member, role: "TEAM_MEMBER" },
  { projectId: P.website, userId: U.member2, role: "TEAM_MEMBER" },
  { projectId: P.website, userId: U.viewer, role: "VIEWER" },
  { projectId: P.website, userId: U.inactive, role: "TEAM_MEMBER" },
  { projectId: P.mobile, userId: U.manager2, role: "PROJECT_MANAGER" },
  { projectId: P.mobile, userId: U.member, role: "TEAM_MEMBER" },
  { projectId: P.mobile, userId: U.manager, role: "VIEWER" },
  { projectId: P.legacy, userId: U.manager2, role: "PROJECT_MANAGER" },
  { projectId: P.legacy, userId: U.member2, role: "TEAM_MEMBER" },
];

export const T = { demo: id("2", 1) };

// dueOffset: days from the seed date; null = no deadline.
export const tasks = [
  { id: T.demo, projectId: P.website, title: "Concurrent editing demo", status: "TODO", priority: "MEDIUM", assigneeId: U.member, dueOffset: 3,
    description: "Open this task in two browsers as manager@ and member@, edit both, and save one after the other." },
  { id: id("2", 2), projectId: P.website, title: "Audit current site navigation", status: "DONE", priority: "LOW", assigneeId: U.member2, dueOffset: -10, description: "" },
  { id: id("2", 3), projectId: P.website, title: "Design new homepage hero", status: "IN_PROGRESS", priority: "HIGH", assigneeId: U.member, dueOffset: -2, description: "" },
  { id: id("2", 4), projectId: P.website, title: "Write accessibility checklist", status: "TODO", priority: "MEDIUM", assigneeId: null, dueOffset: null, description: "" },
  { id: id("2", 5), projectId: P.website, title: "Migrate blog content", status: "TODO", priority: "LOW", assigneeId: U.member2, dueOffset: 14, description: "" },
  { id: id("2", 6), projectId: P.website, title: "Set up analytics dashboard", status: "IN_PROGRESS", priority: "MEDIUM", assigneeId: U.manager, dueOffset: 7, description: "" },
  { id: id("2", 7), projectId: P.mobile, title: "Prepare App Store listing", status: "TODO", priority: "HIGH", assigneeId: U.member, dueOffset: 5, description: "" },
  { id: id("2", 8), projectId: P.mobile, title: "Fix login crash on Android", status: "IN_PROGRESS", priority: "HIGH", assigneeId: U.manager2, dueOffset: -1, description: "" },
  { id: id("2", 9), projectId: P.mobile, title: "Beta tester feedback triage", status: "DONE", priority: "MEDIUM", assigneeId: U.member, dueOffset: -5, description: "" },
  { id: id("2", 10), projectId: P.mobile, title: "Push notification copy", status: "TODO", priority: "LOW", assigneeId: null, dueOffset: null, description: "" },
  { id: id("2", 11), projectId: P.legacy, title: "Export customer records", status: "DONE", priority: "HIGH", assigneeId: U.member2, dueOffset: -30, description: "" },
  { id: id("2", 12), projectId: P.legacy, title: "Decommission old server", status: "TODO", priority: "MEDIUM", assigneeId: null, dueOffset: null, description: "" },
];

export const comments = [
  { id: id("3", 1), taskId: T.demo, authorId: U.manager, body: "Kicking this off — Meera, please take the first pass.", minutesAgo: 120 },
  { id: id("3", 2), taskId: T.demo, authorId: U.member, body: "On it.", minutesAgo: 90 },
  { id: id("3", 3), taskId: id("2", 3), authorId: U.member2, body: "Shared two layout options in the drive.", minutesAgo: 60 },
  { id: id("3", 4), taskId: id("2", 8), authorId: U.member, body: "Reproduced on Android 15.", minutesAgo: 30 },
  { id: id("3", 5), taskId: id("2", 11), authorId: U.manager2, body: "Export verified and archived.", minutesAgo: 600 },
];
