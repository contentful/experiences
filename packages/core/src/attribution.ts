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

function asRecord(value: unknown): Rec | undefined {
  return typeof value === 'object' && value !== null ? (value as Rec) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface Context {
  sourceMap: ExperienceSourceMap;
  layers: unknown[];
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
  /** Position in the leaf-to-root chain. */
  position: number;
  kind: EntityKind;
}

function readChain(ctx: Context, nodeId: string): number[] | undefined {
  const entry = asRecord(ctx.sourceMap.nodes[nodeId]);
  const chain = entry?.layers;
  if (!Array.isArray(chain) || !chain.every((row) => Number.isInteger(row))) return undefined;
  return chain as number[];
}

function kindOfRow(ctx: Context, row: number): string | undefined {
  return asString(asRecord(ctx.layers[row])?.kind);
}

/** Reportable layers on a chain, outer to inner, each layer row once. */
function reportableScopes(ctx: Context, chain: number[]): ChainScope[] {
  const found: ChainScope[] = [];
  const seen = new Set<number>();
  for (let position = chain.length - 1; position >= 0; position--) {
    const row = chain[position]!;
    const kindName = kindOfRow(ctx, row);
    const kind = kindName === undefined ? undefined : REPORTABLE_KINDS[kindName];
    if (kind === undefined || seen.has(row)) continue;
    if (asString(asRecord(ctx.layers[row])?.id) === undefined) continue;
    seen.add(row);
    found.push({ row, position, kind });
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
  chain: number[],
  scope: ChainScope,
  key: string
): ScopeAttribution {
  const layer = asRecord(ctx.layers[scope.row])!;
  const attribution: ScopeAttribution = {
    key,
    entityId: asString(layer.id)!,
    entityKind: scope.kind,
  };

  // The defining layer sits one step nearer the node, and only counts when its
  // kind matches what this scope kind is defined by.
  const definingRow = chain[scope.position - 1];
  if (definingRow !== undefined) {
    const definingKind = kindOfRow(ctx, definingRow);
    const definingId = asString(asRecord(ctx.layers[definingRow])?.id);
    if (
      definingKind !== undefined &&
      definingId !== undefined &&
      DEFINING_KINDS[scope.kind].includes(definingKind)
    ) {
      attribution.entityKindId = definingId;
    }
  }

  Object.assign(attribution, readVariant(ctx, layer, attribution.entityId));

  if (scope.kind === 'Fragment') {
    for (let outer = scope.position + 1; outer < chain.length; outer++) {
      const outerRow = chain[outer]!;
      if (REPORTABLE_KINDS[kindOfRow(ctx, outerRow) ?? ''] === 'Experience') {
        const parentId = asString(asRecord(ctx.layers[outerRow])?.id);
        if (parentId !== undefined) attribution.parentExperienceId = parentId;
        break;
      }
    }
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
  const variant = asRecord(ctx.sourceMap.variants[refs[0] as number]);
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
    if (path.length === 0) {
      for (const child of value) collectEntries(ctx, child, path, out, visited);
    } else {
      collectEntries(ctx, value[path[0] as number], path.slice(1), out, visited);
    }
    return;
  }
  const record = asRecord(value);
  if (record === undefined) return;

  if (typeof record.type === 'string') {
    if (record.type === 'entry') {
      const entryId = asString(asRecord(ctx.sourceMap.entries[record.entry as number])?.id);
      if (entryId !== undefined) out.add(entryId);
    } else if (record.type === 'dataAssembly') {
      const index = record.dataAssembly as number;
      const row = asRecord(ctx.sourceMap.dataAssemblies[index]);
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
function readNodeEntries(ctx: Context, nodeId: string): string[] {
  const properties = asRecord(ctx.sourceMap.nodes[nodeId])?.contentProperties;
  if (!Array.isArray(properties)) return [];
  const out = new Set<string>();
  for (const property of properties) {
    const item = asRecord(property);
    if (item?.type !== 'dataAssembly') continue;
    const row = asRecord(ctx.sourceMap.dataAssemblies[item.dataAssembly as number]);
    const bindings = asRecord(item.bindings);
    if (row === undefined || bindings === undefined) continue;
    for (const path of Object.values(bindings)) {
      if (!isPath(path)) continue;
      const cacheKey = `${String(item.dataAssembly)}|${path.join('/')}`;
      let ids = ctx.bindingEntries.get(cacheKey);
      if (ids === undefined) {
        const found = new Set<string>();
        collectEntries(ctx, row.return, path, found, new Set());
        ids = [...found];
        ctx.bindingEntries.set(cacheKey, ids);
      }
      for (const id of ids) out.add(id);
    }
  }
  return [...out];
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
    const chain = node.nodeId === undefined ? undefined : readChain(ctx, node.nodeId);
    const scopes = chain === undefined ? [] : reportableScopes(ctx, chain);
    let keys = parentKeys;

    if (chain !== undefined && node.nodeId !== undefined && scopes.length > 0) {
      keys = new Map();
      const attribution: NodeAttribution = { scopes: [], roots: [] };
      for (const scope of scopes) {
        const inherited = parentKeys.get(scope.row);
        // Not in the parent's occurrence: this node is a top-level node of the
        // scope, continuing the previous sibling's run if it has one.
        const key =
          inherited ?? previousKeys.get(scope.row) ?? occurrenceKey(scope.row, listPath, index);
        keys.set(scope.row, key);
        const built = (ctx.scopes[key] ??= buildScope(ctx, chain, scope, key));
        attribution.scopes.push(built);
        if (inherited === undefined) attribution.roots.push(built);
      }
      const entryIds = readNodeEntries(ctx, node.nodeId);
      if (entryIds.length > 0) {
        attribution.entryIds = entryIds;
        // Only the nearest reportable scope owns them, never the outer ones. Inline
        // fragments are not scopes, so their entries roll up to the enclosing one,
        // as the EXA-2167 example event does.
        const nearest = attribution.scopes[attribution.scopes.length - 1]!.key;
        const owned = ctx.scopeEntries.get(nearest) ?? new Set<string>();
        for (const id of entryIds) owned.add(id);
        ctx.scopeEntries.set(nearest, owned);
      }
      node.attribution = attribution;
      previousKeys = keys;
    } else {
      previousKeys = new Map();
    }

    for (const [slotName, children] of Object.entries(node.slots)) {
      assignSiblings(ctx, children, keys, `${listPath}/${index}.${slotName}`);
    }
  }
}

/** Write each scope's collected entries onto the lookup. */
function applyScopeEntries(ctx: Context): void {
  for (const [key, ids] of ctx.scopeEntries) ctx.scopes[key]!.entryIds = [...ids];
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
  if (!Array.isArray(map.layers) || !Array.isArray(map.variants) || !asRecord(map.nodes)) {
    log.log('ignoring source map: missing layers, variants or nodes');
    return undefined;
  }

  const ctx: Context = {
    sourceMap,
    layers: map.layers,
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
