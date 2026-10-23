import { type Browser, expect, test } from "@playwright/test";

const DEMO_TASK = "/tasks/00000000-0000-4000-8000-200000000001";

async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("NeoStatsDemo!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

test("D8/D10: a stale save shows the conflict dialog and keeps the draft until the user decides", async ({ browser }) => {
  const stamp = Date.now();
  const manager = await signIn(browser, "manager@neostat.test");
  const member = await signIn(browser, "member@neostat.test");
  await manager.goto(DEMO_TASK);
  await member.goto(DEMO_TASK);

  await manager.getByLabel("Title").fill(`Manager edit ${stamp}`);
  await member.getByLabel("Title").fill(`Member edit ${stamp}`);
  await manager.getByRole("button", { name: "Save changes" }).click();
  await expect(manager.getByText("Task saved")).toBeVisible();

  await member.getByRole("button", { name: "Save changes" }).click();
  const dialog = member.getByRole("dialog", { name: "This task was changed by someone else" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Manager edit ${stamp}`)).toBeVisible();
  await expect(dialog.getByText(`Member edit ${stamp}`)).toBeVisible();

  // Reload asks for confirmation before discarding the draft.
  await dialog.getByRole("button", { name: "Reload latest" }).click();
  await expect(dialog.getByRole("button", { name: "Discard and reload" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep my changes" }).click();

  await dialog.getByRole("button", { name: "Re-apply my changes" }).click();
  await expect(member.getByLabel("Title")).toHaveValue(`Member edit ${stamp}`);
  await member.getByRole("button", { name: "Save changes" }).click();
  await expect(member.getByText("Task saved")).toBeVisible();

  await manager.reload();
  await expect(manager.getByLabel("Title")).toHaveValue(`Member edit ${stamp}`);
});

test("Viewers get a read-only task with no comment box", async ({ browser }) => {
  const viewer = await signIn(browser, "viewer@neostat.test");
  await viewer.goto(DEMO_TASK);
  await expect(viewer.getByText("You have view-only access to this task.")).toBeVisible();
  await expect(viewer.getByLabel("Write a comment")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});
