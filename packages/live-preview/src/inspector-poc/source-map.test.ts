import type { ExperiencePayload, ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overrideInspectorResponse } from './override-response';
import type { InspectorCapture } from './source-map';

const capture: InspectorCapture = {
  spaceId: 'fixture-space',
  environmentId: 'fixture-environment',
  rootComponentId: 'page',
  trees: {
    page: [
      { id: 'first', component: 'hero' },
      { id: 'second', component: 'hero' },
    ],
    hero: [{ id: 'title', component: 'heading' }],
  },
};
const request = { spaceId: 'fixture-space', environmentId: 'fixture-environment', sourceMap: true };
const component = (
  id: string,
  type: string,
  slots: ExperiencePayload['nodes'][number]['slots'] = {}
) => ({
  id,
  component: {
    sys: {
      type: 'ResourceLink' as const,
      linkType: 'Contentful:Component' as const,
      urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${type}`,
    },
  },
  contentProperties: { title: `Live ${id}` },
  slots,
});
const payload = (): ExperiencePayload => ({
  sys: { type: 'Experience', id: 'preview' },
  nodes: [component('runtime-a', 'heading'), component('runtime-b', 'heading')],
});
type Row = { kind: string; id: string; sourceEntity?: number };
function chain(map: ExperienceSourceMap, id: string): Row[] {
  return (map.nodes[id] as { layers: number[] }).layers.map((index) => map.layers[index] as Row);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('captured Preview Session response', () => {
  it('passes through old captures that omitted authored placeholder IDs', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const oldCapture = {
      ...capture,
      trees: { page: [{ slot: 'body' }] },
    } as unknown as InspectorCapture;
    const input: ExperiencePayload = { sys: { type: 'Experience' }, nodes: [] };
    expect(overrideInspectorResponse(input, request, oldCapture)).toBe(input);
  });

  it('retains logical slot and authored placeholder rows when no content is supplied', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const empty: InspectorCapture = {
      ...capture,
      trees: { page: [{ id: 'empty-body', slot: 'body' }] },
    };
    const input: ExperiencePayload = { sys: { type: 'Experience' }, nodes: [] };
    const map = overrideInspectorResponse(input, request, empty).extensions!.sourceMap!;
    expect(map.layers).toEqual([
      { kind: 'Component', id: 'page' },
      { kind: 'SourceNode', id: 'empty-body', sourceEntity: 0 },
      { kind: 'Slot', id: 'body', sourceEntity: 0 },
    ]);
    expect(map.nodes).toEqual({});
  });

  it.each([{}, null, { sys: {} }, { sys: { urn: 42 } }])(
    'passes through an unidentifiable component reference %j',
    (reference) => {
      vi.stubEnv('NODE_ENV', 'development');
      const input = payload();
      input.nodes[0] = {
        id: 'runtime-a',
        component: reference,
      } as unknown as ExperiencePayload['nodes'][number];
      expect(overrideInspectorResponse(input, request, capture)).toBe(input);
    }
  );

  it('passes through a map with ambiguous local and foreign entity IDs', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const input = payload();
    input.extensions = {
      sourceMap: {
        version: 1,
        variants: [],
        spaces: ['foreign', 'fixture-space'],
        environments: ['fixture-environment'],
        locales: [],
        entries: [],
        assets: [],
        dataAssemblies: [],
        layers: [
          { kind: 'Component', id: 'hero', space: 0 },
          { kind: 'Component', id: 'hero', space: 1 },
          { kind: 'Component', id: 'heading', space: 1 },
          { kind: 'Component', id: 'page', space: 1 },
        ],
        nodes: {
          'runtime-a': { layers: [2, 1, 3] },
          'runtime-b': { layers: [2, 1, 3] },
        },
      },
    };
    expect(overrideInspectorResponse(input, request, capture)).toBe(input);
  });

  it('leaves unusable backend maps untouched', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const input = payload();
    input.extensions = { sourceMap: { version: 1 } as ExperienceSourceMap };
    expect(overrideInspectorResponse(input, request, capture)).toBe(input);
  });

  it('does not repurpose dangling backend layer references when adding captured layers', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const input = payload();
    input.extensions = {
      sourceMap: {
        version: 1,
        variants: [],
        spaces: [],
        environments: [],
        locales: [],
        entries: [],
        assets: [],
        dataAssemblies: [],
        layers: [{ kind: 'Component', id: 'heading' }],
        nodes: { 'runtime-a': { layers: [1] }, 'runtime-b': { layers: [0] } },
      },
    };
    expect(overrideInspectorResponse(input, request, capture)).toBe(input);
  });

  it('distinguishes two placeholders of one logical slot while retaining supplied authored ownership', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const repeated: InspectorCapture = {
      ...capture,
      trees: {
        page: [
          {
            id: 'placement',
            component: 'echo',
            slots: { body: [{ id: 'copy', component: 'paragraph' }] },
          },
        ],
        echo: [
          { id: 'body-first', slot: 'body' },
          { id: 'body-second', slot: 'body' },
        ],
      },
    };
    const input = payload();
    input.nodes = [component('occurrence-a', 'paragraph'), component('occurrence-b', 'paragraph')];
    const map = overrideInspectorResponse(input, request, repeated).extensions!.sourceMap!;
    expect(Object.keys(map.nodes)).toEqual(['occurrence-a', 'occurrence-b']);
    for (const [runtimeId, placeholderId] of [
      ['occurrence-a', 'body-first'],
      ['occurrence-b', 'body-second'],
    ]) {
      expect(
        chain(map, runtimeId!)
          .filter(({ kind }) => kind === 'SourceNode')
          .map(({ id }) => id)
      ).toEqual(['copy', placeholderId, 'placement']);
    }
    expect(map.layers.filter((row) => (row as Row).kind === 'Slot')).toHaveLength(1);
  });

  it.each([
    ['production', request, capture],
    ['test', request, capture],
    ['development', { ...request, sourceMap: false }, capture],
    ['development', { ...request, sourceMap: undefined }, capture],
    ['development', { ...request, spaceId: 'another-space' }, capture],
    ['development', { ...request, environmentId: 'another-environment' }, capture],
    ['development', request, undefined],
  ] as const)(
    'passes through an unconfigured or nonmatching request in %s',
    (environment, options, configured) => {
      vi.stubEnv('NODE_ENV', environment);
      const input = payload();
      expect(overrideInspectorResponse(input, options, configured)).toBe(input);
    }
  );

  it.each(['missing-id', 'duplicate-id', 'changed-component', 'extra-node', 'foreign-space'])(
    'passes through %s topology',
    (change) => {
      vi.stubEnv('NODE_ENV', 'development');
      const input = payload();
      if (change === 'missing-id') delete input.nodes[0]!.id;
      if (change === 'duplicate-id') input.nodes[1]!.id = input.nodes[0]!.id;
      if (change === 'extra-node') input.nodes.push(component('extra', 'heading'));
      if (change === 'changed-component') input.nodes[0] = component('runtime-a', 'paragraph');
      if (change === 'foreign-space') {
        input.nodes[0] = component('runtime-a', 'heading');
        if ('component' in input.nodes[0]!)
          input.nodes[0]!.component.sys.urn =
            'crn:contentful:::experience:spaces/foreign/environments/$self/components/heading';
      }
      expect(overrideInspectorResponse(input, request, capture)).toBe(input);
    }
  );

  it('keeps the complete existing map and response-local references while adding source nodes', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const original: ExperienceSourceMap = {
      version: 1,
      variants: [{ type: 'personalization', id: 'variant' }],
      spaces: ['fixture-space'],
      environments: ['fixture-environment'],
      locales: ['en-US'],
      entries: [{ id: 'entry', space: 0, environment: 0 }],
      assets: [{ id: 'asset' }],
      dataAssemblies: [{ id: 'assembly' }],
      layers: [
        { kind: 'Experience', id: 'experience', variants: [0] },
        { kind: 'ExperienceTemplate', id: 'template' },
        { kind: 'Component', id: 'page' },
        { kind: 'Component', id: 'hero' },
        { kind: 'ExperienceFragment', id: 'fragment', space: 0 },
        { kind: 'Component', id: 'heading' },
      ],
      nodes: {
        'runtime-a': {
          layers: [5, 3, 4, 2, 1, 0],
          scope: 0,
          contentProperties: [{ entry: 0, locale: 0 }],
        },
        'runtime-b': { layers: [5, 3, 4, 2, 1, 0], scope: 4, designProperties: [{ asset: 0 }] },
        'unrendered-node': { layers: [1, 0] },
      },
    };
    const input = payload();
    input.extensions = {
      sourceMap: original,
      personalization: { profile: { id: 'real-profile' } },
    };
    const before = globalThis.structuredClone(input);
    const output = overrideInspectorResponse(input, request, capture);
    const map = output.extensions!.sourceMap!;
    expect(map.layers.slice(0, 6)).toEqual(original.layers);
    expect(map.nodes['unrendered-node']).toEqual(original.nodes['unrendered-node']);
    expect(map.nodes['runtime-b']).toMatchObject({ scope: 4, designProperties: [{ asset: 0 }] });
    expect(chain(map, 'runtime-b')).toEqual([
      original.layers[5],
      { kind: 'SourceNode', id: 'title', sourceEntity: 3 },
      original.layers[3],
      original.layers[4],
      { kind: 'SourceNode', id: 'second', sourceEntity: 2 },
      original.layers[2],
      original.layers[1],
      original.layers[0],
    ]);
    for (const key of [
      'variants',
      'spaces',
      'environments',
      'locales',
      'entries',
      'assets',
      'dataAssemblies',
    ] as const) {
      expect(map[key]).toBe(original[key]);
    }
    for (const value of Object.values(map.nodes) as Array<{ layers: number[] }>) {
      for (const index of value.layers) expect(map.layers[index]).toBeDefined();
    }
    expect(output.extensions!.personalization).toBe(input.extensions.personalization);
    expect(input).toEqual(before);
  });

  it.each(['matching', 'renamed', 'missing', 'extra'])(
    'qualifies backend slot transitions only when topology matches (%s)',
    (topology) => {
      vi.stubEnv('NODE_ENV', 'development');
      const slotted: InspectorCapture = {
        ...capture,
        trees: {
          page: [
            {
              id: 'first',
              component: 'panel',
              slots: { children: [{ id: 'copy', component: 'paragraph' }] },
            },
            {
              id: 'second',
              component: 'card',
              slots: { children: [{ id: 'action', component: 'link' }] },
            },
          ],
          panel: [{ id: 'panel-placeholder', slot: 'children' }],
          card: [{ id: 'card-placeholder', slot: 'children' }],
        },
      };
      const original: ExperienceSourceMap = {
        version: 1,
        variants: [],
        spaces: [],
        environments: [],
        locales: [],
        entries: [],
        assets: [],
        dataAssemblies: [],
        layers: [
          { kind: 'Component', id: 'page' },
          { kind: 'Component', id: 'panel' },
          { kind: 'Component', id: 'paragraph' },
          { kind: 'Component', id: 'card' },
          { kind: 'Component', id: 'link' },
          { kind: 'Slot', id: 'children' },
          { kind: 'Experience', id: 'preview' },
        ],
        nodes: {
          'runtime-a': { layers: [2, 5, 1, 0, 6], scope: 6, contentProperties: [] },
          'runtime-b': { layers: [4, 5, 3, 0, 6], scope: 6, contentProperties: [] },
          unrendered: { layers: [5, 0, 6], scope: 6, contentProperties: [] },
        },
      };
      const input = payload();
      input.nodes = [component('runtime-a', 'paragraph'), component('runtime-b', 'link')];
      input.extensions = { sourceMap: original };
      if (topology === 'renamed') original.layers[5] = { kind: 'Slot', id: 'aside' };
      if (topology === 'missing')
        (original.nodes['runtime-a'] as { layers: number[] }).layers = [2, 1, 0, 6];
      if (topology === 'extra') {
        original.layers.push({ kind: 'Slot', id: 'aside' });
        (original.nodes['runtime-a'] as { layers: number[] }).layers = [2, 5, 7, 1, 0, 6];
      }
      const output = overrideInspectorResponse(input, request, slotted);
      if (topology !== 'matching') {
        expect(output).toBe(input);
        return;
      }
      const map = output.extensions!.sourceMap!;
      expect(map.layers.slice(0, original.layers.length)).toEqual(original.layers);
      expect(map.nodes.unrendered).toBe(original.nodes.unrendered);
      for (const [runtimeId, owner] of [
        ['runtime-a', 'panel'],
        ['runtime-b', 'card'],
      ] as const) {
        const slots = chain(map, runtimeId).filter(({ kind }) => kind === 'Slot');
        expect(slots.map(({ id, sourceEntity }) => [id, map.layers[sourceEntity!]])).toEqual([
          ['children', { kind: 'Component', id: owner }],
        ]);
        expect(map.nodes[runtimeId]).toMatchObject({ scope: 6, contentProperties: [] });
      }
      expect(chain(map, 'runtime-a')).toEqual([
        original.layers[2],
        { kind: 'SourceNode', id: 'copy', sourceEntity: 0 },
        { kind: 'Slot', id: 'children', sourceEntity: 1 },
        { kind: 'SourceNode', id: 'panel-placeholder', sourceEntity: 1 },
        original.layers[1],
        { kind: 'SourceNode', id: 'first', sourceEntity: 0 },
        original.layers[0],
        original.layers[6],
      ]);
    }
  );

  it.each([
    ['missing owner', [2, 0, 4]],
    ['changed owner', [2, 3, 0, 4]],
    ['extra owner', [2, 3, 1, 0, 4]],
    ['missing runtime mapping', undefined],
  ] as const)(
    'passes through a backend map with %s despite matching delivered shape',
    (_scenario, ancestry) => {
      vi.stubEnv('NODE_ENV', 'development');
      const nodes: Record<string, unknown> = {
        'runtime-b': { layers: [2, 1, 0, 4], scope: 4, contentProperties: [] },
      };
      if (ancestry) nodes['runtime-a'] = { layers: [...ancestry], scope: 4, contentProperties: [] };
      const input = payload();
      input.extensions = {
        sourceMap: {
          version: 1,
          variants: [],
          spaces: [],
          environments: [],
          locales: [],
          entries: [],
          assets: [],
          dataAssemblies: [],
          layers: [
            { kind: 'Component', id: 'page' },
            { kind: 'Component', id: 'hero' },
            { kind: 'Component', id: 'heading' },
            { kind: 'Component', id: 'other-hero' },
            { kind: 'Experience', id: 'preview' },
          ],
          nodes,
        },
      };
      expect(overrideInspectorResponse(input, request, capture)).toBe(input);
    }
  );

  it('retains the supplying owner through same-named forwarded slots', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const forwarded: InspectorCapture = {
      ...capture,
      trees: {
        page: [
          {
            id: 'placement',
            component: 'layout',
            slots: {
              children: [{ id: 'body', component: 'paragraph' }],
            },
          },
        ],
        layout: [
          {
            id: 'forward',
            component: 'panel',
            slots: { children: [{ id: 'forward-children', slot: 'children' }] },
          },
        ],
        panel: [
          {
            id: 'frame',
            component: 'section',
            slots: { children: [{ id: 'panel-children', slot: 'children' }] },
          },
        ],
      },
    };
    const input: ExperiencePayload = {
      sys: { type: 'Experience' },
      nodes: [
        component('runtime-frame', 'section', {
          children: [component('runtime-body', 'paragraph')],
        }),
      ],
    };
    const result = overrideInspectorResponse(input, request, forwarded);
    const map = result.extensions!.sourceMap!;
    const rows = chain(map, 'runtime-body') as Array<{
      kind: string;
      id: string;
      sourceEntity?: number;
    }>;
    expect(
      rows
        .filter(({ kind }) => kind === 'SourceNode' || kind === 'Slot')
        .map(({ kind, id, sourceEntity }) => [kind, id, map.layers[sourceEntity!]])
    ).toEqual([
      ['SourceNode', 'body', { kind: 'Component', id: 'page' }],
      ['Slot', 'children', { kind: 'Component', id: 'layout' }],
      ['SourceNode', 'forward-children', { kind: 'Component', id: 'layout' }],
      ['Slot', 'children', { kind: 'Component', id: 'panel' }],
      ['SourceNode', 'panel-children', { kind: 'Component', id: 'panel' }],
      ['Slot', 'children', { kind: 'Component', id: 'section' }],
      ['SourceNode', 'frame', { kind: 'Component', id: 'panel' }],
      ['SourceNode', 'forward', { kind: 'Component', id: 'layout' }],
      ['SourceNode', 'placement', { kind: 'Component', id: 'page' }],
    ]);
    expect(result.nodes).toBe(input.nodes);
  });

  it('adds leaf-to-root authored ownership for repeated placements without changing preview content', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const input = payload();
    const result = overrideInspectorResponse(input, request, capture);
    expect(result).not.toBe(input);
    expect(result.nodes).toBe(input.nodes);
    expect(result.sys).toBe(input.sys);
    expect(input.extensions).toBeUndefined();
    const map = result.extensions!.sourceMap!;
    expect(Object.keys(map.nodes)).toEqual(['runtime-a', 'runtime-b']);
    expect(overrideInspectorResponse(result, request, capture)).toBe(result);
    expect(chain(map, 'runtime-b')).toEqual([
      { kind: 'Component', id: 'heading' },
      { kind: 'SourceNode', id: 'title', sourceEntity: expect.any(Number) },
      { kind: 'Component', id: 'hero' },
      { kind: 'SourceNode', id: 'second', sourceEntity: expect.any(Number) },
      { kind: 'Component', id: 'page' },
    ]);
    const sources = chain(map, 'runtime-a').filter((row) => row.kind === 'SourceNode') as Array<{
      id: string;
      sourceEntity: number;
    }>;
    expect(sources.map(({ id, sourceEntity }) => [id, map.layers[sourceEntity]])).toEqual([
      ['title', { kind: 'Component', id: 'hero' }],
      ['first', { kind: 'Component', id: 'page' }],
    ]);
    expect(map).not.toHaveProperty('sources');
    expect(map).not.toHaveProperty('sourceNodes');
    for (const node of Object.values(map.nodes)) expect(node).not.toHaveProperty('path');
    for (const layer of map.layers) expect(layer).not.toHaveProperty('instantiates');
  });
});
