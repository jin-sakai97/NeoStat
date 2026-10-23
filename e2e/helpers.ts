import { type APIRequestContext, type Browser, expect, request } from "@playwright/test";

// Specs build their own projects through the API, so they do not depend on seed data.
export const API = (process.env.E2E_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
export const PASSWORD = "NeoStatsDemo!2026";
export const USER = {
  manager: "00000000-0000-4000-8000-000000000003",
  member: "00000000-0000-4000-8000-000000000005",
  viewer: "00000000-0000-4000-8000-000000000007",
};

export async function apiAs(email: string) {
  const ctx: APIRequestContext = await request.newContext();
  const csrf = (await (await ctx.get(`${API}/auth/csrf`)).json()).data.csrfToken as string;
  const login = await ctx.post(`${API}/auth/login`, { data: { email, password: PASSWORD }, headers: { "X-CSRF-Token": csrf } });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).data.csrfToken as string;
  const send = async (method: "post" | "patch" | "delete", path: string, data?: object) => {
    const res = await ctx[method](`${API}${path}`, { data, headers: { "X-CSRF-Token": token } });
    expect(res.ok(), `${method} ${path} → ${res.status()}`).toBeTruthy();
    return res.status() === 204 ? null : (await res.json()).data;
  };
  return {
    post: (path: string, data?: object) => send("post", path, data),
    patch: (path: string, data: object) => send("patch", path, data),
    del: (path: string) => send("delete", path),
    get: async (path: string) => (await (await ctx.get(`${API}${path}`)).json()).data,
  };
}

export async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

