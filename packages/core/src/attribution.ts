/*
 * Resolves which reportable scopes (an Experience, or a persisted Fragment)
 * each rendered node belongs to, from the XDA source map.
 *
 * `sourceMap.nodes[id].layers` is the node's ancestor chain, leaf-to-root, as
 * indexes into `sourceMap.layers`. Inline fragments are walked through and
 * never reported. Everything here is tolerant of a malformed map: an unusable
 * one yields no attribution and a debug-log line, never a diagnostic, because
 * `useExperiencePlan` drops any plan that carries diagnostics.
 *
 * Internal to core: `resolveExperience` is the only caller.
 */

import type { DebugLogger } from './debug-logger.js';
import type {
  ExperienceSourceMap,
  NodeAttribution,
  PlanAttribution,
  PortableRenderNode,
  ScopeAttribution,
} from './types.js';

const SUPPORTED_VERSION = 1;

type EntityKind = ScopeAttribution['entityKind'];

// The RFC and the live API use different kind names; accept both.
const REPORTABLE_KINDS: Record<string, EntityKind> = {
  Experience: 'Experience',
  ExperienceFragment: 'Fragment',
  Fragment: 'Fragment',
};

const DEFINING_KINDS: Record<EntityKind, readonly string[]> = {
  Experience: ['ExperienceTemplate', 'Template'],
  Fragment: ['Component', 'ComponentType'],
};

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Rec | undefined {
  return isRecord(value) ? value : undefined;
}

function asIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** A `sourceMap.layers` row, parsed once. `undefined` where the row is not an object. */
interface Layer {
  record: Rec;
  kind?: string;
  id?: string;
}

function parseLayer(value: unknown): Layer | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const layer: Layer = { record };
  const kind = asString(record.kind);
  const id = asString(record.id);
  if (kind !== undefined) layer.kind = kind;
  if (id !== undefined) layer.id = id;
  return layer;
}

interface Context {
  nodes: Rec;
  layers: (Layer | undefined)[];
  variants: unknown[];
  /** Empty when the map has none: bound entries then simply go unreported. */
  entries: unknown[];
  dataAssemblies: unknown[];
  log: DebugLogger;
  scopes: Record<string, ScopeAttribution>;
  /** Entries bound by nodes whose nearest reportable scope is the key. */
  scopeEntries: Map<string, Set<string>>;
  /** Entry ids reached by one binding, by assembly row and path: nodes often repeat them. */
  bindingEntries: Map<string, readonly string[]>;
}

/** A reportable layer found on a node's chain. */
interface ChainScope {
  row: number;
  layer: Layer;
  entityId: string;
  kind: EntityKind;
  /** The layer one step nearer the node, which may define this scope. */
  definingLayer: Layer | undefined;
}

function readChain(entry: Rec): number[] {
  return isIntegerArray(entry.layers) ? entry.layers : [];
}

/** Reportable layers on a chain, outer to inner, each layer row once. */
function reportableScopes(ctx: Context, chain: number[]): ChainScope[] {
  const found: ChainScope[] = [];
  const seen = new Set<number>();
  for (let position = chain.length - 1; position >= 0; position--) {
    const row = chain[position];
    if (row === undefined || seen.has(row)) continue;
    const layer = ctx.layers[row];
    const kind = layer?.kind === undefined ? undefined : REPORTABLE_KINDS[layer.kind];
    if (layer === undefined || kind === undefined || layer.id === undefined) continue;
    seen.add(row);
    const definingRow = chain[position - 1];
    const definingLayer = definingRow === undefined ? undefined : ctx.layers[definingRow];
    found.push({ row, layer, entityId: layer.id, kind, definingLayer });
  }
  return found;
}

/**
 * The one place that decides what identifies a rendered occurrence.
 *
 * XDA gives every copy of a persisted Fragment the same layer row and, measured
 * on a live space, the same node ids, so neither identifies an occurrence. The
 * key is therefore positional: the layer row, where the sibling list sits in
 * the tree, and the index the run of adjacent same-row siblings starts at.
 *
 * Limit: copies placed directly next to each other are one run and merge into
 * one occurrence, because the source map carries nothing that tells them apart.
 * Telling them apart needs XDA to emit a distinct node id or an occurrence id.
 *
 * Consumers treat the key as opaque.
 */
function occurrenceKey(row: number, listPath: string, runStart: number): string {
  return `s${row}@${listPath}#${runStart}`;
}

