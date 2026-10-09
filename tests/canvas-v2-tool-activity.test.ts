import assert from "node:assert/strict";
import test from "node:test";
import { canvasV2HasConfirmedWebSearch, canvasV2ActivitySummary, canvasV2ReadableAgentText, canvasV2ReadableActivity, canvasV2TechnicalDetailRequested, type CanvasV2Activity } from "../lib/canvas-v2/tool-activity";

test("activity remains visible without exposing failed attempts", () => {
  const action = (label: string, status: CanvasV2Activity["status"]): CanvasV2Activity => ({ id: `${label}:${status}`, requestId: "r", sequence: 1, at: "now", kind: "activity", label, status });
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "failed"), action("Composing the canvas", "started")], true), "Composing the canvas…");
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "failed")], true), "Composing the canvas");
  assert.equal(canvasV2ActivitySummary([action("Web research", "failed")], false), "Web research");
  assert.equal(canvasV2ActivitySummary([action("Composing the canvas", "started")], false), "Composing the canvas");
});

test("web-search activity requires a completed researcher receipt, not planning or a failed request", () => {
  assert.equal(canvasV2HasConfirmedWebSearch([]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "discovery-director", outcome: "completed", durationMs: 1 }]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "external-researcher", outcome: "rejected", durationMs: 1 }]), false);
  assert.equal(canvasV2HasConfirmedWebSearch([{ model: "test", role: "external-researcher", outcome: "completed", durationMs: 1 }]), true);
});


test("reasoning and tool activity retain design intent while IDs and debugging stay internal", () => {
  const reasoning = "I’m comparing the navigation against the original reference. I’ll keep its filled icons and make the active state easier to recognize.";
  assert.equal(canvasV2ReadableAgentText(reasoning), reasoning);
  const original: CanvasV2Activity = { id: 'a', requestId: 'r', sequence: 1, at: 'now', kind: 'activity', status: 'failed', label: 'Refine the selected element', detail: 'canvas_screen_element rejected nodeId=screen-1b6daf84-7d7a-44d3-993a-ecf4aeab39d4: selector stale' };
  assert.equal(canvasV2ReadableActivity(original), 'Refine the selected element');
  assert.match(original.detail!, /nodeId=/);
  assert.equal(canvasV2ReadableAgentText('Inspect DOM for nodeId=screen-1b6daf84-7d7a-44d3-993a-ecf4aeab39d4'), 'Inspect screen structure for the selected item'); // Recovery/evals still have the original record.
  const prose = canvasV2ReadableAgentText('I’ll update the CSS to preserve the DOM and JavaScript. The provider check failed. I’m keeping the same visual direction.');
  assert.match(prose, /styling.*screen structure.*interactions/);
  assert.match(prose, /same visual direction/);
  assert.doesNotMatch(prose, /CSS|DOM|JavaScript|ECONNRESET|provider/);
  assert.doesNotMatch(canvasV2ReadableAgentText('Updated screen-1b6daf84-7d7a-44d3-993a-ecf4aeab39d4 with canvas_screen.'), /screen-1b6|canvas_screen/);
});

test("presentation keeps reference links, product names and useful evidence limitations", () => {
  const answer = 'Compare Blue Ox and Medito. [Source](https://example.com/evidence.png). The source does not establish the actual retention rate.';
  assert.equal(canvasV2ReadableAgentText(answer), answer);
  const findings = 'The source is incomplete. Use a 3×5 grid. The measured delay is 200 ms.';
  assert.equal(canvasV2ReadableAgentText(findings), findings);
  assert.equal(canvasV2ReadableAgentText('GRAET Career mobile **ID:** `graet-career-mobile` Platform: Mobile',false,[{id:'graet-career-mobile',name:'GRAET Career mobile'}]), 'GRAET Career mobile Platform: Mobile');
  assert.equal(canvasV2ReadableAgentText('The saved `my-product-mobile` identity remains intact.'), 'The saved product identity remains intact.');
  assert.equal(canvasV2ReadableAgentText('The saved identity is Career mobile (my-product-mobile), for mobile screens.', false, [{id:'my-product-mobile',name:'Career mobile'}]), 'The saved identity is Career mobile, for mobile screens.');
  const deepLink = '[Screen](https://example.com/screens/1b6daf84-7d7a-44d3-993a-ecf4aeab39d4#abc)';
  assert.equal(canvasV2ReadableAgentText(deepLink), deepLink);
  assert.equal(canvasV2ReadableAgentText('The additional check was unavailable. Here is the latest answer; its review is unfinished.'), '');
  assert.equal(canvasV2ReadableAgentText('I’m making the last suggestion easier to reach.'), 'I’m making the last suggestion easier to reach.');
  assert.equal(canvasV2TechnicalDetailRequested('Explain how the CSS animation works.'), true);
  assert.equal(canvasV2TechnicalDetailRequested('Make the motion calmer.'), false);
  assert.equal(canvasV2ReadableAgentText('Tokens: blue `#1251dc`, background `#f1f4f8`.'), 'Palette: blue, background.');
  assert.equal(canvasV2ReadableAgentText('The CSS uses SVG icons.', true), 'The CSS uses SVG icons.');
});

