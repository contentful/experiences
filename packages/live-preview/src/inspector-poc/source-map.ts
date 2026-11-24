import type { ExperiencePayload, ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { isRecord } from '../experience-payload.js';

export type AuthoredNode =
  | { id: string; component: string; slots?: Record<string, AuthoredNode[]> }
  | { id: string; slot: string };

export type InspectorCapture = {
  spaceId: string;
  environmentId: string;
  rootComponentId: string;
  trees: Record<string, AuthoredNode[]>;
};

type Layer = { kind: string; id: string; sourceEntity?: number };
type RenderedNode = { component: string; layers: number[]; slots: Record<string, RenderedNode[]> };
type SuppliedSlots = Record<
  string,
  { nodes: AuthoredNode[]; owner: string; supplied: SuppliedSlots }
>;

/** Fixed authored topology, matched against live content and response-local runtime IDs. */
export function addCapturedSourceMap(
  payload: ExperiencePayload,
  capture: InspectorCapture
): ExperiencePayload {
  const original = payload.extensions?.sourceMap;
  // A response with authored source nodes needs no captured provenance.
  if (
    original &&
    (original.version !== 1 ||
      !isRecord(original.nodes) ||
      ![
        'variants',
        'spaces',
        'environments',
        'locales',
        'entries',
        'assets',
        'dataAssemblies',
        'layers',
      ].every((key) => Array.isArray((original as unknown as Record<string, unknown>)[key])) ||
      original.layers.some((row) => isRecord(row) && row.kind === 'SourceNode'))
  )
    return payload;
  const layers: unknown[] = [...(original?.layers ?? [])];
  const nodes: ExperienceSourceMap['nodes'] = Object.assign(Object.create(null), original?.nodes);
  const matchedIds = new Set<string>();
  let ambiguous = false;
  let invalidCapture = false;
  const layer = (row: Layer): number => {
    const matches = layers.flatMap((item, index) =>
      isRecord(item) &&
      item.kind === row.kind &&
      item.id === row.id &&
      item.sourceEntity === row.sourceEntity
        ? [index]
        : []
    );
    if (matches.length > 1) ambiguous = true;
    return matches[0] ?? layers.push(row) - 1;
  };
  const mergeLayers = (existing: number[], expected: number[]): number[] | undefined => {
    if (original) {
      const ancestry = (chain: number[]) =>
        chain
          .map((index) => layers[index])
          .filter(
            (row): row is Layer =>
              isRecord(row) && (row.kind === 'Component' || row.kind === 'Slot')
          );
      const actual = ancestry(existing);
      if (
        ancestry(expected).some((row, offset) => {
          const previous = actual[offset];
          return (
            !previous ||
            previous.kind !== row.kind ||
            previous.id !== row.id ||
            (previous.sourceEntity !== undefined && previous.sourceEntity !== row.sourceEntity)
          );
        })
      )
        return undefined;
    }
    const result: number[] = [];
    let cursor = 0;
    for (const index of expected) {
      const row = layers[index] as Layer;
      const position =
        row.kind === 'Component'
          ? existing.indexOf(index, cursor)
          : row.kind === 'Slot'
            ? existing.findIndex((candidate, offset) => {
                const slot = layers[candidate];
                return (
                  offset >= cursor && isRecord(slot) && slot.kind === 'Slot' && slot.id === row.id
                );
              })
            : -1;
      if (position === -1) {
        result.push(index);
        continue;
      }
      result.push(...existing.slice(cursor, position), index);
      cursor = position + 1;
      const scope = layers[existing[cursor]!];
      if (
        row.kind === 'Component' &&
        isRecord(scope) &&
        (scope.kind === 'ExperienceFragment' || scope.kind === 'InlineExperienceFragment')
      ) {
        result.push(existing[cursor++]!);
      }
    }
    return [...result, ...existing.slice(cursor)];
  };
  const expand = (
    authored: AuthoredNode[],
    owner: string,
    ancestors: number[],
    supplied: SuppliedSlots = {}
  ): RenderedNode[] =>
    authored.flatMap((node) => {
      if (typeof node.id !== 'string' || !node.id) {
        invalidCapture = true;
        return [];
      }
      const path = [
        ...ancestors,
        layer({
          kind: 'SourceNode',
          id: node.id,
          sourceEntity: layer({ kind: 'Component', id: owner }),
        }),
      ];
      if ('slot' in node) {
        path.push(
          layer({
            kind: 'Slot',
            id: node.slot,
            sourceEntity: layer({ kind: 'Component', id: owner }),
          })
        );
        const content = supplied[node.slot];
        return content ? expand(content.nodes, content.owner, path, content.supplied) : [];
      }
      path.push(layer({ kind: 'Component', id: node.component }));
      const implementation = Object.hasOwn(capture.trees, node.component)
        ? capture.trees[node.component]
        : undefined;
      if (implementation)
        return expand(
          implementation,
          node.component,
          path,
          Object.fromEntries(
            Object.entries(node.slots ?? {}).map(([slot, children]) => [
              slot,
              { nodes: children, owner, supplied },
            ])
          )
        );
      return [
        {
          component: node.component,
          layers: [...path].reverse(),
          slots: Object.fromEntries(
            Object.entries(node.slots ?? {}).map(([slot, children]) => [
              slot,
              expand(
                children,
                owner,
                [
                  ...path,
                  layer({
                    kind: 'Slot',
                    id: slot,
                    sourceEntity: layer({ kind: 'Component', id: node.component }),
                  }),
                ],
                supplied
              ),
            ])
          ),
        },
      ];
    });
  const match = (actual: ExperiencePayload['nodes'], expected: RenderedNode[]): boolean =>
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((node, index) => {
      const fixture = expected[index]!;
      const reference =
        isRecord(node) &&
        isRecord(node.component) &&
        isRecord(node.component.sys) &&
        typeof node.component.sys.urn === 'string' &&
        node.component.sys.urn.match(
          /^crn:contentful:::experience:spaces\/([^/]+)\/environments\/([^/]+)\/components\/([^/]+)$/
        );
      if (
        !reference ||
        !node.id ||
        matchedIds.has(node.id) ||
        !['$self', capture.spaceId].includes(reference[1]!) ||
        !['$self', capture.environmentId].includes(reference[2]!) ||
        reference[3] !== fixture.component
      )
        return false;
      matchedIds.add(node.id);
      const previous = nodes[node.id];
      if (
        previous !== undefined &&
        (!isRecord(previous) ||
          !Array.isArray(previous.layers) ||
          !previous.layers.every(
            (index) => Number.isInteger(index) && original?.layers[index] !== undefined
          ))
      )
        return false;
      const nodeLayers = mergeLayers(
        isRecord(previous) ? (previous.layers as number[]) : [],
        fixture.layers
      );
      if (!nodeLayers) return false;
      nodes[node.id] = {
        ...(isRecord(previous) ? previous : {}),
        layers: nodeLayers,
      };
      return [...new Set([...Object.keys(node.slots ?? {}), ...Object.keys(fixture.slots)])].every(
        (slot) => match(node.slots?.[slot] ?? [], fixture.slots[slot] ?? [])
      );
    });
  const tree = Object.hasOwn(capture.trees, capture.rootComponentId)
    ? capture.trees[capture.rootComponentId]
    : undefined;
  if (!tree) return payload;
  const expected = expand(tree, capture.rootComponentId, [
    layer({ kind: 'Component', id: capture.rootComponentId }),
  ]);
  if (invalidCapture || ambiguous || !match(payload.nodes, expected)) return payload;
  return {
    ...payload,
    extensions: {
      ...payload.extensions,
      sourceMap: {
        version: 1,
        variants: [],
        spaces: [],
        environments: [],
        locales: [],
        entries: [],
        assets: [],
        dataAssemblies: [],
        ...original,
        layers,
        nodes,
      },
    },
  };
}
