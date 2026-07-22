import assert from "node:assert/strict";
import { expect, test, type Page } from "@playwright/test";
import { buildNorthstarProjectionBridgeScript } from "../lib/canvas-projection/bridge-script";
import { NORTHSTAR_PROJECTION_PROTOCOL_VERSION } from "../lib/canvas-projection/types";

type BridgeResponse = {
  protocolVersion: number;
  type: "northstar.projection.response";
  requestId: string;
  surfaceSessionId: string;
  ok: boolean;
  state?: unknown;
  code?: string;
  message?: string;
};

async function sendBridgeRequest(page: Page, request: Record<string, unknown>): Promise<BridgeResponse> {
  return page.evaluate((message) => new Promise<BridgeResponse>((resolve, reject) => {
    const iframe = document.querySelector<HTMLIFrameElement>("#surface");
    const target = iframe?.contentWindow;
    if (!target) {
      reject(new Error("Projection iframe is unavailable."));
      return;
    }
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(`Projection request ${String(message.requestId)} timed out.`));
    }, 3_000);
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== target ||
        !event.data ||
        event.data.type !== "northstar.projection.response" ||
        event.data.requestId !== message.requestId
      ) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data as BridgeResponse);
    };
    window.addEventListener("message", onMessage);
    target.postMessage(message, "*");
  }), request);
}

function request(type: string, requestId: string, extra: Record<string, unknown> = {}) {
  return {
    protocolVersion: NORTHSTAR_PROJECTION_PROTOCOL_VERSION,
    type,
    requestId,
    ...extra,
  };
}

