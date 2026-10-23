import { expect, test } from "@playwright/test";

// A task no other spec touches: specs run in parallel and the demo task is used for conflicts.
const ORIGINAL_TITLE = "Write accessibility checklist";
const TASK = "/tasks/00000000-0000-4000-8000-200000000004";

test("S9: saving a task adds an entry to its history", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/login");
  await page.getByLabel("Email").fill("manager@neostat.test");
  await page.getByLabel("Password", { exact: true }).fill("NeoStatsDemo!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto(TASK);
  const history = page.getByRole("region", { name: /History/ });
  await expect(history).toBeVisible();
  await page.getByLabel("Title").fill(`History check ${stamp}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Task saved")).toBeVisible();

  await expect(history.getByText(`History check ${stamp}`)).toBeVisible();
  await expect(history.getByText("Manager", { exact: false }).first()).toBeVisible();

  // Put the seeded title back so repeated runs leave the dev data as it was.
  await page.getByLabel("Title").fill(ORIGINAL_TITLE);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(history.getByText(`to ${ORIGINAL_TITLE}`)).toBeVisible();
});
