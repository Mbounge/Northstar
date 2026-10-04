import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  NEXT_DIST_DIR: ".next/prod-perf",
  NORTHSTAR_E2E: "1",
  NORTHSTAR_LOCAL_PRODUCTION_PROBE: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "northstar-e2e-anon-key",
};

for (const args of [
  ["node_modules/next/dist/bin/next", "build", "--webpack"],
  ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.production-performance.config.ts"],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
