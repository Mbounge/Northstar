import Ajv from 'ajv';

const text = { type: 'string' };
const list = (items: unknown) => ({ type: 'array', items });
const record = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const PLAN_SCHEMA = record({
  title: text, initialState: text, scope: text, limitations: list(text),
  states: list(record({ id: text, captureId: text, label: text, fixtureJson: text, motionRequired: { type: 'boolean' } })),
  crops: list(record({ id: text, captureId: text, x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' }, purpose: text })),
  journeys: list(record({ id: text, from: text, basis: { enum: ['observed', 'inferred'] }, evidenceIds: list(text), steps: list(record({ action: { enum: ['click', 'fill', 'select', 'scroll', 'wait'] }, control: text, value: text, expectedState: text, expectedText: text, assertValue: { type: 'boolean' }, expectedValue: text, expectedVisibleControl: text, expectedHiddenControl: text, changeExpected: { type: 'boolean' } })) })),
  boundaries: list(record({ stateId: text, control: text, reason: text })),
});
export const IMPLEMENTATION_SCHEMA = record({ html: text, css: text, javascript: text, initialDataJson: text, assetIds: list(text), notes: list(text) });
const verdict = { enum: ['pass', 'revise', 'unverified'] };
export const REVIEW_SCHEMA = record({ assessments: list(record({ sampleId: text, stateId: text, captureId: text, typography: verdict, layout: verdict, icons: verdict, imagery: verdict, content: verdict, interactions: verdict, motion: { enum: ['pass', 'revise', 'unverified', 'not_applicable'] }, findings: list(text) })), summary: text });
const ajv = new Ajv({ allErrors: true });
export function validateShape(schema: object, value: unknown) {
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error('Invalid agent response: ' + ajv.errorsText(validate.errors).slice(0, 2000));
}
export type Plan = {
  title: string; initialState: string; scope: string; limitations: string[];
  states: Array<{ id: string; captureId: string; label: string; fixtureJson: string; motionRequired: boolean }>;
  crops: Array<{ id: string; captureId: string; x: number; y: number; width: number; height: number; purpose: string }>;
  journeys: Array<{ id: string; from: string; basis: 'observed' | 'inferred'; evidenceIds: string[]; steps: Step[] }>;
  boundaries: Array<{ stateId: string; control: string; reason: string }>;
};
export type Step = { action: 'click' | 'fill' | 'select' | 'scroll' | 'wait'; control: string; value: string; expectedState: string; expectedText: string; assertValue: boolean; expectedValue: string; expectedVisibleControl: string; expectedHiddenControl: string; changeExpected: boolean };
export type Implementation = { html: string; css: string; javascript: string; initialDataJson: string; assetIds: string[]; notes: string[] };
export type Review = { assessments: Array<{ sampleId: string; stateId: string; captureId: string; typography: string; layout: string; icons: string; imagery: string; content: string; interactions: string; motion: string; findings: string[] }>; summary: string };
export function jsonData(raw: string) {
  if (raw.length > 100_000) throw new Error('Mock state is too large');
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object' || /"(?:__proto__|constructor|prototype)"\s*:/.test(raw)) throw new Error('Use a plain safe mock-data object');
  return value as Record<string, unknown>;
}
export const safeId = (value: string) => /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value);
