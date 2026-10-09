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
type VariantFields = Pick<ScopeAttribution, 'optimizationId' | 'variantId' | 'variantIndex'>;
type Rec = Record<string, unknown>;
type PathSegment = string | number;

const DEFINING_LAYER_KIND: Record<EntityKind, string> = {
  Experience: 'ExperienceTemplate',
  Fragment: 'Component',
};

function asRecord(value: unknown): Rec | undefined {
  return typeof value === 'object' && value !== null ? (value as Rec) : undefined;
}

function asIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rowAt(rows: unknown[], ref: unknown): Rec | undefined {
  const index = asIndex(ref);
  return index === undefined ? undefined : asRecord(rows[index]);
}

function isPath(value: unknown): value is PathSegment[] {
  return Array.isArray(value) && value.every((s) => typeof s === 'string' || Number.isInteger(s));
}

interface Layer {
  record: Rec;
  kind: string | undefined;
  id: string | undefined;
}

function parseLayer(value: unknown): Layer | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  return { record, kind: asString(record.kind), id: asString(record.id) };
}

function scopeKind(layer: Layer): EntityKind | undefined {
  if (layer.kind === 'Experience') return 'Experience';
  if (layer.kind === 'ExperienceFragment') return 'Fragment';
  return undefined;
}

interface Context {
  nodes: Rec;
  layers: (Layer | undefined)[];
  variants: unknown[];
  entries: unknown[];
  dataAssemblies: unknown[];
  log: DebugLogger;
  scopes: Record<string, ScopeAttribution>;
  scopeEntries: Map<ScopeAttribution, Set<string>>;
  bindingEntries: Map<string, readonly string[]>;
}

function createContext(sourceMap: ExperienceSourceMap, log: DebugLogger): Context | undefined {
  const map = asRecord(sourceMap);
  if (map?.version !== SUPPORTED_VERSION) {
    log.log(`ignoring source map: unsupported version ${String(map?.version)}`);
    return undefined;
  }
  const nodes = asRecord(map.nodes);
  if (!Array.isArray(map.layers) || !Array.isArray(map.variants) || nodes === undefined) {
    log.log('ignoring source map: missing layers, variants or nodes');
    return undefined;
  }
  return {
    nodes,
    layers: map.layers.map(parseLayer),
    variants: map.variants,
    entries: Array.isArray(map.entries) ? map.entries : [],
    dataAssemblies: Array.isArray(map.dataAssemblies) ? map.dataAssemblies : [],
    log,
    scopes: {},
    scopeEntries: new Map(),
    bindingEntries: new Map(),
  };
}

interface ChainScope {
  row: number;
  layer: Layer;
  entityId: string;
  kind: EntityKind;
  entityKindId: string | undefined;
}

function reportableScopes(ctx: Context, chain: number[]): ChainScope[] {
  const outerFirst = [...chain].reverse();
  const scopes: ChainScope[] = [];

  for (const [position, row] of outerFirst.entries()) {
    const layer = ctx.layers[row];
    const kind = layer === undefined ? undefined : scopeKind(layer);
    if (layer?.id === undefined || kind === undefined) continue;
    if (scopes.some((scope) => scope.row === row)) continue;

    const innerRow = outerFirst[position + 1];
    const innerLayer = innerRow === undefined ? undefined : ctx.layers[innerRow];
    const definesThisScope = innerLayer?.kind === DEFINING_LAYER_KIND[kind];

    scopes.push({
      row,
      layer,
      entityId: layer.id,
      kind,
      entityKindId: definesThisScope ? innerLayer?.id : undefined,
    });
  }
  return scopes;
}

function occurrenceKey(row: number, listPath: string, runStart: number): string {
  return `s${row}@${listPath}#${runStart}`;
}

function readVariant(ctx: Context, scope: ChainScope): VariantFields {
  const refs = scope.layer.record.variants;
  if (!Array.isArray(refs) || refs.length === 0) return {};
  if (refs.length > 1) {
    ctx.log.log(`layer "${scope.entityId}" lists ${refs.length} variants; using the first`);
  }

  const variant = rowAt(ctx.variants, refs[0]);
  const optimizationId = asString(variant?.optimizationId);
  const variantId = asString(variant?.variantId);
  const variantIndex = variant?.variantIndex;

  const fields: VariantFields = {};
  if (optimizationId !== undefined) fields.optimizationId = optimizationId;
  if (variantId !== undefined) fields.variantId = variantId;
  if (typeof variantIndex === 'number') fields.variantIndex = variantIndex;
  return fields;
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
    ...readVariant(ctx, scope),
  };
  if (scope.entityKindId !== undefined) {
    attribution.entityKindId = scope.entityKindId;
  }
  if (scope.kind === 'Fragment' && parentExperienceId !== undefined) {
    attribution.parentExperienceId = parentExperienceId;
  }
  return attribution;
}

