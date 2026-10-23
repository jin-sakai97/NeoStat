import { expect, test } from "@playwright/test";
import { apiAs, signIn, USER } from "./helpers";

const stamp = Date.now();
const titles = { drag: `Drag me ${stamp}`, menu: `Menu me ${stamp}`, stale: `Stale me ${stamp}` };
// 140 characters without a space: it must wrap inside its card instead of widening the page.
const longTitle = `${"L".repeat(140)}${stamp}`;
let admin: Awaited<ReturnType<typeof apiAs>>;
let projectId: string;
const taskIds: Record<keyof typeof titles, string> = { drag: "", menu: "", stale: "" };

test.beforeAll(async () => {
  admin = await apiAs("admin@neostat.test");
  projectId = (await admin.post("/projects", { name: `Board check ${stamp}`, managerId: USER.manager })).id;
  await admin.post(`/projects/${projectId}/members`, { userId: USER.viewer, role: "VIEWER" });
  for (const key of Object.keys(titles) as (keyof typeof titles)[]) {
    taskIds[key] = (await admin.post(`/projects/${projectId}/tasks`, { title: titles[key] })).id;
  }
  await admin.post(`/projects/${projectId}/tasks`, { title: longTitle });
});

test.afterAll(async () => {
  await admin.del(`/projects/${projectId}`);
});

const column = (page: import("@playwright/test").Page, name: string) => page.getByRole("group", { name: new RegExp(`^${name},`) });
const board = (page: import("@playwright/test").Page) => page.goto(`/projects/${projectId}/tasks?view=board`);

test("F8: a card moves by drag and drop and by the Move to menu, saving the status", async ({ browser }) => {
  const page = await signIn(browser, "admin@neostat.test");
  await board(page);
  await expect(column(page, "To do").getByText(titles.drag)).toBeVisible();

  await column(page, "To do").getByRole("listitem").filter({ hasText: titles.drag }).dragTo(column(page, "In progress"));
  await expect(page.getByText("Status updated").first()).toBeVisible();
  await expect(column(page, "In progress").getByText(titles.drag)).toBeVisible();
  const dragged = await admin.get(`/tasks/${taskIds.drag}`);
  expect([dragged.status, dragged.version]).toEqual(["IN_PROGRESS", 2]);

  await page.getByRole("button", { name: `Move ${titles.menu}` }).click();
  await page.getByRole("menuitem", { name: "Move to Done" }).click();
  await expect(column(page, "Done").getByText(titles.menu)).toBeVisible();
  expect((await admin.get(`/tasks/${taskIds.menu}`)).status).toBe("DONE");

  // The list view shows the same data.
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("link", { name: titles.drag })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toBeVisible();
});

test("F8: a viewer sees the board without drag handles or Move to menus", async ({ browser }) => {
  const page = await signIn(browser, "viewer@neostat.test");
  await board(page);
  await expect(page.getByRole("link", { name: titles.stale })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);
  await expect(page.locator("li[draggable='true']")).toHaveCount(0);
});

test("F9: moving a stale card shows the conflict toast, returns the card and saves nothing", async ({ browser }) => {
  const page = await signIn(browser, "admin@neostat.test");
  await board(page);
  await expect(column(page, "To do").getByText(titles.stale)).toBeVisible();

  // Someone else moves it first; this page still holds version 1.
  await admin.patch(`/tasks/${taskIds.stale}`, { version: 1, status: "DONE" });

  // Record, per frame, which column holds the card. Once it leaves To do it must never flash back.
  await page.evaluate((title) => {
    const w = window as unknown as { __seen: string[]; __raf: number };
    w.__seen = [];
    const loop = () => {
      const li = [...document.querySelectorAll("li")].find((el) => el.textContent?.includes(title));
      w.__seen.push(li?.closest("[role=group]")?.getAttribute("aria-label")?.split(",")[0] ?? "none");
      w.__raf = requestAnimationFrame(loop);
    };
    loop();
  }, titles.stale);

  await page.getByRole("button", { name: `Move ${titles.stale}` }).click();
  await page.getByRole("menuitem", { name: "Move to In progress" }).click();
  await expect(page.getByText("Someone updated this task — refreshed to the latest version.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open task" })).toBeVisible();
  await expect(column(page, "Done").getByText(titles.stale)).toBeVisible();
  expect((await admin.get(`/tasks/${taskIds.stale}`)).status).toBe("DONE");

  const seen = await page.evaluate(() => {
    const w = window as unknown as { __seen: string[]; __raf: number };
    cancelAnimationFrame(w.__raf);
    return w.__seen;
  });
  const afterLeaving = seen.slice(seen.findIndex((column) => column !== "To do"));
  expect(afterLeaving, `column sequence: ${seen.join(" > ")}`).not.toContain("To do");
});

test("A long unbroken title wraps inside its card and does not widen the page on a phone", async ({ browser }) => {
  const page = await signIn(browser, "admin@neostat.test");
  await page.setViewportSize({ width: 390, height: 800 });
  await board(page);
  await expect(page.getByRole("link", { name: longTitle })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