test("direct projection prepares detached state and mutates one stable live surface operation by operation", async ({ page }) => {
  const bridge = buildNorthstarProjectionBridgeScript();
  await page.setContent('<iframe id="surface"></iframe><iframe id="attacker"></iframe>');
  const srcdoc = `<!doctype html><html><head></head><body><div id="northstar-artifact-root" data-ns-node-id="root"><p data-ns-node-id="title" style="font-weight: 700">Hello <strong data-ns-node-id="strong">world</strong>!</p><svg data-ns-node-id="icon" viewBox="0 0 10 10"><linearGradient data-ns-node-id="gradient" gradientUnits="userSpaceOnUse"></linearGradient></svg></div><script>${bridge.replaceAll("</script", "<\\/script")}</script></body></html>`;
  await page.locator("#surface").evaluate((iframe, source) => {
    (iframe as HTMLIFrameElement).srcdoc = source;
  }, srcdoc);

  const surfaceFrame = page.frameLocator("#surface");
  await expect(surfaceFrame.locator("#northstar-artifact-root")).toBeVisible();
  await surfaceFrame.locator("#northstar-artifact-root").evaluate((root) => {
    const title = root.querySelector('[data-ns-node-id="title"]');
    const icon = root.querySelector('[data-ns-node-id="icon"]');
    Object.assign(window, {
      __northstarRootReference: root,
      __northstarTitleReference: title,
      __northstarTitleTextReference: title?.firstChild,
      __northstarIconReference: icon,
      __northstarSurfaceMarker: {},
    });
  });

  const captured = await sendBridgeRequest(page, request("northstar.projection.capture", "capture-base"));
  assert.equal(captured.ok, true);
  assert.ok(captured.state);
  const base = captured.state as {
    root: { children: Array<{ kind: string; id: string; children?: Array<{ kind: string; id: string }> }> };
  };
  const title = base.root.children.find((node) => node.id === "title");
  assert.equal(title?.kind, "element");
  const titleTextId = title?.children?.find((node) => node.kind === "text")?.id;
  assert.ok(titleTextId);

  const operations = [
    { type: "set-text", nodeId: titleTextId, text: "Updated " },
    { type: "set-classes", nodeId: "title", classes: ["primary", "headline"] },
    {
      type: "set-styles",
      nodeId: "title",
      styles: {
        color: { value: "red", priority: "" },
        margin: { value: "0 10px", priority: "" },
        "--Accent": { value: "12px", priority: "important" },
      },
    },
    {
      type: "set-attributes",
      nodeId: "title",
      attributes: { "aria-label": "Updated title", "DATA-role": "hero" },
    },
    {
      type: "set-attributes",
      nodeId: "icon",
      attributes: { viewBox: "0 0 20 20", "aria-label": "Icon" },
    },
    {
      type: "insert-node",
      parentId: "root",
      index: 1,
      node: {
        kind: "element",
        id: "evidence",
        tag: "section",
        namespace: "html",
        attributes: { "aria-label": "Evidence" },
        classes: ["evidence"],
        styles: {},
        children: [{ kind: "text", id: "evidence-text", text: "Evidence block" }],
      },
    },
    { type: "move-node", nodeId: "icon", parentId: "root", index: 0 },
    { type: "remove-node", nodeId: "strong" },
    { type: "set-css-layer", layerId: "phase3", cssText: ".evidence { display: grid; }" },
    { type: "set-space", space: { left: 24, top: 16, right: 24, bottom: 32 } },
  ];

  const prepared = await sendBridgeRequest(page, request("northstar.projection.prepare", "prepare", {
    baseState: captured.state,
    operations,
  }));
  assert.equal(prepared.ok, true);
  assert.ok(prepared.state);
  await expect(surfaceFrame.locator('[data-ns-node-id="title"]')).toContainText("Hello world!");
  await expect(surfaceFrame.locator('[data-ns-node-id="evidence"]')).toHaveCount(0);

  for (let index = 0; index < operations.length; index += 1) {
    const applied = await sendBridgeRequest(page, request("northstar.projection.apply", `apply-${index}`, {
      surfaceSessionId: captured.surfaceSessionId,
      operationIndex: index,
      operation: operations[index],
    }));
    assert.equal(applied.ok, true, applied.message);
  }

  const verified = await sendBridgeRequest(page, request("northstar.projection.capture", "capture-target", {
    surfaceSessionId: captured.surfaceSessionId,
  }));
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.state, prepared.state);

  const identity = await surfaceFrame.locator("#northstar-artifact-root").evaluate((root) => {
    const scope = window as typeof window & Record<string, unknown>;
    const title = root.querySelector('[data-ns-node-id="title"]');
    const icon = root.querySelector('[data-ns-node-id="icon"]');
    return {
      rootStable: root === scope.__northstarRootReference,
      titleStable: title === scope.__northstarTitleReference,
      titleTextStable: title?.firstChild === scope.__northstarTitleTextReference,
      iconStable: icon === scope.__northstarIconReference,
      markerStable: Boolean(scope.__northstarSurfaceMarker),
      rootChildOrder: Array.from(root.children).map((element) => element.getAttribute("data-ns-node-id")),
      svgViewBox: icon?.getAttribute("viewBox"),
      customProperty: (title as HTMLElement | null)?.style.getPropertyValue("--Accent"),
      customPriority: (title as HTMLElement | null)?.style.getPropertyPriority("--Accent"),
    };
  });
  assert.deepEqual(identity, {
    rootStable: true,
    titleStable: true,
    titleTextStable: true,
    iconStable: true,
    markerStable: true,
    rootChildOrder: ["icon", "title", "evidence"],
    svgViewBox: "0 0 20 20",
    customProperty: "12px",
    customPriority: "important",
  });

  const collision = await sendBridgeRequest(page, request("northstar.projection.apply", "collision", {
    surfaceSessionId: captured.surfaceSessionId,
    operationIndex: 99,
    operation: {
      type: "insert-node",
      parentId: "root",
      index: 0,
      node: {
        kind: "element",
        id: "new-wrapper",
        tag: "div",
        namespace: "html",
        attributes: {},
        classes: [],
        styles: {},
        children: [{ kind: "text", id: "evidence-text", text: "duplicate" }],
      },
    },
  }));
  assert.equal(collision.ok, false);
  assert.equal(collision.code, "DUPLICATE_NODE_ID");
  await expect(surfaceFrame.locator('[data-ns-node-id="new-wrapper"]')).toHaveCount(0);

  const unsupported = await sendBridgeRequest(page, request("northstar.projection.apply", "unsupported", {
    surfaceSessionId: captured.surfaceSessionId,
    operationIndex: 100,
    operation: { type: "replace-document", html: "<main>bad</main>" },
  }));
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, "UNSUPPORTED_OPERATION");

  const attackerResult = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLIFrameElement>("#surface")?.contentWindow;
    const attacker = document.querySelector<HTMLIFrameElement>("#attacker")?.contentWindow;
    if (!surface || !attacker) throw new Error("test frames unavailable");
    let observed = false;
    const listener = (event: MessageEvent) => {
      if (event.data?.requestId === "attacker-request") observed = true;
    };
    window.addEventListener("message", listener);
    (attacker as Window & { __target?: Window; __message?: unknown }).__target = surface;
    (attacker as Window & { __target?: Window; __message?: unknown }).__message = {
      protocolVersion: 1,
      type: "northstar.projection.capture",
      requestId: "attacker-request",
    };
    (attacker as unknown as { eval(code: string): unknown }).eval("window.__target.postMessage(window.__message, '*')");
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.removeEventListener("message", listener);
    return observed;
  });
  assert.equal(attackerResult, false);
});
