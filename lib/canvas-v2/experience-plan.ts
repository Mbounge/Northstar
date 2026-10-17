import { object, type JsonObject } from './managed-agent/protocol';

/** Brief-derived experience decisions, not proof that behavior was implemented. */
export interface ScreenTransitionVerification {
  action: 'click' | 'fill' | 'drag';
  selector: string;
  viewSelector: string;
  expectedText: string;
}

export interface ScreenExperiencePlan {
  brief: string;
  states: Array<{ id: string; description: string; settledExpectation: string }>;
  transitions: Array<{ id: string; trigger: string; from: string; to: string; visualResponse: string; timing: string; interruption: string; settledExpectation: string; verification?: ScreenTransitionVerification }>;
  subjects?: Array<{ id: string; kind: 'character' | 'world' | 'icon' | 'illustration' | 'other'; artDirection: string; craft: string; stateResponses: Array<{ stateId: string; response: string }> }>;
  assetStrategy?: Array<{ id: string; tool: string; source: string; readableTarget: string; cropQuality: string; referenceAssetId?: string }>;
  referenceObservations?: Array<{ assetId: string; timestampsSeconds?: number[]; observation: string; intent: 'faithful' | 'inspired'; borrow: string; preserve: string }>;
  comparison?: { nodeIds: string[]; requirement: string; structuralDistinction: string };
}

const textSchema = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const idSchema = { ...textSchema(80), pattern: '^[\\w.-]+$' };
const recordSchema = (properties: JsonObject, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const listSchema = (items: JsonObject, maxItems: number, minItems = 0) => ({ type: 'array', minItems, maxItems, items });

/** Shared by the tool declaration and parser; applicable fields stay optional. */
export const screenExperiencePlanSchema = recordSchema({
  brief: { ...textSchema(1600), description: 'Actual resolved user request and scope, including attached material; never replace it with an author override.' },
  states: listSchema(recordSchema({ id: idSchema, description: textSchema(), settledExpectation: textSchema() }), 16, 1),
  transitions: listSchema(recordSchema({ id: idSchema, trigger: textSchema(), from: idSchema, to: idSchema, visualResponse: textSchema(), timing: textSchema(), interruption: textSchema(), settledExpectation: textSchema(), verification: recordSchema({ action: { type: 'string', enum: ['click', 'fill', 'drag'] }, selector: textSchema(240), viewSelector: textSchema(240), expectedText: textSchema() }) }, ['id', 'trigger', 'from', 'to', 'visualResponse', 'timing', 'interruption', 'settledExpectation']), 32),
  subjects: listSchema(recordSchema({ id: idSchema, kind: { type: 'string', enum: ['character', 'world', 'icon', 'illustration', 'other'] }, artDirection: textSchema(), craft: textSchema(), stateResponses: listSchema(recordSchema({ stateId: idSchema, response: textSchema() }), 16) }), 8),
  assetStrategy: listSchema(recordSchema({ id: idSchema, tool: textSchema(120), source: textSchema(), readableTarget: textSchema(), cropQuality: textSchema(), referenceAssetId: textSchema(240) }, ['id', 'tool', 'source', 'readableTarget', 'cropQuality']), 12),
  referenceObservations: listSchema(recordSchema({ assetId: textSchema(240), timestampsSeconds: listSchema({ type: 'number', minimum: 0, maximum: 3600 }, 8, 1), observation: textSchema(), intent: { type: 'string', enum: ['faithful', 'inspired'] }, borrow: textSchema(), preserve: textSchema() }, ['assetId', 'observation', 'intent', 'borrow', 'preserve']), 12),
  comparison: { ...recordSchema({ nodeIds: listSchema(textSchema(240), 12, 1), requirement: textSchema(), structuralDistinction: textSchema() }), description: 'Only for explicit user-requested divergence: existing comparison node IDs, the request, and intended structural distinction. This is not a universal diversity quota or authorization to edit siblings.' },
}, ['brief', 'states', 'transitions']);

const record = (value: unknown, fields: string[], label: string) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Supply an experience ${label} object.`);
  const raw = object(value);
  if (Object.keys(raw).some(key => !fields.includes(key))) throw new Error(`Unknown experience ${label} field.`);
  return raw;
};
const text = (value: unknown, label: string, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Supply a concise experience ${label} (1–${max} characters).`);
  return value.trim();
};
const id = (value: unknown, label: string) => {
  const result = text(value, label, 80);
  if (!/^[\w.-]+$/.test(result)) throw new Error(`Use a simple experience ${label}.`);
  return result;
};
const list = (value: unknown, label: string, max: number, min = 0): unknown[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`Plan ${min}–${max} experience ${label}.`);
  return value;
};
const distinct = (values: string[], label: string) => {
  if (new Set(values).size !== values.length) throw new Error(`Use distinct experience ${label}.`);
};

