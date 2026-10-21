/**
 * Pure, source-only analysis for deciding whether a screen text node is
 * rewritten by its embedded application. The host's direct-edit guards use
 * this scoped check before changing the retained source.
 *
 * The caller supplies the selected element's selector and its ancestor
 * selectors.  The analysis is conservative: an unknown selector or an
 * unbounded document/body mutation is unsafe for a direct text patch.
 */

import * as bundledAcorn from 'next/dist/compiled/acorn';

type AstNode = {
  type: string;
  [key: string]: unknown;
};

type SelectorResolution = {
  selectors: string[];
  unknown?: boolean;
  unbounded?: boolean;
};

export interface ScreenTextMutationTarget {
  selector: string;
  ancestorSelectors?: readonly string[];
  /** Optional DOM-backed resolver. The caller can use the actual selected
   * element and its parent chain to return a definitive relation for each
   * literal selector. The pure analyzer remains conservative without it. */
  resolveSelectorRelation?: (selector: string) => 'affected' | 'disjoint' | 'unknown';
}

export interface ScreenTextMutationSite {
  kind: string;
  selector?: string;
  selectors?: string[];
  unknown: boolean;
  unbounded: boolean;
  reason: string;
}

export interface ScreenTextMutationAnalysis {
  safe: boolean;
  affected: boolean;
  unknown: boolean;
  sites: ScreenTextMutationSite[];
  parseError?: string;
}

const TEXT_PROPERTIES = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML']);
const MUTATING_METHODS = new Set([
  'replaceChildren',
  'insertAdjacentHTML',
  'replaceWith',
  'append',
  'prepend',
  'appendChild',
  'insertBefore',
  'removeChild',
]);
const QUERY_METHODS = new Set(['querySelector', 'querySelectorAll', 'getElementById']);

function parse(source: string): AstNode {
  return bundledAcorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  } as never) as AstNode;
}

function isNode(value: unknown): value is AstNode {
  return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

function propertyName(node: AstNode): string | undefined {
  const property = node.property;
  if (node.computed) return typeof property === 'object' && property !== null && 'value' in property ? String((property as { value: unknown }).value) : undefined;
  return isNode(property) && property.type === 'Identifier' ? String(property.name) : undefined;
}

function identifierName(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Identifier' ? String(node.name) : undefined;
}

function literalString(node: unknown): string | undefined {
  return isNode(node) && node.type === 'Literal' && typeof node.value === 'string' ? String(node.value) : undefined;
}

function walk(node: unknown, visit: (current: AstNode) => void): void {
  if (!isNode(node)) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else {
      walk(value, visit);
    }
  }
}

function known(selector: string): SelectorResolution {
  return {selectors: [selector]};
}

function unknownResolution(): SelectorResolution {
  return {selectors: [], unknown: true};
}

function bodyResolution(selector: string): SelectorResolution {
  return {selectors: [selector], unbounded: true};
}

function mergeResolution(...parts: SelectorResolution[]): SelectorResolution {
  return {
    selectors: [...new Set(parts.flatMap(part => part.selectors))],
    unknown: parts.some(part => part.unknown),
    unbounded: parts.some(part => part.unbounded),
  };
}

