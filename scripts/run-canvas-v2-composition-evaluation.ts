import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  buildCanvasV2CompositionSuiteReceipt,
  canvasV2CompositionPromptSteps,
  evaluateCanvasV2Composition,
  renderCanvasV2CompositionReviewMarkdown,
  type CanvasV2CompositionPromptCase,
} from "../lib/canvas-v2/composition-evaluation";
import {
  CANVAS_V2_COMPOSITION_EVALUATION_CORPUS,
  canvasV2CompositionCaseById,
  canvasV2CompositionCasesForTags,
} from "../lib/canvas-v2/composition-evaluation-corpus";
import { runCanvasV2CompositionJourneyInBrowser } from "./canvas-v2-composition-browser";

interface Options {
  baseUrl: string;
  mode: "deterministic" | "production";
  caseIds: string[];
  tags: string[];
  outputDir: string;
  headed: boolean;
  repeat: number;
  timeoutMs: number;
  strict: boolean;
  list: boolean;
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  args.splice(index, 2);
  return value;
}

function parseOptions(argv: readonly string[]): Options {
  const args = [...argv];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options: Options = {
    baseUrl: process.env.CANVAS_V2_EVALUATION_BASE_URL ?? "http://127.0.0.1:3100",
    mode: "deterministic",
    caseIds: [],
    tags: ["smoke"],
    outputDir: path.resolve("artifacts", "canvas-v2-composition-evaluation", stamp),
    headed: false,
    repeat: 1,
    timeoutMs: 120_000,
    strict: false,
    list: false,
  };
  for (let index = 0; index < args.length;) {
    const flag = args[index];
    if (flag === "--base-url") options.baseUrl = readValue(args, index, flag);
    else if (flag === "--mode") {
      const mode = readValue(args, index, flag);
      if (mode !== "deterministic" && mode !== "production") throw new Error("--mode must be deterministic or production.");
      options.mode = mode;
    } else if (flag === "--case") {
      options.caseIds.push(...readValue(args, index, flag).split(",").map((value) => value.trim()).filter(Boolean));
      options.tags = [];
    } else if (flag === "--tag") {
      if (options.tags.length === 1 && options.tags[0] === "smoke") options.tags = [];
      options.tags.push(...readValue(args, index, flag).split(",").map((value) => value.trim()).filter(Boolean));
    } else if (flag === "--output-dir") options.outputDir = path.resolve(readValue(args, index, flag));
    else if (flag === "--repeat") options.repeat = Number.parseInt(readValue(args, index, flag), 10);
    else if (flag === "--timeout-ms") options.timeoutMs = Number.parseInt(readValue(args, index, flag), 10);
    else if (flag === "--headed") { options.headed = true; args.splice(index, 1); }
    else if (flag === "--strict") { options.strict = true; args.splice(index, 1); }
    else if (flag === "--list") { options.list = true; args.splice(index, 1); }
    else if (flag === "--help" || flag === "-h") {
      console.log(`Northstar Canvas composition evaluation\n\nUsage:\n  npm run evaluate:canvas-v2:compositions -- [options]\n\nOptions:\n  --mode deterministic|production  Use the fixture route or real /canvas model route\n  --base-url URL                  Running Northstar URL (default http://127.0.0.1:3100)\n  --case ID[,ID]                  Run exact corpus case IDs\n  --tag TAG[,TAG]                 Run cases containing every tag (default smoke)\n  --repeat N                      Repeat each prompt N times\n  --headed                        Show the Playwright browser window\n  --output-dir PATH               Screenshot and report destination\n  --timeout-ms N                  Per terminal-state wait\n  --strict                        Exit non-zero for structural errors\n  --list                          List corpus cases without running them`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 10) throw new Error("--repeat must be an integer from 1 to 10.");
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) throw new Error("--timeout-ms must be at least 1000.");
  return options;
}

function selectCases(options: Options): CanvasV2CompositionPromptCase[] {
  if (options.caseIds.length) return options.caseIds.map((id) => {
    const promptCase = canvasV2CompositionCaseById(id);
    if (!promptCase) throw new Error(`Unknown composition case: ${id}`);
    return promptCase;
  });
  return canvasV2CompositionCasesForTags(options.tags);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.list) {
    for (const promptCase of CANVAS_V2_COMPOSITION_EVALUATION_CORPUS) console.log(`${promptCase.id}\t${promptCase.category}\t${promptCase.tags.join(",")}`);
    return;
  }
  const promptCases = selectCases(options);
  if (!promptCases.length) throw new Error("No composition cases matched the requested selection.");
  await fs.mkdir(options.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: !options.headed });
  const receipts = [];
  const screenshots: Record<string, string> = {};
  try {
    for (const promptCase of promptCases) {
      for (let run = 1; run <= options.repeat; run += 1) {
        const runId = options.repeat > 1 ? `${promptCase.id}--run-${run}` : promptCase.id;
        console.log(`Evaluating ${runId} on ${options.mode === "production" ? "/canvas" : "/canvas-v2-e2e"}…`);
        const context = await browser.newContext({ baseURL: options.baseUrl, viewport: { width: 1600, height: 1000 } });
        const page = await context.newPage();
        const steps = canvasV2CompositionPromptSteps(promptCase);
        const screenshotPaths = Object.fromEntries(steps.map((step, stepIndex) => {
          const stepSuffix = stepIndex ? `--${step.id.slice(promptCase.id.length + 2)}` : "";
          return [step.id, path.join(options.outputDir, `${runId}${stepSuffix}.png`)];
        }));
        const journey = await runCanvasV2CompositionJourneyInBrowser(page, promptCase, {
          route: options.mode === "production" ? "/canvas" : "/canvas-v2-e2e",
          timeoutMs: options.timeoutMs,
          screenshotPaths,
        });
        for (let stepIndex = 0; stepIndex < journey.length; stepIndex += 1) {
          const result = journey[stepIndex];
          const stepSuffix = stepIndex ? `--${result.promptCase.id.slice(promptCase.id.length + 2)}` : "";
          const stepRunId = `${runId}${stepSuffix}`;
          const receipt = evaluateCanvasV2Composition(result.promptCase, result.snapshot, { previousSnapshot: journey[stepIndex - 1]?.snapshot });
          receipts.push(receipt);
          screenshots[receipt.caseId] = path.basename(screenshotPaths[result.promptCase.id]);
          await fs.writeFile(path.join(options.outputDir, `${stepRunId}.snapshot.json`), `${JSON.stringify(result.snapshot, null, 2)}\n`);
          await fs.writeFile(path.join(options.outputDir, `${stepRunId}.receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const suite = buildCanvasV2CompositionSuiteReceipt(receipts);
  await fs.writeFile(path.join(options.outputDir, "suite.json"), `${JSON.stringify(suite, null, 2)}\n`);
  await fs.writeFile(path.join(options.outputDir, "review.md"), `${renderCanvasV2CompositionReviewMarkdown(suite, screenshots)}\n`);
  await fs.writeFile(path.join(options.outputDir, "run.json"), `${JSON.stringify({
    schema: "canvas-v2.composition-evaluation-run.v1",
    mode: options.mode,
    baseUrl: options.baseUrl,
    caseIds: promptCases.map((promptCase) => promptCase.id),
    repeat: options.repeat,
    createdAt: suite.createdAt,
  }, null, 2)}\n`);
  console.log(`Composition evaluation complete: ${receipts.length} receipt(s) in ${options.outputDir}`);
  console.log(`Structural states: ${receipts.map((receipt) => `${receipt.caseId}=${receipt.structuralState}`).join(", ")}`);
  if (suite.crossCaseFindings.length) console.log(`Human review signals: ${suite.crossCaseFindings.length}`);
  if (options.strict && receipts.some((receipt) => receipt.structuralState !== "verified")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