function buildScope(
  ctx: Context,
  scope: ChainScope,
  key: string,
  parentExperienceId: string | undefined
): ScopeAttribution {
  const attribution: ScopeAttribution = {
    key,
    entityId: scope.entityId,
    entityKind: scope.kind,
  };

  // The defining layer only counts when its kind matches what this scope kind
  // is defined by.
  const { definingLayer } = scope;
  if (
    definingLayer?.kind !== undefined &&
    definingLayer.id !== undefined &&
    DEFINING_KINDS[scope.kind].includes(definingLayer.kind)
  ) {
    attribution.entityKindId = definingLayer.id;
  }

  Object.assign(attribution, readVariant(ctx, scope.layer.record, scope.entityId));

  if (scope.kind === 'Fragment' && parentExperienceId !== undefined) {
    attribution.parentExperienceId = parentExperienceId;
  }
  return attribution;
}

/** `variants[layer.variants[0]]`. The baseline carries none of these fields. */
function readVariant(
  ctx: Context,
  layer: Rec,
  entityId: string
): Pick<ScopeAttribution, 'optimizationId' | 'variantId' | 'variantIndex'> {
  const refs = layer.variants;
  if (!Array.isArray(refs) || refs.length === 0) return {};
  if (refs.length > 1) {
    ctx.log.log(`layer "${entityId}" lists ${refs.length} variants; using the first`);
  }
  const variantRow = asIndex(refs[0]);
  const variant = variantRow === undefined ? undefined : asRecord(ctx.variants[variantRow]);
  if (variant === undefined) return {};
  const result: Pick<ScopeAttribution, 'optimizationId' | 'variantId' | 'variantIndex'> = {};
  const optimizationId = asString(variant.optimizationId);
  const variantId = asString(variant.variantId);
  if (optimizationId !== undefined) result.optimizationId = optimizationId;
  if (variantId !== undefined) result.variantId = variantId;
  if (typeof variant.variantIndex === 'number') result.variantIndex = variant.variantIndex;
  return result;
}

type PathSegment = string | number;

function isPath(value: unknown): value is PathSegment[] {
  return Array.isArray(value) && value.every((s) => typeof s === 'string' || Number.isInteger(s));
}

/**
 * Collect the entry ids under `value`, following `path` first. Mirrors the
 * RFC's traversal: an `entry` leaf is a terminal source, a `dataAssembly` leaf
 * continues in another row (through its optional `path`), `asset`, `literal`,
 * `value` and unknown leaves contribute nothing, and an object or array
 * reached with no path left has every child walked.
 */
function collectEntries(
  ctx: Context,
  value: unknown,
  path: PathSegment[],
  out: Set<string>,
  visited: Set<string>
): void {
  if (Array.isArray(value)) {
    const [head, ...rest] = path;
    if (head === undefined) {
      for (const child of value) collectEntries(ctx, child, path, out, visited);
    } else if (typeof head === 'number') {
      collectEntries(ctx, value[head], rest, out, visited);
    }
    return;
  }
  const record = asRecord(value);
  if (record === undefined) return;

  if (typeof record.type === 'string') {
    if (record.type === 'entry') {
      const entryRow = asIndex(record.entry);
      const entryId =
        entryRow === undefined ? undefined : asString(asRecord(ctx.entries[entryRow])?.id);
      if (entryId !== undefined) out.add(entryId);
    } else if (record.type === 'dataAssembly') {
      const index = asIndex(record.dataAssembly);
      if (index === undefined) return;
      const row = asRecord(ctx.dataAssemblies[index]);
      const next = [...(isPath(record.path) ? record.path : []), ...path];
      const visitKey = `${index}|${next.join('/')}`;
      if (row === undefined || visited.has(visitKey)) return;
      visited.add(visitKey);
      collectEntries(ctx, row.return, next, out, visited);
    }
    return;
  }

  if (path.length === 0) {
    for (const child of Object.values(record)) collectEntries(ctx, child, path, out, visited);
  } else {
    collectEntries(ctx, record[String(path[0])], path.slice(1), out, visited);
  }
}

/** Entry ids bound by one node's `contentProperties`, in first-seen order. */
function readNodeEntries(ctx: Context, entry: Rec): string[] {
  const properties = entry.contentProperties;
  if (!Array.isArray(properties)) return [];
  const out = new Set<string>();
  for (const property of properties) {
    const item = asRecord(property);
    if (item?.type !== 'dataAssembly') continue;
    const assemblyIndex = asIndex(item.dataAssembly);
    const bindings = asRecord(item.bindings);
    if (assemblyIndex === undefined || bindings === undefined) continue;
    for (const path of Object.values(bindings)) {
      if (!isPath(path)) continue;
      const cacheKey = `${assemblyIndex}|${path.join('/')}`;
      let ids = ctx.bindingEntries.get(cacheKey);
      if (ids === undefined) {
        const found = new Set<string>();
        const hop = { type: 'dataAssembly', dataAssembly: assemblyIndex, path };
        collectEntries(ctx, hop, [], found, new Set());
        ids = [...found];
        ctx.bindingEntries.set(cacheKey, ids);
      }
      for (const id of ids) out.add(id);
    }
  }
  return [...out];
}

