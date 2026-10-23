import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Runs against the dev servers (`npm run dev`) and the seeded development database.
const systemChromium = "/usr/bin/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: existsSync(systemChromium) && !process.env.PW_BUNDLED_BROWSER ? { executablePath: systemChromium } : {},
  },
});