function entriesBoundAt(ctx: Context, assemblyRow: number, path: PathSegment[]): readonly string[] {
  const cacheKey = `${assemblyRow}|${path.join('/')}`;
  const cached = ctx.bindingEntries.get(cacheKey);
  if (cached !== undefined) return cached;

  const found = new Set<string>();
  const visited = new Set<string>();

  const followAssembly = (row: number, path: PathSegment[]): void => {
    const visitKey = `${row}|${path.join('/')}`;
    const assembly = asRecord(ctx.dataAssemblies[row]);
    if (assembly === undefined || visited.has(visitKey)) return;
    visited.add(visitKey);
    walk(assembly.return, path);
  };

  const walkLeaf = (leaf: Rec, path: PathSegment[]): void => {
    if (leaf.type === 'entry') {
      const entryId = asString(rowAt(ctx.entries, leaf.entry)?.id);
      if (entryId !== undefined) found.add(entryId);
    } else if (leaf.type === 'dataAssembly') {
      const row = asIndex(leaf.dataAssembly);
      const leafPath = isPath(leaf.path) ? leaf.path : [];
      if (row !== undefined) followAssembly(row, [...leafPath, ...path]);
    }
  };

  const walk = (value: unknown, path: PathSegment[]): void => {
    const [head, ...rest] = path;

    if (Array.isArray(value)) {
      if (head === undefined) value.forEach((child) => walk(child, []));
      else if (typeof head === 'number') walk(value[head], rest);
      return;
    }

    const record = asRecord(value);
    if (record === undefined) return;
    if (typeof record.type === 'string') walkLeaf(record, path);
    else if (head === undefined) Object.values(record).forEach((child) => walk(child, []));
    else walk(record[String(head)], rest);
  };

  followAssembly(assemblyRow, path);
  const ids = [...found];
  ctx.bindingEntries.set(cacheKey, ids);
  return ids;
}

function readNodeEntries(ctx: Context, entry: Rec): string[] {
  const properties: unknown[] = Array.isArray(entry.contentProperties)
    ? entry.contentProperties
    : [];
  const ids = new Set<string>();

  for (const property of properties) {
    const item = asRecord(property);
    const assemblyRow = asIndex(item?.dataAssembly);
    const bindings = asRecord(item?.bindings);
    if (item?.type !== 'dataAssembly' || assemblyRow === undefined || bindings === undefined) {
      continue;
    }
    for (const path of Object.values(bindings).filter(isPath)) {
      for (const id of entriesBoundAt(ctx, assemblyRow, path)) ids.add(id);
    }
  }
  return [...ids];
}

function addScopeEntries(ctx: Context, scope: ScopeAttribution, entryIds: string[]): void {
  const owned = ctx.scopeEntries.get(scope) ?? new Set<string>();
  for (const id of entryIds) owned.add(id);
  ctx.scopeEntries.set(scope, owned);
}

function readChain(entry: Rec): number[] {
  const { layers } = entry;
  return Array.isArray(layers) && layers.every(Number.isInteger) ? (layers as number[]) : [];
}

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
  let parentExperienceId: string | undefined;
  let nearest: ScopeAttribution | undefined;

  for (const scope of scopes) {
    const isRoot = !parentKeys.has(scope.row);
    const key =
      parentKeys.get(scope.row) ??
      previousKeys.get(scope.row) ??
      occurrenceKey(scope.row, listPath, index);
    keys.set(scope.row, key);

    nearest = ctx.scopes[key] ??= buildScope(ctx, scope, key, parentExperienceId);
    attribution.scopes.push(nearest);
    if (isRoot) attribution.roots.push(nearest);
    if (scope.kind === 'Experience') parentExperienceId = scope.entityId;
  }

  const entryIds = readNodeEntries(ctx, entry);
  if (entryIds.length > 0 && nearest !== undefined) {
    attribution.entryIds = entryIds;
    addScopeEntries(ctx, nearest, entryIds);
  }
  node.attribution = attribution;
  return keys;
}

function assignSiblings(
  ctx: Context,
  siblings: PortableRenderNode[],
  parentKeys: Map<number, string>,
  listPath = ''
): void {
  let previousKeys = new Map<number, string>();
  for (const [index, node] of siblings.entries()) {
    const ownKeys = attributeNode(ctx, node, parentKeys, previousKeys, listPath, index);
    previousKeys = ownKeys ?? new Map();

    for (const [slotName, children] of Object.entries(node.slots)) {
      assignSiblings(ctx, children, ownKeys ?? parentKeys, `${listPath}/${index}.${slotName}`);
    }
  }
}

export function resolveAttribution(
  sourceMap: ExperienceSourceMap | undefined,
  nodes: PortableRenderNode[],
  log: DebugLogger
): PlanAttribution | undefined {
  if (sourceMap === undefined) return undefined;
  const ctx = createContext(sourceMap, log);
  if (ctx === undefined) return undefined;

  assignSiblings(ctx, nodes, new Map());
  for (const [scope, ids] of ctx.scopeEntries) scope.entryIds = [...ids];

  const scopes = Object.values(ctx.scopes);
  for (const scope of scopes) Object.freeze(scope);
  return scopes.length > 0 ? { scopes: ctx.scopes } : undefined;
}