/**
 * Attribute one node, returning the occurrence keys it is in by layer row, or
 * `undefined` when it has no source-map entry or nothing reportable on its chain.
 */
function attributeNode(
  ctx: Context,
  node: PortableRenderNode,
  parentKeys: Map<number, string>,
  previousKeys: Map<number, string>,
  listPath: string,
  index: number
): Map<number, string> | undefined {
  const entry = node.nodeId === undefined ? undefined : asRecord(ctx.nodes[node.nodeId]);
  if (entry === undefined) return undefined;
  const scopes = reportableScopes(ctx, readChain(entry));
  if (scopes.length === 0) return undefined;

  const keys = new Map<number, string>();
  const attribution: NodeAttribution = { scopes: [], roots: [] };
  // Scopes run outer to inner, so the last Experience seen encloses what follows.
  let parentExperienceId: string | undefined;
  for (const scope of scopes) {
    const inherited = parentKeys.get(scope.row);
    // Not in the parent's occurrence: this node is a top-level node of the
    // scope, continuing the previous sibling's run if it has one.
    const key =
      inherited ?? previousKeys.get(scope.row) ?? occurrenceKey(scope.row, listPath, index);
    keys.set(scope.row, key);
    const built = (ctx.scopes[key] ??= buildScope(ctx, scope, key, parentExperienceId));
    attribution.scopes.push(built);
    if (inherited === undefined) attribution.roots.push(built);
    if (scope.kind === 'Experience') parentExperienceId = scope.entityId;
  }
  const entryIds = readNodeEntries(ctx, entry);
  if (entryIds.length > 0) {
    attribution.entryIds = entryIds;
    // Only the nearest reportable scope owns them, never the outer ones. Inline
    // fragments are not scopes, so their entries roll up to the enclosing one,
    // as the EXA-2167 example event does.
    const nearest = attribution.scopes.at(-1)?.key;
    if (nearest !== undefined) {
      const owned = ctx.scopeEntries.get(nearest) ?? new Set<string>();
      for (const id of entryIds) owned.add(id);
      ctx.scopeEntries.set(nearest, owned);
    }
  }
  node.attribution = attribution;
  return keys;
}

/**
 * Assign scopes to one sibling list, then recurse into each node's slots.
 * `parentKeys` maps layer row to the occurrence the parent is already in, and
 * `listPath` is where this list sits in the tree (empty at the root).
 */
function assignSiblings(
  ctx: Context,
  siblings: PortableRenderNode[],
  parentKeys: Map<number, string>,
  listPath = ''
): void {
  let previousKeys = new Map<number, string>();
  for (const [index, node] of siblings.entries()) {
    const attributed = attributeNode(ctx, node, parentKeys, previousKeys, listPath, index);
    previousKeys = attributed ?? new Map();
    const keys = attributed ?? parentKeys;

    for (const [slotName, children] of Object.entries(node.slots)) {
      assignSiblings(ctx, children, keys, `${listPath}/${index}.${slotName}`);
    }
  }
}

/** Write each scope's collected entries onto the lookup. */
function applyScopeEntries(ctx: Context): void {
  for (const [key, ids] of ctx.scopeEntries) {
    const scope = ctx.scopes[key];
    if (scope !== undefined) scope.entryIds = [...ids];
  }
}

/**
 * Attach `attribution` to every node that has a source-map entry, and return
 * the plan-level lookup. Returns `undefined`, leaving nodes untouched, when the
 * map is missing, the wrong version, or malformed.
 */
export function resolveAttribution(
  sourceMap: ExperienceSourceMap | undefined,
  nodes: PortableRenderNode[],
  log: DebugLogger
): PlanAttribution | undefined {
  if (sourceMap === undefined) return undefined;
  const map = asRecord(sourceMap);
  if (map === undefined || map.version !== SUPPORTED_VERSION) {
    log.log(`ignoring source map: unsupported version ${String(map?.version)}`);
    return undefined;
  }
  const nodeRows = asRecord(map.nodes);
  if (!Array.isArray(map.layers) || !Array.isArray(map.variants) || nodeRows === undefined) {
    log.log('ignoring source map: missing layers, variants or nodes');
    return undefined;
  }

  const ctx: Context = {
    nodes: nodeRows,
    layers: map.layers.map(parseLayer),
    variants: map.variants,
    entries: Array.isArray(map.entries) ? map.entries : [],
    dataAssemblies: Array.isArray(map.dataAssemblies) ? map.dataAssemblies : [],
    log,
    scopes: {},
    scopeEntries: new Map(),
    bindingEntries: new Map(),
  };
  assignSiblings(ctx, nodes, new Map());
  applyScopeEntries(ctx);
  for (const scope of Object.values(ctx.scopes)) Object.freeze(scope);
  return Object.keys(ctx.scopes).length > 0 ? { scopes: ctx.scopes } : undefined;
}
