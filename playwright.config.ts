import { defineConfig, devices } from "@playwright/test";

// E2E smoke suite runs against `next dev` with the seeded demo SQLite DB.
// Port 3100 is dedicated to E2E so it never collides with a running `npm run dev`.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Seed the demo DB once before the web server boots (skippable via E2E_SKIP_SEED=1).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry absorbs `next dev`'s occasional transient 404 while it compiles a
  // route on first hit. Kept on locally too so the smoke suite is deterministic.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Generous timeouts: `next dev` compiles each route on first hit, which can
  // take 10-25s cold. Keeps the suite non-flaky without artificial sleeps.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXTAUTH_URL: BASE_URL,
      // A dummy key keeps provider/env checks happy; smoke tests never run a real mission.
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-ant-e2e-dummy",
    },
  },
});
