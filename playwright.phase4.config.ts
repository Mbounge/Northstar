import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 40_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: process.env.NORTHSTAR_CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
