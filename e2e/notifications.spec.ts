import { expect, test } from "@playwright/test";
import { apiAs, signIn, USER } from "./helpers";

const stamp = Date.now();
const taskTitle = `Review the budget ${stamp}`;
let admin: Awaited<ReturnType<typeof apiAs>>;
let projectId: string;
let taskId: string;

test.beforeAll(async () => {
  // Earlier runs leave unread notifications behind; start from zero so the counts below are exact.
  await (await apiAs("member@neostat.test")).post("/notifications/read-all");
  admin = await apiAs("admin@neostat.test");
  projectId = (await admin.post("/projects", { name: `Notify check ${stamp}`, managerId: USER.manager })).id;
  // Admin adds the member (notification 1); the manager then assigns them a task (notification 2).
  await admin.post(`/projects/${projectId}/members`, { userId: USER.member, role: "TEAM_MEMBER" });
  const manager = await apiAs("manager@neostat.test");
  taskId = (await manager.post(`/projects/${projectId}/tasks`, { title: taskTitle, assigneeId: USER.member })).id;
});

test.afterAll(async () => {
  await admin.del(`/projects/${projectId}`);
});

test("G9: the bell shows the unread count, lists the items, opens the task and clears the badge", async ({ browser }) => {
  const page = await signIn(browser, "member@neostat.test");
  const bell = (unread: number) => page.getByRole("button", { name: `Notifications, ${unread} unread` });
  await expect(bell(2)).toBeVisible();

  await bell(2).click();
  const panel = page.getByRole("menu");
  await expect(panel.getByText(`assigned you “${taskTitle}”`)).toBeVisible();
  await expect(panel.getByText(`added you to Notify check ${stamp}`)).toBeVisible();

  await panel.getByRole("menuitem").filter({ hasText: taskTitle }).click();
  await page.waitForURL(`**/tasks/${taskId}`);
  await expect(bell(1)).toBeVisible();

  await bell(1).click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  // While the panel is open the rest of the page is hidden from assistive tech, so check the panel first.
  await expect(page.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  await expect(page.getByRole("menu").getByText(`assigned you “${taskTitle}”`)).toBeVisible(); // read items stay listed
  await page.keyboard.press("Escape");
  await expect(bell(0)).toBeVisible();
});

test("G9: a notification about a project the user left reads as no longer accessible", async ({ browser }) => {
  const member = await apiAs("member@neostat.test");
  const before = (await member.get("/notifications/unread-count")).count as number;
  await admin.post(`/tasks/${taskId}/comments`, { body: "Please check the totals" });
  const page = await signIn(browser, "member@neostat.test");
  await expect(page.getByRole("button", { name: `Notifications, ${before + 1} unread` })).toBeVisible();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("menu").getByText(`commented on “${taskTitle}”`)).toBeVisible();

  await admin.del(`/projects/${projectId}/members/${USER.member}`);
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("menu").getByText("a task you can no longer access").first()).toBeVisible();
  await expect(page.getByRole("menu").getByText(taskTitle)).toHaveCount(0);
});

test("The bell fits on a 390px phone and its panel stays inside the screen", async ({ browser }) => {
  const page = await signIn(browser, "member@neostat.test");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const box = await page.getByRole("menu").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
