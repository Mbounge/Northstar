import { chromium, expect, type Frame } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { sha, type Evidence, type Asset } from './evidence';
import { runtimeDocument, viewerDocument, type makeArtifact } from './artifact';

export type RenderSample = { id: string; stateId: string; captureId: string; render: string; renderHash: string; reference: string; referenceHash: string };
export type Verification = { passed: boolean; failures: string[]; samples: RenderSample[]; states: Array<{ stateId: string; captureId: string; render: string; renderHash: string; reference: string; referenceHash: string; pixelMeanError: number; controls: string[] }>; journeys: Array<{ id: string; passed: boolean; error?: string; steps: number }>; blockedRequests: string[]; resetPassed: boolean; runtimeErrors: string[] };
const control = (id: string) => `[data-ns-control="${id}"]`;
async function settle(frame: Frame) {
  await frame.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => undefined))); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
}
async function snapshot(frame: Frame) {
  return frame.evaluate(() => {
    const api = (window as unknown as { nsPreview: { stateId: string; data: unknown } }).nsPreview;
    const visible = (e: Element) => { const rect = e.getBoundingClientRect(), style = getComputedStyle(e); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
    const controls = [...document.querySelectorAll('button,input,textarea,select,a[href],[role="button"]')].filter(e => visible(e) && !(e as HTMLInputElement).disabled);
    const allIds = [...document.querySelectorAll('button,input,textarea,select,a[href],[role="button"]')].map(e => e.getAttribute('data-ns-control') ?? '');
    const ids = controls.map(e => e.getAttribute('data-ns-control') ?? '');
    const activeStates = [...document.querySelectorAll('[data-ns-state]')].filter(visible).map(e => e.getAttribute('data-ns-state'));
    return { activeStates, stateId: api.stateId, data: structuredClone(api.data), controls: ids,
      invalidControls: allIds.some((id, i) => !id || allIds.indexOf(id) !== i),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      brokenImages: [...document.images].filter(e => visible(e) && (!e.complete || !e.naturalWidth)).length,
      fields: [...document.querySelectorAll('input,textarea,select')].map(e => ({ id: e.getAttribute('data-ns-control'), value: (e as HTMLInputElement).value, checked: (e as HTMLInputElement).checked ?? false })),
      text: document.body.innerText.slice(0, 12000), scrollY,
    };
  });
}

/** Actual isolated UI execution. Model-authored test claims are never receipts.
 * Every canonical state is captured; journeys operate real native controls.
 * A screenshot-difference number is diagnostic, never a visual quality pass. */
export async function verifyArtifact(artifact: ReturnType<typeof makeArtifact>, evidence: Evidence, assets: Asset[], directory: string, signal: AbortSignal): Promise<Verification> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const doc = await runtimeDocument(artifact, assets), viewer = join(directory, 'preview.html');
  await writeFile(viewer, viewerDocument(doc, artifact.plan, evidence.viewport), { mode: 0o600 });
  const browser = await chromium.launch({ headless: true });
  const report: Verification = { passed: false, failures: [], samples: [], states: [], journeys: [], blockedRequests: [], resetPassed: false, runtimeErrors: [] };
  const abort = () => { void browser.close(); }; signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(() => { report.failures.push('Browser verification exceeded its 180-second wall-clock budget'); abort(); }, 180_000);
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ viewport: { width: Math.max(1280, evidence.viewport.width + 300), height: Math.max(1000, evidence.viewport.height + 100) } });
    context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(8000);
    const allowed = pathToFileURL(resolve(viewer)).href;
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url === allowed) return route.continue();
      report.blockedRequests.push(url.split(/[?#]/)[0].slice(0, 200)); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.runtimeErrors.push(error.message.slice(0, 500)));
    page.on('dialog', async dialog => { report.failures.push('App attempted a blocking browser dialog'); await dialog.dismiss(); });
    const load = async () => {
      await page.goto(allowed);
      const handle = await page.locator('iframe').elementHandle(); const frame = await handle?.contentFrame();
      if (!frame) throw new Error('Functional preview did not create its isolated frame');
      await frame.waitForFunction(() => Boolean((window as unknown as { nsPreview?: unknown }).nsPreview));
      await settle(frame); return frame;
    };
    let frame = await load();
    const initial = await snapshot(frame);
    if (initial.stateId !== artifact.plan.initialState) report.failures.push('Initial state differs from the planned captured entry');
    const exercised = new Set<string>();
    for (const state of artifact.plan.states) {
      signal.throwIfAborted();
      // Private checkpoints never mutate a user's live preview.
      await frame.evaluate(id => (window as unknown as { nsPreview: { checkpoint(id: string): void } }).nsPreview.checkpoint(id), state.id);
      await settle(frame);
      const observed = await snapshot(frame);
      if (JSON.stringify(observed.activeStates) !== JSON.stringify([state.id]) || observed.stateId !== state.id || observed.invalidControls || observed.overflow || observed.brokenImages) report.failures.push(`${state.id}: invalid state, unnamed/duplicate controls, horizontal overflow or missing artwork`);
      const image = await page.locator('iframe').screenshot({ animations: 'disabled' });
      const render = join(directory, state.id + '.png'); await writeFile(render, image, { mode: 0o600 });
      const capture = evidence.captures.find(c => c.id === state.captureId)!;
      const referenceBytes = await sharp(await readFile(capture.file)).resize(evidence.viewport.width, evidence.viewport.height, { fit: 'fill' }).png().toBuffer();
      const reference = join(directory, state.id + '-reference.png'); await writeFile(reference, referenceBytes, { mode: 0o600 });
      const actual = await sharp(image).resize(evidence.viewport.width, evidence.viewport.height).removeAlpha().raw().toBuffer();
      const expected = await sharp(referenceBytes).removeAlpha().raw().toBuffer();
      const pixelMeanError = actual.length === expected.length ? actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) / actual.length / 255 : 1;
      report.states.push({ stateId: state.id, captureId: state.captureId, render, renderHash: sha(image), reference, referenceHash: sha(referenceBytes), pixelMeanError, controls: observed.controls });
      if (state.motionRequired) report.failures.push(`${state.id}: temporal fidelity requires additional motion evidence; static screenshots do not verify timing`);
    }
    const entryReference = report.states.find(s => s.stateId === artifact.plan.initialState)!;
    frame = await load();
    const fresh = await page.locator('iframe').screenshot({ animations: 'disabled' });
    const freshPath = join(directory, 'fresh-start.png'); await writeFile(freshPath, fresh, {mode: 0o600});
    report.samples.push({id:'fresh-start', stateId: initial.stateId, captureId: entryReference.captureId, reference: entryReference.reference, referenceHash: entryReference.referenceHash, render:freshPath, renderHash:sha(fresh)});
    for (const journey of artifact.plan.journeys) {
      signal.throwIfAborted(); let steps = 0;
      try {
        frame = await load();
        await frame.evaluate(id => (window as unknown as { nsPreview: { checkpoint(id: string): void } }).nsPreview.checkpoint(id), journey.from);
        for (const step of journey.steps) {
          const before = await snapshot(frame), locator = step.control ? frame.locator(control(step.control)) : undefined;
          if (locator && await locator.count() !== 1) throw new Error('Control must resolve to exactly one native element');
          if (locator) exercised.add(`${before.stateId}:${step.control}`);
          if (step.action === 'click') await locator!.click();
          else if (step.action === 'fill') await locator!.fill(step.value);
          else if (step.action === 'select') await locator!.selectOption(step.value);
          else if (step.action === 'scroll') { if (locator) await locator.evaluate((el, y) => el.scrollTo(0, Number(y)), step.value); else await frame.evaluate(y => scrollTo(0, Number(y)), step.value); }
          else await page.waitForTimeout(Number(step.value));
          await settle(frame);
          await expect.poll(async () => (await snapshot(frame)).stateId, { timeout: 4000 }).toBe(step.expectedState);
          if (step.expectedText) await expect(frame.locator(`[data-ns-state="${step.expectedState}"]`)).toContainText(step.expectedText);
          if (step.assertValue) await expect(locator!).toHaveValue(step.expectedValue);
          if (step.expectedVisibleControl) await expect(frame.locator(control(step.expectedVisibleControl))).toBeVisible();
          if (step.expectedHiddenControl) await expect(frame.locator(control(step.expectedHiddenControl))).toBeHidden();
          const after = await snapshot(frame);
          if (JSON.stringify(after.activeStates) !== JSON.stringify([step.expectedState]) || after.overflow || after.brokenImages || after.invalidControls) throw new Error('Interaction introduced broken layout or controls');
          if (step.changeExpected && JSON.stringify(after) === JSON.stringify(before)) throw new Error('The requested action produced no observable state/content/value/scroll change');
          const canonical = report.states.find(s => s.stateId === after.stateId)!;
          const sampleId = `journey-${journey.id}-step-${steps + 1}`;
          const image = await page.locator('iframe').screenshot({ animations: 'disabled' });
          const render = join(directory, sampleId + '.png'); await writeFile(render, image, { mode: 0o600 });
          report.samples.push({ id: sampleId, stateId: after.stateId, captureId: canonical.captureId, reference: canonical.reference, referenceHash: canonical.referenceHash, render, renderHash: sha(image) });
          steps++;
        }
        await writeFile(join(directory, `journey-${journey.id}.png`), await page.locator('iframe').screenshot(), { mode: 0o600 });
        report.journeys.push({ id: journey.id, passed: true, steps });
      } catch (error) { signal.throwIfAborted(); report.journeys.push({ id: journey.id, passed: false, error: String(error).slice(0, 1000), steps }); report.failures.push(`${journey.id}: native interaction failed`); }
    }
    for (const boundary of artifact.plan.boundaries) {
      frame = await load();
      await frame.evaluate(id => (window as unknown as { nsPreview: { checkpoint(id: string): void } }).nsPreview.checkpoint(id), boundary.stateId);
      const before = await snapshot(frame);
      await frame.locator(control(boundary.control)).click();
      await expect(page.locator('#boundary')).toHaveText(boundary.reason);
      if (JSON.stringify(await snapshot(frame)) !== JSON.stringify(before)) report.failures.push(`${boundary.control}: uncaptured boundary changed the simulated app`);
    }
    for (const state of report.states) for (const id of state.controls) {
      if (!exercised.has(`${state.stateId}:${id}`) && !artifact.plan.boundaries.some(b => b.stateId === state.stateId && b.control === id)) report.failures.push(`${state.stateId}/${id}: enabled control has no executed journey or explicit uncaptured boundary`);
    }
    // Test repeated factory reset through the same outer button users receive.
    for (let i = 0; i < 2; i++) {
      await frame.evaluate(() => { (window as unknown as {nsPreview:{data:Record<string,unknown>}}).nsPreview.data.resetProbe = 'dirty'; });
      await page.getByRole('button', { name: 'Restart preview', exact: true }).click();
      const handle = await page.locator('iframe').elementHandle(); frame = (await handle!.contentFrame())!;
      await frame.waitForFunction(() => Boolean((window as unknown as { nsPreview?: unknown }).nsPreview)); await settle(frame);
      const reset = await snapshot(frame);
      if (JSON.stringify({ state: reset.stateId, data: reset.data, fields: reset.fields }) !== JSON.stringify({ state: initial.stateId, data: initial.data, fields: initial.fields })) throw new Error('Factory reset failed to restore initial data and fields');
    }
    report.resetPassed = true;
    const reachable = new Set([artifact.plan.initialState]);
    for (let i = 0; i < artifact.plan.states.length; i++) for (const journey of artifact.plan.journeys) if (reachable.has(journey.from) && report.journeys.some(j => j.id === journey.id && j.passed)) for (const step of journey.steps) reachable.add(step.expectedState);
    for (const state of artifact.plan.states) if (!reachable.has(state.id)) report.failures.push(`${state.id}: no executed route from the captured entry`);
    if (artifact.plan.journeys.some(j => j.basis === 'inferred')) report.failures.push('Some behavior is inferred rather than observed in the captures');
    if (report.runtimeErrors.length || report.blockedRequests.length) report.failures.push('Runtime errors or attempted external resource requests');
    report.passed = !report.failures.length;
    return report;
  } catch (error) {
    signal.throwIfAborted();
    report.failures.push(String(error).slice(0, 1200));
    return report;
  } finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); await browser.close(); }
}
