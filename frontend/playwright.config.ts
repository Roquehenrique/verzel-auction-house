import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the whole app (browser + Next.js + NestJS + PostgreSQL).
//
// They run on their own ports and their own database (leilao_e2e), so they
// never touch the development data. Requirements: the PostgreSQL container
// running (docker compose up -d) and backend/.env with the secrets
// (JWT_SECRET, BID_SIGNING_PRIVATE_KEY, PSEUDONYM_SECRET).
//
//   npm run test:e2e        headless
//   npm run test:e2e:ui     Playwright UI mode

const WEB_PORT = 3100;
const API_PORT = 3101;
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://leilao:leilao@localhost:5432/leilao_e2e";

export default defineConfig({
  testDir: "./e2e",
  // The tests share one database and the live auction state: run in order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // API on the e2e database. Secrets come from backend/.env.
      // Playwright starts web servers BEFORE globalSetup, so the database is
      // prepared here too (on a fresh machine it does not exist yet).
      name: "api",
      cwd: "../backend",
      command: "npm run e2e:prepare && npm run build && node dist/main.js",
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        AUTH_RATE_LIMIT: "1000", // the suite logs in many times
        SETTLEMENT_INTERVAL_MS: "1000",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Production build of the front pointing to the e2e API, in its own folder.
      name: "web",
      command: `npm run build && npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api`,
        NEXT_DIST_DIR: ".next-e2e",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
