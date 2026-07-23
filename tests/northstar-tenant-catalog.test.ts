import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  authoritativeNorthStarFlowSessionType,
  normalizeNorthStarDataCatalogRows,
} from "@/lib/northstar-data/catalog";

function tenantRows() {
  return [{
    id: "app-row-awin",
    tenant_id: "tenant-1",
    app_name: "Awin",
    category: "Affiliate Marketing",
    icon_url: "https://assets.example/awin.png",
    app_sessions: [{
      id: "session-row-awin-mobile-onboarding",
      app_name: "Awin",
      platform: "mobile",
      session_type: "onboarding",
      total_screens: 3,
      flows_data: {
        screen_catalog: [
          { timeline_step: 1, screenshot_file: "01-welcome.png", display_label: "Welcome" },
          { timeline_step: 2, screenshot_file: "02-email.png", display_label: "Email verification" },
          { timeline_step: 3, screenshot_file: "03-active.png", display_label: "Registration successful" },
        ],
        taxonomy: [{
          id: "account-activation",
          label: "Account Activation & First Login",
          screens: [1, 2, 3],
        }],
      },
      steps_data: [
        { step: 1, imagePath: "01-welcome.png", screen_type: "Welcome" },
        { step: 2, imagePath: "02-email.png", screen_type: "Email verification" },
        { step: 3, imagePath: "03-active.png", screen_type: "Registration successful" },
      ],
    }],
  }];
}

test("the canonical tenant catalog preserves one deterministic identity graph for apps, flows, and screenshots", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://northstar.supabase.co";
  try {
    const first = normalizeNorthStarDataCatalogRows(tenantRows(), "tenant-1");
    const second = normalizeNorthStarDataCatalogRows(tenantRows(), "tenant-1");
    assert.deepEqual(first, second);

    const app = first.apps[0];
    assert.ok(app);
    assert.equal(app.name, "Awin");
    assert.equal(app.totalScreens, 3);
    assert.equal(app.iconUrl, "https://assets.example/awin.png");

    const flow = app.flows.find((entry) => entry.name === "Account Activation & First Login");
    if (!flow) throw new Error("Expected the taxonomy flow.");
    assert.equal(flow.appId, app.id);
    assert.equal(authoritativeNorthStarFlowSessionType(flow), "onboarding");
    assert.deepEqual(flow.screens.map((screen) => screen.name), [
      "Welcome",
      "Email verification",
      "Registration successful",
    ]);
    assert.ok(flow.screens.every((screen) => screen.appId === app.id && screen.flowId === flow.id));
    assert.ok(flow.screens.every((screen) => screen.imageUrl?.includes("/reviews/tenant-1/Awin/onboarding/screenshots/")));

    assert.equal(app.id, "app:tenant-1:app-row-awin");
    assert.match(flow.sessionId, /session-row-awin-mobile-onboarding$/);
    assert.equal(
      app.flows.some((entry) => entry.name === "Mobile Onboarding"),
      false,
      "a broad session fallback must not compete with detailed taxonomy flows",
    );

    const fallbackRows = tenantRows();
    fallbackRows[0].app_sessions[0].flows_data.taxonomy = [];
    const fallbackCatalog = normalizeNorthStarDataCatalogRows(fallbackRows, "tenant-1");
    const fallback = fallbackCatalog.apps[0]?.flows.find((entry) => entry.name === "Mobile Onboarding");
    if (!fallback) throw new Error("Expected a fallback flow when taxonomy is absent.");
    assert.match(fallback.sessionId, /session-row-awin-mobile-onboarding$/);
    assert.equal(fallback.screens.length, 3);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }
});

test("the Apps tab and agent data tools import the same canonical tenant catalog", () => {
  const workspace = readFileSync("components/canvas/north-star-canvas-workspace.tsx", "utf8");
  const agentTools = readFileSync("lib/canvas-ai/northstar-data-tools.ts", "utf8");
  for (const source of [workspace, agentTools]) {
    assert.match(source, /NORTHSTAR_TENANT_CATALOG_SELECT/);
    assert.match(source, /normalizeNorthStarDataCatalogRows/);
    assert.match(source, /@\/lib\/northstar-data\/catalog/);
  }
});