test('journey diagnostics are translated without removing useful recovery reasoning or design timing',()=>{
 const text='The sheet opens with the intended 300–420ms transition. The private journey runner didn’t accept the textarea step, so I’m validating the same behavior directly and checking the edit-after-save path.';
 const presented=canvasV2ReadableAgentText(text);
 assert.match(presented,/300–420ms transition/);assert.match(presented,/I’m validating the same behavior directly/);
 assert.doesNotMatch(presented,/runner|didn’t accept|textarea/);
 assert.equal(canvasV2ReadableAgentText('I also caught a theme-rule syntax issue, so I’m checking the light appearance.'),'I’m checking the light appearance.');
});


test('private probe timing does not become a public product failure or hide the next useful check',()=>{
 const original='The first private path exposed a timing-sensitive handoff between the sheet’s entrance motion and the text field; the editor itself opened correctly, but the test tried to fill before the field was reachable. I’m lengthening only that opening step and rerunning the same journey, then I’ll verify the reduced-motion path separately.';
 const presented=canvasV2ReadableAgentText(original);
 assert.equal(presented,'I’m checking the opening and the same flow again, then I’ll verify the reduced-motion path separately.');
 assert.match(original,/private path exposed/,'presentation must not mutate retained reasoning');
 assert.equal(canvasV2ReadableAgentText('Medito’s onboarding uses one calm decision at a time, while GRAET keeps its blue actions and typography.'),'Medito’s onboarding uses one calm decision at a time, while GRAET keeps its blue actions and typography.');
 assert.equal(canvasV2ReadableAgentText('The user’s supplied video is missing the final transition.'),'The user’s supplied video is missing the final transition.');
});


test('motion verification keeps the user experience clear without revealing assertion machinery',()=>{
 const input='The full no-preference path now passes end to end. The reduced-motion check reached the close control too; its assertion was simply evaluated during the fixed cleanup window, so I’m rerunning with enough settling time to verify the unobstructed home rather than treating an in-flight hidden-state cleanup as a failure.';
 const text=canvasV2ReadableAgentText(input);
 assert.match(text,/full flow with animation.*passes end to end/);
 assert.match(text,/I’m checking the unobstructed home/);
 assert.doesNotMatch(text,/assertion|cleanup|failure|rerunning|no-preference/);
 assert.equal(canvasV2ReadableAgentText('I’m opening the sheet synchronously before the reflow-driven transition, so private reduced-motion checks can reach the close control.'),'I’m opening the sheet before its entrance animation, so reduced-motion checks can reach the close control.');
});

test('asset preparation keeps design reasoning and visible defects without private rejection mechanisms',()=>{
  const rejection='The public screen is unchanged; the local draft was rejected because the newly prepared icon wasn’t yet registered in the current canvas read. I’m refreshing the canvas context and will re-submit the same visual/interaction correction with that reference assets explicitly recognized.';
  assert.equal(canvasV2ReadableAgentText(rejection),'I’m checking the reference assets and will apply the same design correction with the reference icon.');
  const binding='The asset is registered, but the screen validator won’t accept a dynamically assigned image handle; I’m moving the same retained tile into the screen’s declared styling while keeping the markup and interaction behavior otherwise identical.';
  assert.equal(canvasV2ReadableAgentText(binding),'I’m applying the original icon while keeping the markup and interaction behavior otherwise identical.');
  const finding='The review caught one concrete issue: the extracted tile did not render in the live screen, leaving the left icon blank. I’m replacing that failed image binding with a native target glyph that matches the inspected original silhouette.';
  assert.equal(canvasV2ReadableAgentText(finding),'The review caught one concrete issue: the reference icon is missing from the screen, leaving the left icon blank. I’m replacing that missing icon with a target icon that matches the inspected original silhouette.');
  assert.match(rejection,/local draft was rejected/,'original diagnostics remain intact');
});
