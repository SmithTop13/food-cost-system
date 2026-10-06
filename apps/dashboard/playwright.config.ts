import { defineConfig, devices } from "@playwright/test";

// End-to-end: real API + real dashboard + a real browser.
// Needs PostgreSQL (E2E_DATABASE_URL) and built apps: `API_URL=http://localhost:3101 pnpm build` at the repo root.
const API_PORT = 3101;
const WEB_PORT = 3201;
const DATABASE_URL = process.env["E2E_DATABASE_URL"] ?? "postgres://fcs:fcs@localhost:5432/fcs_e2e";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env["CHROMIUM_PATH"] ? { executablePath: process.env["CHROMIUM_PATH"] } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node ../../services/api/dist/main.js",
      url: `http://localhost:${API_PORT}/health`,
      env: { PORT: String(API_PORT), DATABASE_URL },
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});

export const API_BASE = `http://localhost:${API_PORT}`;
