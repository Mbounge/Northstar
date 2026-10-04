import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "canvas-v2-production-performance.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3201",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3201",
    url: "http://127.0.0.1:3201/canvas-v2-e2e/stress?scenario=composition",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      NEXT_DIST_DIR: ".next/prod-perf",
      NORTHSTAR_E2E: "1",
      NORTHSTAR_LOCAL_PRODUCTION_PROBE: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "northstar-e2e-anon-key",
    },
  },
});
