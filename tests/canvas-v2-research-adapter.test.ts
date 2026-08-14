import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeAppDataRows, type AppDataCatalog } from "../lib/app-data/canvas-v2-catalog";
import {
  canonicalReviewScreenshotUrl,
  resolveReviewScreenshotStoragePrefix,
} from "../lib/app-data/review-media";
import { runCanvasV2Research } from "../lib/canvas-v2/research-adapter";

const catalog: AppDataCatalog = {
  tenantId: "tenant-1",
  apps: [{
    id: "app:awin",
    name: "Awin",
    iconUrl: "https://assets.example/awin.png",
    category: "Affiliate marketing",
    totalScreens: 2,
    flows: [{
      id: "flow:onboarding",
      name: "Partner onboarding",
      appName: "Awin",
      platform: "mobile",
      sessionType: "onboarding",
      screens: [
        { id: "screen:1", name: "Role selection", imageUrl: "https://assets.example/role.png", appName: "Awin", flowName: "Partner onboarding", platform: "mobile", sessionType: "onboarding", index: 0 },
        { id: "screen:2", name: "Account details", imageUrl: "https://assets.example/account.png", appName: "Awin", flowName: "Partner onboarding", platform: "mobile", sessionType: "onboarding", index: 1 },
      ],
    }],
  }],
};

test("lists tenant apps and returns exact icon evidence", () => {
  const result = runCanvasV2Research(catalog, { operation: "list-apps" });
  assert.equal(result.apps[0].name, "Awin");
  assert.deepEqual(result.evidence.map((asset) => asset.id), ["icon:app:awin"]);
});

test("retrieves an ordered flow with exact screenshot evidence bindings", () => {
  const result = runCanvasV2Research(catalog, { operation: "flow-screens", appName: "Awin", flowName: "onboarding" });
  assert.deepEqual(result.screens.map((screen) => screen.id), ["screen:1", "screen:2"]);
  assert.deepEqual(result.evidence.filter((asset) => asset.screen).map((asset) => [asset.id, asset.url]), [
    ["screen:screen:1", "https://assets.example/role.png"],
    ["screen:screen:2", "https://assets.example/account.png"],
  ]);
});

test("semantic screenshot search stays grounded in catalog identities", () => {
  const result = runCanvasV2Research(catalog, { operation: "search", query: "role selection" });
  assert.equal(result.screens[0].name, "Role selection");
  assert.equal(result.screens[0].appName, "Awin");
});

test("an unknown app never falls through to unrelated tenant evidence", () => {
  const result = runCanvasV2Research(catalog, { operation: "list-flows", appName: "Unrelated product" });
  assert.deepEqual(result.apps, []);
  assert.deepEqual(result.flows, []);
  assert.deepEqual(result.evidence, []);
});

test("tenant taxonomy roots become coherent deduplicated journeys without losing their child paths", () => {
  const screen = (step: number, name: string) => ({ timeline_step: step, display_label: name, screenshot_file: `https://assets.example/awin/${step}.png` });
  const screenCatalog = [screen(1, "Welcome"), screen(2, "Persona"), screen(3, "Account"), screen(4, "Verification"), screen(5, "Success")];
  const apps = normalizeAppDataRows([{
    app_name: "Awin",
    icon_url: "https://assets.example/awin/icon.png",
    app_sessions: [{
      platform: "mobile",
      session_type: "onboarding",
      steps_data: screenCatalog,
      flows_data: {
        screen_catalog: screenCatalog,
        taxonomy: [{
          id: "partner-onboarding",
          label: "Partner onboarding",
          children: [
            { id: "entry", label: "Landing and persona selection", screens: [1, 2, 3] },
            { id: "verification", label: "Verification and activation", screens: [3, 4, 5] },
          ],
        }],
      },
    }],
  }], "tenant-1");

  const journey = apps[0]?.flows.find((flow) => flow.scope === "journey");
  assert.ok(journey);
  assert.equal(journey.name, "Partner onboarding");
  assert.deepEqual(journey.screens.map((item) => item.name), ["Welcome", "Persona", "Account", "Verification", "Success"]);
  assert.equal(journey.sourceScreenCount, 6);
  assert.equal(journey.duplicateScreenCount, 1);
  assert.equal(journey.descendantFlowCount, 2);
  assert.deepEqual(apps[0]?.flows.filter((flow) => flow.scope === "flow").map((flow) => flow.taxonomyPath), [
    ["Partner onboarding", "Landing and persona selection"],
    ["Partner onboarding", "Verification and activation"],
  ]);
  assert.equal(apps[0]?.flows.filter((flow) => flow.scope === "session").length, 1);
});

