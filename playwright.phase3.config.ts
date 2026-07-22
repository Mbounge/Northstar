import { defineConfig } from "@playwright/test";
import { resolveNorthstarChromiumExecutable } from "./e2e/northstar-playwright-browser";

const executablePath = resolveNorthstarChromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
