import fs from "node:fs";
import { chromium } from "@playwright/test";

/**
 * Prefer an explicit override, then common system Chrome/Chromium locations,
 * then Playwright's managed browser when it is installed.
 */
export function resolveNorthstarChromiumExecutable(): string | undefined {
  const candidates = [
    process.env.NORTHSTAR_CHROMIUM_PATH,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    process.platform === "linux" ? "/usr/bin/chromium" : undefined,
    process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined,
    chromium.executablePath(),
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
}