test("branching taxonomy becomes complete path candidates instead of one flattened journey", () => {
  const screen = (step: number, name: string) => ({ timeline_step: step, display_label: name, screenshot_file: `https://assets.example/awin/${step}.png` });
  const screenCatalog = [
    screen(1, "Welcome"), screen(2, "Persona"),
    screen(3, "Creator details"), screen(4, "Creator success"),
    screen(5, "Advertiser details"), screen(6, "Advertiser success"),
  ];
  const apps = normalizeAppDataRows([{
    app_name: "Awin",
    app_sessions: [{
      platform: "mobile",
      session_type: "onboarding",
      flows_data: {
        screen_catalog: screenCatalog,
        taxonomy: [{
          id: "persona-onboarding",
          label: "Persona onboarding",
          screens: [1, 2, 3, 4, 5, 6],
          spine: ["1.png", "2.png"],
          branches: [
            { id: "creator", label: "Creator path", screenshots: ["3.png", "4.png"] },
            { id: "advertiser", label: "Advertiser path", screenshots: ["5.png", "6.png"] },
          ],
        }],
      },
    }],
  }], "tenant-1");
  const paths = apps[0]?.flows.filter((flow) => flow.scope === "path") ?? [];
  assert.deepEqual(paths.map((flow) => flow.name), ["Persona onboarding · Creator path", "Persona onboarding · Advertiser path"]);
  assert.deepEqual(paths.map((flow) => flow.screens.map((item) => item.name)), [
    ["Welcome", "Persona", "Creator details", "Creator success"],
    ["Welcome", "Persona", "Advertiser details", "Advertiser success"],
  ]);
  assert.equal(apps[0]?.flows.filter((flow) => flow.scope === "journey").length, 0);
  assert.equal(apps[0]?.flows.find((flow) => flow.scope === "collection")?.screens.length, 6);
});

test("curated sibling roots compile common entry plus each complete branch", () => {
  const screen = (step: number, name: string) => ({ timeline_step: step, display_label: name, screenshot_file: `https://assets.example/awin/${step}.png` });
  const screenCatalog = [
    screen(1, "Landing"), screen(2, "Sign in"), screen(3, "Choose persona"),
    screen(4, "Creator welcome"), screen(5, "Creator profile"), screen(6, "Creator verification"), screen(7, "Creator success"),
    screen(8, "Advertiser welcome"), screen(9, "Advertiser company"),
  ];
  const apps = normalizeAppDataRows([{
    app_name: "Awin",
    app_sessions: [{
      platform: "mobile",
      session_type: "onboarding",
      flows_data: {
        screen_catalog: screenCatalog,
        taxonomy: [
          { id: "entry", label: "Landing & Persona Selection", screens: [1, 2, 3] },
          { id: "creator", label: "Creator & Influencer Onboarding", screens: [4, 5, 6, 7] },
          { id: "advertiser", label: "Advertiser & Brand Solutions", screens: [8, 9] },
        ],
      },
    }],
  }], "tenant-1");
  const paths = apps[0]?.flows.filter((flow) => flow.scope === "path") ?? [];
  assert.deepEqual(paths.map((flow) => flow.name), [
    "Landing & Persona Selection → Creator & Influencer Onboarding",
    "Landing & Persona Selection → Advertiser & Brand Solutions",
  ]);
  assert.deepEqual(paths[0]?.screens.map((item) => item.name), [
    "Landing", "Sign in", "Choose persona", "Creator welcome", "Creator profile", "Creator verification", "Creator success",
  ]);
  assert.deepEqual(paths[0]?.journeySegments, [
    { id: `${paths[0]?.id}-entry`, name: "Landing & Persona Selection", kind: "shared-entry", startIndex: 0, screenCount: 3 },
    { id: `${paths[0]?.id}-branch`, name: "Creator & Influencer Onboarding", kind: "branch", startIndex: 3, screenCount: 4 },
  ]);
  assert.equal(paths.some((flow) => flow.screens.length === screenCatalog.length), false);
});