function idsIn(selector: string): string[] {
  return [...selector.matchAll(/(?:^|[\s>+~])#([A-Za-z_][\w-]*)/g)].map(match => match[1]);
}

function receiverResolution(
  node: unknown,
  bindings: BindingState,
): SelectorResolution {
  if (!isNode(node)) return unknownResolution();
  const identifier = identifierName(node);
  if (identifier === 'document' && !bindings.bound.has('document')) return known('document');
  if (identifier) {
    if (bindings.ambiguous.has(identifier) || bindings.invalid.has(identifier)) return unknownResolution();
    return bindings.elements.get(identifier) ?? unknownResolution();
  }

  if (node.type === 'MemberExpression') {
    const owner = identifierName(node.object);
    const name = propertyName(node);
    if (owner === 'document' && !bindings.bound.has('document') && name === 'body') return bodyResolution('body');
    if (owner === 'document' && !bindings.bound.has('document') && name === 'documentElement') return bodyResolution('html');
    return unknownResolution();
  }

  if (node.type !== 'CallExpression' || !isNode(node.callee)) return unknownResolution();
  const callee = node.callee;
  const alias = identifierName(callee);
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  const argument = args[0];
  if (alias && bindings.aliases.has(alias) && !bindings.ambiguous.has(alias) && !bindings.invalid.has(alias)) {
    if (args.length !== 1) return unknownResolution();
    const selector = literalString(argument);
    if (!selector) return unknownResolution();
    return known(selector);
  }

  const method = propertyName(callee);
  if (!method || !QUERY_METHODS.has(method)) return unknownResolution();
  const selector = literalString(argument);
  if (!selector) return unknownResolution();
  if (method === 'getElementById') return known('#' + selector);
  if (selector === 'body' || selector === 'html' || selector === '*') return bodyResolution(selector);

  // A literal selector is useful even when the receiver is a scoped root. If
  // that root is itself unknown, retain the unknown bit so a class/tag query
  // cannot accidentally be treated as globally disjoint from the target.
  const base = receiverResolution(callee.object, bindings);
  const scoped = base.selectors.flatMap(value => value === 'document' || value === 'body' || value === 'html' ? [] : [value + ' ' + selector]);
  return mergeResolution({selectors: [selector, ...scoped]}, base.unknown ? unknownResolution() : {selectors: []});
}

type BindingState = {
  elements: Map<string, SelectorResolution>;
  aliases: Set<string>;
  bound: Set<string>;
  ambiguous: Set<string>;
  invalid: Set<string>;
};

function bindingNames(node: unknown): string[] {
  if (!isNode(node)) return [];
  const name = identifierName(node);
  if (name) return [name];
  if (node.type === 'Property') return bindingNames(node.value);
  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern' || node.type === 'RestElement' || node.type === 'AssignmentPattern') {
    return Object.values(node).flatMap(value => Array.isArray(value) ? value.flatMap(bindingNames) : bindingNames(value));
  }
  return [];
}

function queryReturn(node: unknown, parameter: string): {method: string; root: unknown} | undefined {
  if (!isNode(node) || node.type !== 'CallExpression' || !isNode(node.callee)) return;
  const method = propertyName(node.callee);
  const args = Array.isArray(node.arguments) ? node.arguments : [];
  if (!method || !QUERY_METHODS.has(method) || args.length !== 1 || identifierName(args[0]) !== parameter) return;
  return {method, root: node.callee.object};
}

function pureSelectorAlias(node: unknown, bindings: BindingState): boolean {
  if (!isNode(node) || !['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(node.type)) return false;
  const params = Array.isArray(node.params) ? node.params : [];
  const parameter = params.length === 1 ? identifierName(params[0]) : undefined;
  if (!parameter) return false;
  let returned: unknown;
  if (node.type === 'ArrowFunctionExpression' && node.body && isNode(node.body) && node.body.type !== 'BlockStatement') returned = node.body;
  else if (isNode(node.body) && node.body.type === 'BlockStatement' && Array.isArray(node.body.body) && node.body.body.length === 1 && isNode(node.body.body[0]) && node.body.body[0].type === 'ReturnStatement') returned = node.body.body[0].argument;
  if (!returned) return false;
  const candidate = queryReturn(returned, parameter);
  if (candidate && candidate.method === 'querySelector') {
    const root = receiverResolution(candidate.root, bindings);
    return !root.unknown && !root.unbounded && root.selectors.length > 0;
  }
  if (!isNode(returned) || returned.type !== 'ArrayExpression' || !Array.isArray(returned.elements) || returned.elements.length !== 1 || !isNode(returned.elements[0]) || returned.elements[0].type !== 'SpreadElement') return false;
  const spread = (returned.elements[0] as AstNode).argument;
  const spreadQuery = queryReturn(spread, parameter);
  if (!spreadQuery || spreadQuery.method !== 'querySelectorAll') return false;
  const root = receiverResolution(spreadQuery.root, bindings);
  return !root.unknown && !root.unbounded && root.selectors.length > 0;
}

function collectBindings(ast: AstNode): BindingState {
  const elements = new Map<string, SelectorResolution>();
  const aliases = new Set<string>();
  const bound = new Set<string>();
  const ambiguous = new Set<string>();
  const invalid = new Set<string>();
  const declarations: AstNode[] = [];
  const candidates: Array<{name: string; node: unknown}> = [];
  const counts = new Map<string, number>();
  walk(ast, node => {
    if (node.type === 'VariableDeclarator') {
      declarations.push(node);
      for (const name of bindingNames(node.id)) counts.set(name, (counts.get(name) || 0) + 1);
      const name = identifierName(node.id);
      if (name && isNode(node.init) && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init.type)) candidates.push({name, node: node.init});
    }
    if (node.type === 'FunctionDeclaration') {
      for (const name of bindingNames(node.id)) counts.set(name, (counts.get(name) || 0) + 1);
      const name = identifierName(node.id);
      if (name) candidates.push({name, node});
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      for (const param of Array.isArray(node.params) ? node.params : []) for (const name of bindingNames(param)) counts.set(name, (counts.get(name) || 0) + 1);
    }
    if (node.type === 'CatchClause') for (const name of bindingNames(node.param)) counts.set(name, (counts.get(name) || 0) + 1);
    if (node.type === 'AssignmentExpression' && isNode(node.left)) for (const name of bindingNames(node.left)) invalid.add(name);
    if (node.type === 'UpdateExpression') for (const name of bindingNames(node.argument)) invalid.add(name);
    if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && isNode(node.left)) for (const name of bindingNames(node.left)) invalid.add(name);
  });
  for (const [name, count] of counts) if (count > 1) ambiguous.add(name);
  for (const name of counts.keys()) bound.add(name);

  // A short fixed point handles declarations whose query-root binding appears
  // after the helper declaration, while remaining independent of execution.
  for (let pass = 0; pass < declarations.length + 2; pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      const name = identifierName(declaration.id);
      if (!name) continue;
      if (ambiguous.has(name) || invalid.has(name)) continue;
      const init = declaration.init;
      if (isNode(init) && pureSelectorAlias(init, {elements, aliases, bound, ambiguous, invalid})) {
        if (!aliases.has(name)) {
          aliases.add(name);
          changed = true;
        }
        continue;
      }
      const resolved = receiverResolution(init, {elements, aliases, bound, ambiguous, invalid});
      const previous = elements.get(name);
      const encoded = JSON.stringify(resolved);
      if (!previous || JSON.stringify(previous) !== encoded) {
        elements.set(name, resolved);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const candidate of candidates) {
    if (!ambiguous.has(candidate.name) && !invalid.has(candidate.name) && pureSelectorAlias(candidate.node, {elements, aliases, bound, ambiguous, invalid})) aliases.add(candidate.name);
  }
  return {elements, aliases, bound, ambiguous, invalid};
}

function isMutationAssignment(node: AstNode): boolean {
  return node.type === 'AssignmentExpression' && isNode(node.left) && node.left.type === 'MemberExpression' && TEXT_PROPERTIES.has(propertyName(node.left) || '');
}

function isMutationCall(node: AstNode): boolean {
  return node.type === 'CallExpression' && isNode(node.callee) && node.callee.type === 'MemberExpression' && MUTATING_METHODS.has(propertyName(node.callee) || '');
}

function isComputedMutation(node: AstNode): boolean {
  return node.type === 'AssignmentExpression' && isNode(node.left) && node.left.type === 'MemberExpression' && Boolean(node.left.computed) && !literalString(node.left.property);
}

/** The host seeds product.data with plain JSON. A computed write to a record
 * in that tree is not a DOM write. Keep the exemption receiver-specific: an
 * injected node, a reassigned alias or an unknown mutator must still block it. */
function createProductDataWriteProof(ast: AstNode, bindings: BindingState): (node: AstNode) => boolean {
  const declarations = new Map<string, unknown>();
  let dynamicScope = false;
  walk(ast, part => {
    // Dynamic scope/code can introduce a DOM owner absent from this AST.
    // Reject aliases and indirect compilation too; this is an exemption, not
    // permission to assume an unknown compiler leaves the JSON tree alone.
    if (part.type === 'WithStatement'
      || part.type === 'Identifier' && ['eval', 'Function'].includes(String(part.name))
      || part.type === 'MemberExpression' && ['eval', 'Function', 'constructor'].includes(propertyName(part) ?? '')
      || ['CallExpression', 'NewExpression'].includes(part.type) && isNode(part.callee) && part.callee.type === 'MemberExpression' && part.callee.computed && !literalString(part.callee.property)) dynamicScope = true;
    if (part.type === 'VariableDeclarator') {
      const name = identifierName(part.id);
      if (name) declarations.set(name, part.init);
    }
  });
  if (dynamicScope) return () => false;
  type Path = string[];
  const same = (a: Path, b: Path) => a.length === b.length && a.every((key, i) => key === b[i]);
  const prefix = (a: Path, b: Path) => a.length <= b.length && a.every((key, i) => key === '*' || b[i] === '*' || key === b[i]);
  const path = (value: unknown, seen = new Set<string>()): Path | undefined => {
    if (!isNode(value)) return;
    const name = identifierName(value);
    if (name) {
      if (bindings.invalid.has(name) || bindings.ambiguous.has(name) || seen.has(name)) return;
      if (name === 'window' && !bindings.bound.has(name)) return ['window'];
      return path(declarations.get(name), new Set([...seen, name]));
    }
    if (value.type === 'MemberExpression') {
      const owner = path(value.object, seen);
      if (owner) return [...owner, propertyName(value) ?? '*'];
    }
    if (value.type === 'AssignmentExpression') return path(value.left, seen);
    if (value.type === 'LogicalExpression') {
      const left = path(value.left, seen), right = path(value.right, seen);
      if (left && right && same(left, right)) return left;
    }
  };
  const root = ['window', 'northstarProduct', 'data'];
  const checking = new Set<string>();
  const proofs = new Map<string, boolean>();
  const recordStaysData = (target: Path): boolean => {
    const key = JSON.stringify(target);
    if (proofs.has(key)) return proofs.get(key)!;
    if (checking.has(key)) return false;
    checking.add(key);
    let safe = true;
    const escapesRecord = (value: unknown): boolean => {
      if (!isNode(value)) return false;
      const reference = path(value);
      if (reference && prefix(root, reference) && prefix(reference, target)) return true;
      if (value.type === 'LogicalExpression') return escapesRecord(value.left) || escapesRecord(value.right);
      if (value.type === 'ConditionalExpression') return escapesRecord(value.consequent) || escapesRecord(value.alternate);
      return false;
    };
    const valueAt = (value: unknown, tail: Path, prior: Path): boolean => {
      if (!isNode(value)) return false;
      const source = path(value);
      // Retaining this very record (e.g. data.tour || {}) changes no owner.
      if (source && same(source, prior)) return true;
      if (value.type === 'LogicalExpression' || value.type === 'ConditionalExpression') {
        return value.type === 'LogicalExpression'
          ? valueAt(value.left, tail, prior) && valueAt(value.right, tail, prior)
          : valueAt(value.consequent, tail, prior) && valueAt(value.alternate, tail, prior);
      }
      if (value.type === 'AssignmentExpression') return valueAt(value.right, tail, prior);
      if (value.type === 'ObjectExpression') {
        const properties = Array.isArray(value.properties) ? value.properties : [];
        if (properties.some(p => !isNode(p) || p.type !== 'Property' || p.kind !== 'init' || p.method || p.computed)) return false;
        if (!tail.length) return true;
        const property = properties.findLast(p => isNode(p) && (identifierName(p.key) ?? literalString(p.key)) === tail[0]);
        return !property || isNode(property) && valueAt(property.value, tail.slice(1), prior);
      }
      if (value.type === 'ArrayExpression' && !tail.length) return true;
      if (value.type === 'Literal' && !tail.length) return true;
      return Boolean(source && prefix(root, source) && !source.includes('*') && recordStaysData([...source, ...tail]));
    };
    walk(ast, part => {
      if (!safe) return;
      // Containers, destructuring and returns can create aliases the selector
      // analysis does not resolve. Do not infer JSON ownership through them.
      if (part.type === 'ArrayExpression' && Array.isArray(part.elements) && part.elements.some(escapesRecord)
        || part.type === 'ObjectExpression' && Array.isArray(part.properties) && part.properties.some(p => isNode(p) && escapesRecord(p.type === 'SpreadElement' ? p.argument : p.value))
        || ['ReturnStatement', 'YieldExpression'].includes(part.type) && escapesRecord(part.argument)
        || part.type === 'ArrowFunctionExpression' && escapesRecord(part.body)
        || part.type === 'VariableDeclarator' && !identifierName(part.id) && escapesRecord(part.init)) safe = false;
      if (part.type === 'AssignmentExpression') {
        const destination = path(part.left);
        if ((!destination || !prefix(root, destination)) && escapesRecord(part.right)) safe = false;
        if (destination && prefix(destination, target)) {
          if (part.operator !== '=' || destination.includes('*') || !valueAt(part.right, target.slice(destination.length), destination)) safe = false;
        } else if (isNode(part.left) && ['ArrayPattern', 'ObjectPattern'].includes(part.left.type)) {
          walk(part.left, item => { const assigned = path(item); if (assigned && prefix(assigned, target)) safe = false; });
        }
      }
      if (part.type !== 'CallExpression' && part.type !== 'NewExpression') return;
      const args = Array.isArray(part.arguments) ? part.arguments : [];
      const callee = part.callee;
      const method = isNode(callee) && callee.type === 'MemberExpression' ? propertyName(callee) : undefined;
      const owner = isNode(callee) && callee.type === 'MemberExpression' ? identifierName(callee.object) : undefined;
      const destination = path(args[0]);
      if (owner === 'Object' && !bindings.bound.has('Object') && method === 'assign' && destination && prefix(destination, target)) {
        // assign cannot replace the destination itself, but can replace an
        // ancestor's child record with a node or an unknown return value.
        if (destination.includes('*') || destination.length < target.length && args.slice(1).some(value => !valueAt(value, target.slice(destination.length), destination))) safe = false;
        return;
      }
      // keys exposes only strings. values/entries can leak mutable child
      // records to unknown callbacks, so those retain the escape check.
      if (owner === 'Object' && !bindings.bound.has('Object') && method === 'keys') return;
      if (args.some(value => { const argument = path(value); return argument && prefix(argument, target); })) safe = false;
      if (isNode(callee) && callee.type === 'MemberExpression') {
        const calledOwner = path(callee.object);
        if (calledOwner && prefix(root, calledOwner) && prefix(calledOwner, target)) safe = false;
      }
    });
    checking.delete(key);
    proofs.set(key, safe);
    return safe;
  };
  return node => {
    if (!isComputedMutation(node) || !isNode(node.left)) return false;
    const receiver = path(node.left.object);
    return Boolean(receiver && prefix(root, receiver) && !receiver.includes('*') && recordStaysData(receiver));
  };
}

function sourceReason(site: AstNode): string {
  if (isMutationAssignment(site)) return `assignment to ${propertyName(site.left as AstNode)}`;
  if (isComputedMutation(site)) return 'assignment through a computed property';
  return `call to ${propertyName(site.callee as AstNode)}`;
}

function siteResolution(node: AstNode, bindings: BindingState): SelectorResolution {
  if (isComputedMutation(node)) return unknownResolution();
  if (isMutationAssignment(node)) return receiverResolution((node.left as AstNode).object, bindings);
  return receiverResolution((node.callee as AstNode).object, bindings);
}

type SiteRelation = 'affected' | 'disjoint' | 'unknown';

function siteRelation(site: ScreenTextMutationSite, target: ScreenTextMutationTarget): SiteRelation {
  if (site.unbounded) return 'affected';
  if (site.unknown || !site.selector) return 'unknown';
  const selectors = site.selectors?.length ? site.selectors : [site.selector];
  if (target.resolveSelectorRelation) {
    const relations = selectors.map(target.resolveSelectorRelation);
    if (relations.includes('affected')) return 'affected';
    if (relations.includes('unknown')) return 'unknown';
    return 'disjoint';
  }
  const wanted = [target.selector, ...(target.ancestorSelectors || [])];
  if (selectors.some(selector => wanted.includes(selector))) return 'affected';
  const sourceIds = selectors.flatMap(idsIn);
  const targetIds = wanted.flatMap(idsIn);
  if (sourceIds.some(id => targetIds.includes(id))) return 'affected';

  // Distinct IDs prove sibling subtrees are disjoint. Without a stable ID on
  // both sides, a literal class/tag selector remains unknown and unsafe.
  if (sourceIds.length > 0 && targetIds.length > 0 && sourceIds.every(id => !targetIds.includes(id))) return 'disjoint';
  return 'unknown';
}

/** Analyze only DOM text/markup mutations; style, visibility and event wiring
 * are intentionally outside this predicate. Those concerns must not make a
 * safe static heading look code-controlled. */
export function analyzeScreenTextMutations(source: string, target: ScreenTextMutationTarget): ScreenTextMutationAnalysis {
  let ast: AstNode;
  try {
    ast = parse(source);
  } catch (error) {
    return {safe: false, affected: true, unknown: true, sites: [], parseError: error instanceof Error ? error.message : String(error)};
  }

  const bindings = collectBindings(ast);
  const provenProductDataWrite = createProductDataWriteProof(ast, bindings);
  const sites: ScreenTextMutationSite[] = [];
  walk(ast, node => {
    if (!isMutationAssignment(node) && !isMutationCall(node) && !isComputedMutation(node)) return;
    if (provenProductDataWrite(node)) return;
    const resolution = siteResolution(node, bindings);
    const selectors = resolution.selectors;
    const selector = selectors[0];
    sites.push({
      kind: node.type,
      ...(selector ? {selector} : {}),
      ...(selectors.length ? {selectors} : {}),
      unknown: Boolean(resolution.unknown || !selector),
      unbounded: Boolean(resolution.unbounded),
      reason: sourceReason(node),
    });
  });

  const relations = sites.map(site => siteRelation(site, target));
  const affected = relations.some(relation => relation === 'affected' || relation === 'unknown');
  const unknown = sites.some(site => site.unknown || site.unbounded) || relations.some(relation => relation === 'unknown');
  return {safe: !affected && !unknown, affected, unknown, sites};
}

/** Resolve appearance writes to the same selected owner rather than treating
 * an unrelated button's class or status colour as ownership of the whole app. */
export function analyzeScreenAppearanceMutations(source:string,target:ScreenTextMutationTarget):ScreenTextMutationAnalysis {
  const text=analyzeScreenTextMutations(source,target);
  if(!text.safe)return text;
  let ast:AstNode;
  try{ast=parse(source)}catch(error){return {...text,safe:false,affected:true,unknown:true,parseError:String(error)}}
  const bindings=collectBindings(ast),sites:ScreenTextMutationSite[]=[],aliases=new Map<string,unknown>();
  walk(ast,node=>{
    if(node.type!=='VariableDeclarator'||!isNode(node.init))return;
    if(node.init.type==='MemberExpression'&&['style','classList'].includes(propertyName(node.init)??'')){
      const name=identifierName(node.id);if(name)aliases.set(name,bindings.invalid.has(name)||bindings.ambiguous.has(name)?undefined:node.init.object);
    }else if(isNode(node.id)&&node.id.type==='ObjectPattern'){
      for(const property of Array.isArray(node.id.properties)?node.id.properties:[]){
        if(!isNode(property)||property.type!=='Property')continue;
        const key=identifierName(property.key)??(isNode(property.key)&&property.key.type==='Literal'?String(property.key.value):undefined);
        const name=identifierName(property.value);
        if(name&&['style','classList'].includes(key??''))aliases.set(name,bindings.invalid.has(name)||bindings.ambiguous.has(name)?undefined:node.init);
      }
    }
  });
  const add=(receiver:unknown,reason:string)=>{
    const resolution=receiverResolution(receiver,bindings),selectors=resolution.selectors;
    sites.push({kind:'appearance',...(selectors[0]?{selector:selectors[0],selectors}:{}),unknown:!!resolution.unknown||!selectors.length,unbounded:!!resolution.unbounded,reason});
  };
  walk(ast,node=>{
    if(node.type==='AssignmentExpression'&&isNode(node.left)&&node.left.type==='MemberExpression'){
      const left=node.left,name=propertyName(left),owner=left.object;
      if(['style','className'].includes(name??''))add(owner,'assignment to '+name);
      else if(isNode(owner)&&owner.type==='MemberExpression'&&['style','classList'].includes(propertyName(owner)??''))add(owner.object,'assignment to '+propertyName(owner));
      else if(aliases.has(identifierName(owner)??''))add(aliases.get(identifierName(owner)!), 'aliased appearance assignment');
    }
    if(node.type==='CallExpression'&&isNode(node.callee)&&node.callee.type==='MemberExpression'){
      const method=propertyName(node.callee),owner=node.callee.object;
      if(['setAttribute','setAttributeNS','removeAttribute','toggleAttribute','animate'].includes(method??''))add(owner,'attribute mutation');
      else if(isNode(owner)&&owner.type==='MemberExpression'&&['style','classList'].includes(propertyName(owner)??'')&&['add','remove','toggle','replace','setProperty','removeProperty'].includes(method??''))add(owner.object,'appearance method '+method);
      else if(aliases.has(identifierName(owner)??'')&&['add','remove','toggle','replace','setProperty','removeProperty'].includes(method??''))add(aliases.get(identifierName(owner)!), 'aliased appearance method');
      else if(['insertRule','deleteRule','replaceSync'].includes(method??''))add(undefined,'stylesheet mutation');
      // Indirect bulk writes cannot silently be treated as safe.
      else if(method==='assign'&&identifierName(owner)==='Object'){
        const args=Array.isArray(node.arguments)?node.arguments:[],destination=args[0];
        if(isNode(destination)&&destination.type==='MemberExpression'&&propertyName(destination)==='style')add(destination.object,'bulk style assignment');else if(aliases.has(identifierName(destination)??''))add(aliases.get(identifierName(destination)!), 'aliased bulk style assignment');
      }
    }
  });
  const relations=sites.map(site=>siteRelation(site,target)),unknown=sites.some(site=>site.unknown||site.unbounded)||relations.includes('unknown'),affected=relations.some(relation=>relation!=='disjoint');
  return {safe:!affected&&!unknown,affected,unknown,sites:[...text.sites,...sites]};
}