export function screenExperiencePlan(value: unknown, knownReferenceAssetIds: ReadonlySet<string>): ScreenExperiencePlan {
  const raw = record(value, ['brief', 'states', 'transitions', 'subjects', 'assetStrategy', 'referenceObservations', 'comparison'], 'plan');
  const states = list(raw.states, 'states', 16, 1).map(value => {
    const state = record(value, ['id', 'description', 'settledExpectation'], 'state');
    return { id: id(state.id, 'state id'), description: text(state.description, 'state description'), settledExpectation: text(state.settledExpectation, 'settled state expectation') };
  });
  distinct(states.map(state => state.id), 'state ids');
  const stateIds = new Set(states.map(state => state.id));
  const stateId = (value: unknown) => {
    const result = id(value, 'state reference');
    if (!stateIds.has(result)) throw new Error(`Experience state reference "${result}" must exist in states.`);
    return result;
  };
  const assetId = (value: unknown) => {
    const result = text(value, 'reference asset id', 240);
    if (!knownReferenceAssetIds.has(result)) throw new Error(`Inspect or retain experience reference asset "${result}" before planning from it.`);
    return result;
  };
  const transitions = list(raw.transitions, 'transitions', 32).map(value => {
    const edge = record(value, ['id', 'trigger', 'from', 'to', 'visualResponse', 'timing', 'interruption', 'settledExpectation', 'verification'], 'transition');
    let verification: ScreenTransitionVerification | undefined;
    if (edge.verification !== undefined) {
      const check = record(edge.verification, ['action', 'selector', 'viewSelector', 'expectedText'], 'transition verification');
      if (!['click', 'fill', 'drag'].includes(String(check.action))) throw new Error('Transition verification needs a click, fill or drag action.');
      verification = { action: check.action as ScreenTransitionVerification['action'], selector: text(check.selector, 'transition control selector', 240), viewSelector: text(check.viewSelector, 'transition view selector', 240), expectedText: text(check.expectedText, 'transition destination text') };
    }
    return { id: id(edge.id, 'transition id'), trigger: text(edge.trigger, 'transition trigger'), from: stateId(edge.from), to: stateId(edge.to), visualResponse: text(edge.visualResponse, 'visual response'), timing: text(edge.timing, 'transition timing'), interruption: text(edge.interruption, 'interruption handling'), settledExpectation: text(edge.settledExpectation, 'settled transition expectation'), ...(verification ? { verification } : {}) };
  });
  distinct(transitions.map(edge => edge.id), 'transition ids');
  const result: ScreenExperiencePlan = { brief: text(raw.brief, 'resolved user brief', 1600), states, transitions };
  if (raw.subjects !== undefined) {
    result.subjects = list(raw.subjects, 'subjects', 8).map(value => {
      const subject = record(value, ['id', 'kind', 'artDirection', 'craft', 'stateResponses'], 'subject');
      if (!['character', 'world', 'icon', 'illustration', 'other'].includes(String(subject.kind))) throw new Error('Choose a valid experience subject kind.');
      const stateResponses = list(subject.stateResponses, 'subject state responses', 16).map(value => {
        const response = record(value, ['stateId', 'response'], 'subject response');
        return { stateId: stateId(response.stateId), response: text(response.response, 'subject response') };
      });
      distinct(stateResponses.map(response => response.stateId), 'subject response states');
      return { id: id(subject.id, 'subject id'), kind: subject.kind as NonNullable<ScreenExperiencePlan['subjects']>[number]['kind'], artDirection: text(subject.artDirection, 'subject art direction'), craft: text(subject.craft, 'subject craft'), stateResponses };
    });
    distinct(result.subjects.map(subject => subject.id), 'subject ids');
  }
  if (raw.assetStrategy !== undefined) {
    result.assetStrategy = list(raw.assetStrategy, 'asset strategies', 12).map(value => {
      const asset = record(value, ['id', 'tool', 'source', 'readableTarget', 'cropQuality', 'referenceAssetId'], 'asset strategy');
      return { id: id(asset.id, 'asset strategy id'), tool: text(asset.tool, 'asset tool', 120), source: text(asset.source, 'asset source'), readableTarget: text(asset.readableTarget, 'readable asset target'), cropQuality: text(asset.cropQuality, 'asset crop quality'), ...(asset.referenceAssetId !== undefined ? { referenceAssetId: assetId(asset.referenceAssetId) } : {}) };
    });
    distinct(result.assetStrategy.map(asset => asset.id), 'asset strategy ids');
  }
  if (raw.referenceObservations !== undefined) {
    result.referenceObservations = list(raw.referenceObservations, 'reference observations', 12).map(value => {
      const reference = record(value, ['assetId', 'timestampsSeconds', 'observation', 'intent', 'borrow', 'preserve'], 'reference observation');
      if (reference.intent !== 'faithful' && reference.intent !== 'inspired') throw new Error('Choose faithful or inspired experience reference intent.');
      const timestampsSeconds = reference.timestampsSeconds === undefined ? undefined : list(reference.timestampsSeconds, 'reference timestamps', 8, 1).map(value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 3600) throw new Error('Experience reference timestamps must be finite seconds from 0 to 3600.');
        return value;
      });
      if (timestampsSeconds?.some((time, index) => index > 0 && time <= timestampsSeconds[index - 1])) throw new Error('Experience reference timestamps must increase strictly.');
      return { assetId: assetId(reference.assetId), ...(timestampsSeconds ? { timestampsSeconds } : {}), observation: text(reference.observation, 'reference observation'), intent: reference.intent as 'faithful' | 'inspired', borrow: text(reference.borrow, 'borrowed reference intent'), preserve: text(reference.preserve, 'preserved reference intent') };
    });
  }
  if (raw.comparison !== undefined) {
    const comparison = record(raw.comparison, ['nodeIds', 'requirement', 'structuralDistinction'], 'comparison');
    const nodeIds = list(comparison.nodeIds, 'comparison nodes', 12, 1).map(value => text(value, 'comparison node id', 240));
    distinct(nodeIds, 'comparison node ids');
    result.comparison = { nodeIds, requirement: text(comparison.requirement, 'user divergence requirement'), structuralDistinction: text(comparison.structuralDistinction, 'structural distinction') };
  }
  if (JSON.stringify(result).length > 12000) throw new Error('Keep the experience plan within 12000 characters; record only applicable journey, craft and reference decisions.');
  return result;
}