test("is_reference makes a curated shared entry authoritative for broad onboarding", () => {
  const screen = (step: number, name: string) => ({ timeline_step: step, display_label: name, screenshot_file: `https://assets.example/awin/reference-${step}.png` });
  const screenCatalog = [screen(1, "Entry"), screen(2, "Persona"), screen(3, "Creator profile"), screen(4, "Creator success")];
  const apps = normalizeAppDataRows([{
    app_name: "Awin",
    app_sessions: [{
      platform: "mobile",
      session_type: "onboarding",
      flows_data: {
        screen_catalog: screenCatalog,
        taxonomy: [
          { id: "common", label: "Common product gateway", is_reference: true, screens: [1, 2] },
          { id: "creator", label: "Creator onboarding", screens: [3, 4] },
        ],
      },
    }],
  }], "tenant-1");
  const complete = apps[0]?.flows.find((flow) => flow.completeJourney);
  assert.equal(complete?.name, "Common product gateway → Creator onboarding");
  assert.equal(complete?.screens.length, 4);
  assert.deepEqual(complete?.journeySegments?.map((segment) => [segment.kind, segment.screenCount]), [["shared-entry", 2], ["branch", 2]]);
});

test("one media authority resolves root and nested mobile storage without renderer guessing", async () => {
  const calls: string[] = [];
  const storage = {
    from: () => ({
      list: async (path: string) => {
        calls.push(path);
        return { data: path.includes("/mobile/") ? [] : [{ name: "welcome.png" }], error: null };
      },
    }),
  } as any;
  const prefix = await resolveReviewScreenshotStoragePrefix({
    storage,
    tenantId: "tenant",
    appName: "Example App",
    platform: "mobile",
    sessionType: "onboarding",
    reference: "welcome.png",
  });
  assert.equal(prefix, "");
  assert.deepEqual(calls, ["tenant/Example App/onboarding/screenshots", "tenant/Example App/mobile/onboarding/screenshots"]);
  assert.equal(canonicalReviewScreenshotUrl("welcome.png", {
    supabaseUrl: "https://storage.example",
    tenantId: "tenant",
    appName: "Example App",
    platform: "mobile",
    sessionType: "onboarding",
    storagePrefix: prefix,
  }), "https://storage.example/storage/v1/object/public/reviews/tenant/Example%20App/onboarding/screenshots/welcome.png");
});

test("the V2 research boundary contains no legacy creative-engine dependency", () => {
  const adapter = readFileSync("lib/canvas-v2/research-adapter.ts", "utf8");
  const catalogSource = readFileSync("lib/app-data/canvas-v2-catalog.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/research/route.ts", "utf8");
  assert.doesNotMatch(`${adapter}\n${catalogSource}\n${route}`, /@\/lib\/canvas-ai|northstar-data-tools|northstar-tool-registry/);
  assert.match(route, /auth\.getUser/);
  assert.match(catalogSource, /\.eq\("tenant_id", tenantId\)/);
});
