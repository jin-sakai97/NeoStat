import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Actor, canDeleteComment, editableTaskFields, effectiveRole, projectCapabilities, taskCapabilities,
} from "../../src/domain/policy.js";

const actor = (role: Actor["role"], isActive = true): Actor => ({ id: "me", name: "Me", email: "me@x.test", role, isActive });

test("effective role: Admin is global, others need membership, inactive sees nothing", () => {
  assert.equal(effectiveRole(actor("ADMIN"), null), "ADMIN");
  assert.equal(effectiveRole(actor("PROJECT_MANAGER"), null), null);
  assert.equal(effectiveRole(actor("PROJECT_MANAGER"), "VIEWER"), "VIEWER");
  assert.equal(effectiveRole(actor("TEAM_MEMBER"), "TEAM_MEMBER"), "TEAM_MEMBER");
  assert.equal(effectiveRole(actor("TEAM_MEMBER", false), "TEAM_MEMBER"), null);
});

test("task fields: managers edit all, members only their assigned task's title/description/status", () => {
  assert.equal(editableTaskFields("ADMIN", null, "me").length, 6);
  assert.equal(editableTaskFields("PROJECT_MANAGER", "other", "me").length, 6);
  assert.deepEqual(editableTaskFields("TEAM_MEMBER", "me", "me"), ["title", "description", "status"]);
  assert.deepEqual(editableTaskFields("TEAM_MEMBER", "other", "me"), []);
  assert.deepEqual(editableTaskFields("TEAM_MEMBER", null, "me"), []);
  assert.deepEqual(editableTaskFields("VIEWER", "me", "me"), []);
  assert.deepEqual(editableTaskFields(null, "me", "me"), []);
});

test("comments: authors with a writable role delete their own; managers and admins moderate", () => {
  assert.equal(canDeleteComment("TEAM_MEMBER", "me", "me"), true);
  assert.equal(canDeleteComment("TEAM_MEMBER", "other", "me"), false);
  assert.equal(canDeleteComment("VIEWER", "me", "me"), false);
  assert.equal(canDeleteComment("PROJECT_MANAGER", "other", "me"), true);
  assert.equal(canDeleteComment("ADMIN", "other", "me"), true);
});

test("project capabilities follow the matrix and archive blocks content writes", () => {
  assert.deepEqual(projectCapabilities("ADMIN", false), {
    canEditDetails: true, canManageTeam: true, canCreateTasks: true, canAssignManager: true, canArchive: true, canDelete: true,
  });
  const manager = projectCapabilities("PROJECT_MANAGER", false);
  assert.equal(manager.canManageTeam && manager.canCreateTasks && manager.canEditDetails, true);
  assert.equal(manager.canAssignManager || manager.canArchive || manager.canDelete, false);
  assert.equal(Object.values(projectCapabilities("TEAM_MEMBER", false)).some(Boolean), false);
  assert.equal(Object.values(projectCapabilities("VIEWER", false)).some(Boolean), false);
  const archivedAdmin = projectCapabilities("ADMIN", true);
  assert.equal(archivedAdmin.canCreateTasks || archivedAdmin.canManageTeam, false);
  assert.equal(archivedAdmin.canArchive, true);
});

test("task capabilities: viewers read only, members comment, archived blocks everything", () => {
  assert.deepEqual(taskCapabilities("VIEWER", false, "me", "me"), { editableFields: [], canDelete: false, canComment: false });
  assert.equal(taskCapabilities("TEAM_MEMBER", false, "other", "me").canComment, true);
  assert.equal(taskCapabilities("TEAM_MEMBER", false, "other", "me").canDelete, false);
  assert.deepEqual(taskCapabilities("ADMIN", true, null, "me"), { editableFields: [], canDelete: false, canComment: false });
});
