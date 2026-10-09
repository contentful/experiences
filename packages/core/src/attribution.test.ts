import { describe, expect, it, vi } from 'vitest';

import {
  EXPERIENCE_SOURCE_MAP,
  FRAGMENT_SOURCE_MAP,
  LANDING_SOURCE_MAP,
} from './attribution.fixtures';
import { REPEATED_FRAGMENT_PAYLOAD } from './attribution-probe.fixtures';
import { resolveExperience } from './resolve-experience';
import type {
  ExperienceNode,
  ExperiencePayload,
  ExperienceSourceMap,
  PortableRenderNode,
} from './types';

const config = { components: {} };

function node(id: string | undefined, slots?: Record<string, ExperienceNode[]>): ExperienceNode {
  return {
    ...(id === undefined ? {} : { id }),
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/stub',
      },
    },
    ...(slots ? { slots } : {}),
  } as ExperienceNode;
}

function payloadOf(nodes: ExperienceNode[]): ExperiencePayload {
  return { sys: { type: 'Experience' }, nodes } as unknown as ExperiencePayload;
}

async function resolve(nodes: ExperienceNode[], sourceMap: unknown) {
  return resolveExperience(payloadOf(nodes), config, {
    sourceMap: sourceMap as ExperienceSourceMap,
  });
}

function find(nodes: PortableRenderNode[], nodeId: string): PortableRenderNode {
  for (const n of nodes) {
    if (n.nodeId === nodeId) return n;
    for (const children of Object.values(n.slots)) {
      const hit = children.find((c) => c.nodeId === nodeId) ?? undefined;
      if (hit) return hit;
    }
  }
  throw new Error(`node ${nodeId} not found`);
}

describe('scope attribution', () => {
  it('attributes a personalized Experience with its variant fields', async () => {
    const plan = await resolve([node('node1-1'), node('node1-2')], EXPERIENCE_SOURCE_MAP);

    const [scope] = plan.nodes[0]!.attribution!.scopes;
    expect(scope).toMatchObject({
      entityId: 'experience1',
      entityKind: 'Experience',
      entityKindId: 'page',
      variantId: 'variant1',
      variantIndex: 1,
      optimizationId: 'optimization1',
    });
    expect(scope).not.toHaveProperty('parentExperienceId');
  });

  it('puts sibling nodes of one Experience in a single occurrence', async () => {
    const plan = await resolve([node('node1-1'), node('node1-2')], EXPERIENCE_SOURCE_MAP);

    const [a, b] = plan.nodes.map((n) => n.attribution!.scopes[0]!.key);
    expect(a).toBe(b);
    expect(Object.keys(plan.attribution!.scopes)).toEqual([a]);
  });

  it('attributes a Fragment with its parent Experience, and puts the node in both scopes', async () => {
    const plan = await resolve([node('node2-1')], FRAGMENT_SOURCE_MAP);

    const { scopes, roots } = plan.nodes[0]!.attribution!;
    expect(scopes.map((s) => s.entityKind)).toEqual(['Experience', 'Fragment']);
    expect(scopes[1]).toMatchObject({
      entityId: 'fragment2',
      entityKind: 'Fragment',
      entityKindId: 'demo-hero',
      variantId: 'variant2',
      variantIndex: 1,
      optimizationId: 'optimization2',
      parentExperienceId: 'experience2',
    });
    expect(roots).toHaveLength(2);
  });

  it('omits variant fields for the baseline instead of inventing them', async () => {
    const plan = await resolve([node('node2-1')], FRAGMENT_SOURCE_MAP);

    const experience = plan.nodes[0]!.attribution!.scopes[0]!;
    expect(experience).toEqual({
      key: experience.key,
      entityId: 'experience2',
      entityKind: 'Experience',
      entityKindId: 'page',
    });
  });

  it('walks through inline fragments without reporting them', async () => {
    const plan = await resolve(
      [node('node-3-1'), node('node-3-2', { children: [node('node-3-3')] })],
      LANDING_SOURCE_MAP
    );

    for (const scopes of [
      plan.nodes[0]!.attribution!.scopes,
      plan.nodes[1]!.attribution!.scopes,
      find(plan.nodes, 'node-3-3').attribution!.scopes,
    ]) {
      expect(scopes.map((s) => s.entityId)).toEqual(['landing']);
    }
    expect(Object.values(plan.attribution!.scopes).map((s) => s.entityKind)).toEqual([
      'Experience',
    ]);
  });

  it('marks a nested node as inside its parent occurrence, not a root', async () => {
    const plan = await resolve(
      [node('node-3-2', { children: [node('node-3-3')] })],
      LANDING_SOURCE_MAP
    );

    expect(plan.nodes[0]!.attribution!.roots).toHaveLength(1);
    expect(find(plan.nodes, 'node-3-3').attribution!.roots).toEqual([]);
  });

  describe('two copies of one persisted Fragment (recorded from a live space)', () => {
    const fragmentKeys = (plan: { nodes: PortableRenderNode[] }) =>
      plan.nodes.map(
        (n) => n.attribution?.scopes.find((s) => s.entityKind === 'Fragment')?.key ?? null
      );

    it('merges copies placed directly next to each other into one occurrence (documented limit)', async () => {
      const plan = await resolveExperience(REPEATED_FRAGMENT_PAYLOAD, config);

      const [a, b] = fragmentKeys(plan);
      expect(a).not.toBeNull();
      expect(a).toBe(b);
      expect(
        Object.values(plan.attribution!.scopes).filter((s) => s.entityKind === 'Fragment')
      ).toHaveLength(1);
    });

    it('keeps them distinct when another node sits between them, despite identical ids', async () => {
      const [first, second] = REPEATED_FRAGMENT_PAYLOAD.nodes;

      const separator = node('separator');
      const sourceMap = {
        ...REPEATED_FRAGMENT_PAYLOAD.extensions!.sourceMap!,
        nodes: {
          ...REPEATED_FRAGMENT_PAYLOAD.extensions!.sourceMap!.nodes,
          separator: { layers: [2, 1, 0], scope: 0, contentProperties: [] },
        },
      };

      const plan = await resolveExperience(
        { ...REPEATED_FRAGMENT_PAYLOAD, nodes: [first!, separator, second!] },
        config,
        { sourceMap: sourceMap as ExperienceSourceMap }
      );

      const [a, separatorKey, b] = fragmentKeys(plan);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(separatorKey).toBeNull();
      expect(a).not.toBe(b);
      expect(
        Object.values(plan.attribution!.scopes).filter((s) => s.entityKind === 'Fragment')
      ).toHaveLength(2);
    });

    it('reports the shared Experience once across both copies', async () => {
      const plan = await resolveExperience(REPEATED_FRAGMENT_PAYLOAD, config);

      const experienceKeys = plan.nodes.map(
        (n) => n.attribution!.scopes.find((s) => s.entityKind === 'Experience')!.key
      );
      expect(new Set(experienceKeys).size).toBe(1);
    });
  });

  it('ignores a defining layer of the wrong kind', async () => {
    const sourceMap = {
      ...FRAGMENT_SOURCE_MAP,
      layers: FRAGMENT_SOURCE_MAP.layers.map((layer, i) =>
        i === 4 ? { kind: 'Slot', id: 'not-a-component' } : layer
      ),
    };

    const plan = await resolve([node('node2-1')], sourceMap);

    expect(plan.nodes[0]!.attribution!.scopes[1]).not.toHaveProperty('entityKindId');
  });

  it('uses the first variant when a layer lists several, and logs it', async () => {
    const sourceMap = {
      ...FRAGMENT_SOURCE_MAP,
      layers: FRAGMENT_SOURCE_MAP.layers.map((layer, i) =>
        i === 3 ? { ...(layer as object), variants: [1, 0] } : layer
      ),
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const plan = await resolveExperience(payloadOf([node('node2-1')]), config, {
      sourceMap: sourceMap as ExperienceSourceMap,
      debug: true,
    });

    expect(plan.nodes[0]!.attribution!.scopes[1]).toMatchObject({ variantIndex: 1 });
    expect(plan.diagnostics).toEqual([]);
    log.mockRestore();
  });

  it('skips a node with no id, and a node missing from the map', async () => {
    const plan = await resolve([node(undefined), node('not-in-map')], LANDING_SOURCE_MAP);

    expect(plan.nodes[0]).not.toHaveProperty('attribution');
    expect(plan.nodes[1]).not.toHaveProperty('attribution');
  });

  it('skips a node whose chain holds nothing reportable', async () => {
    const sourceMap = {
      ...LANDING_SOURCE_MAP,
      layers: [{ kind: 'InlineExperienceFragment', id: 'orphan' }],
      nodes: { orphan: { layers: [0], scope: 0 } },
    };

    const plan = await resolve([node('orphan')], sourceMap);

    expect(plan.nodes[0]).not.toHaveProperty('attribution');
  });

  it('produces no attribution and no diagnostic for an unusable map', async () => {
    for (const bad of [
      { ...LANDING_SOURCE_MAP, version: 2 },
      { version: 1 },
      { ...LANDING_SOURCE_MAP, nodes: null },
      { ...LANDING_SOURCE_MAP, nodes: { x: { layers: 'nope' } } },
      'garbage',
    ]) {
      const plan = await resolve([node('x')], bad);

      expect(plan.attribution).toBeUndefined();
      expect(plan.nodes[0]).not.toHaveProperty('attribution');
      expect(plan.diagnostics).toEqual([]);
    }
  });

  it('clears attribution when the next resolve carries no map', async () => {
    const withMap = await resolve([node('node1-1')], EXPERIENCE_SOURCE_MAP);
    const without = await resolveExperience(payloadOf([node('node1-1')]), config);

    expect(withMap.attribution).toBeDefined();
    expect(without.attribution).toBeUndefined();
    expect(without.nodes[0]).not.toHaveProperty('attribution');
  });

  it('survives a JSON round trip', async () => {
    const plan = await resolve([node('node2-1')], FRAGMENT_SOURCE_MAP);

    expect(JSON.parse(JSON.stringify(plan.attribution))).toEqual(plan.attribution);
    expect(JSON.parse(JSON.stringify(plan.nodes[0]!.attribution))).toEqual(
      plan.nodes[0]!.attribution
    );
  });

  it('shares one frozen scope object per occurrence', async () => {
    const plan = await resolve([node('node1-1'), node('node1-2')], EXPERIENCE_SOURCE_MAP);

    const [a, b] = plan.nodes.map((n) => n.attribution!.scopes[0]!);
    expect(a).toBe(b);
    expect(a).toBe(plan.attribution!.scopes[a!.key]);
    expect(Object.isFrozen(a)).toBe(true);
  });

  describe('bound entry ids', () => {
    const entries = ['e0', 'e1', 'e2', 'e3'].map((id) => ({ space: 0, environment: 0, id }));
    const entry = (n: number) => ({ type: 'entry', entry: n, field: 'f', locale: 0 });

    function mapWith(
      dataAssemblies: unknown[],
      bindings: Record<string, unknown>,
      extra: Record<string, unknown> = {}
    ) {
      return {
        version: 1,
        variants: [{ type: 'personalization', id: 'default' }],
        spaces: [],
        environments: [],
        locales: [],
        entries,
        assets: [],
        layers: [
          { kind: 'Experience', id: 'exp', variants: [0] },
          { kind: 'ExperienceTemplate', id: 'page' },
          { kind: 'Component', id: 'c' },
        ],
        dataAssemblies,
        nodes: {
          n: {
            layers: [2, 1, 0],
            scope: 0,
            contentProperties: [{ type: 'dataAssembly', dataAssembly: 0, bindings }],
          },
        },
        ...extra,
      };
    }

    async function entryIdsOf(sourceMap: unknown) {
      const plan = await resolve([node('n')], sourceMap);
      return plan.nodes[0]!.attribution!.scopes[0]!.entryIds;
    }

    it('reports the entries an Experience binds through its inline fragments', async () => {
      const plan = await resolve([node('node1-1'), node('node1-2')], EXPERIENCE_SOURCE_MAP);

      const [scope] = plan.nodes[0]!.attribution!.scopes;
      expect(scope!.entryIds).toEqual(['personalized', 'baseline']);
      expect(plan.attribution!.scopes[scope!.key]!.entryIds).toEqual(scope!.entryIds);
      expect(plan.nodes[0]!.attribution!.entryIds).toEqual(['personalized']);
    });

    it("keeps a persisted Fragment's entries off the enclosing Experience", async () => {
      const plan = await resolve([node('node2-1')], FRAGMENT_SOURCE_MAP);

      const [experience, fragment] = plan.nodes[0]!.attribution!.scopes;
      expect(fragment!.entryIds).toEqual(['smFragmentVariantB']);
      expect(experience).not.toHaveProperty('entryIds');
    });

    it('unions the entries of a whole Experience', async () => {
      const plan = await resolve(
        [node('node-3-1'), node('node-3-2', { children: [node('node-3-3'), node('node-3-4')] })],
        LANDING_SOURCE_MAP
      );

      expect(plan.nodes[0]!.attribution!.scopes[0]!.entryIds).toEqual([
        'demo-entry-hero',
        'demo-entry-card-on',
        'demo-entry-card-guide',
      ]);
    });

    it('follows string paths into nested objects and collects every leaf under a subtree', async () => {
      const da = {
        return: {
          hero: { title: entry(0), sub: { body: entry(1) } },
          other: entry(2),
        },
      };

      expect(await entryIdsOf(mapWith([da], { a: ['hero', 'sub', 'body'] }))).toEqual(['e1']);
      expect(await entryIdsOf(mapWith([da], { a: ['hero'] }))).toEqual(['e0', 'e1']);
    });

    it('follows numeric array indexes, and walks a whole array when the path ends on it', async () => {
      const da = { return: { list: [entry(0), entry(1), entry(2)] } };

      expect(await entryIdsOf(mapWith([da], { a: ['list', 1] }))).toEqual(['e1']);
      expect(await entryIdsOf(mapWith([da], { a: ['list'] }))).toEqual(['e0', 'e1', 'e2']);
    });

    it('resolves a nested Data Assembly leaf, applying its path when present', async () => {
      const parent = {
        return: {
          whole: { type: 'dataAssembly', dataAssembly: 1 },
          part: { type: 'dataAssembly', dataAssembly: 1, path: ['sub', 'content'] },
          mixed: { content: { type: 'dataAssembly', dataAssembly: 1, path: ['sub'] } },
        },
      };
      const nested = { return: { top: entry(0), sub: { content: entry(1), other: entry(2) } } };
      const das = [parent, nested];

      expect(await entryIdsOf(mapWith(das, { a: ['whole'] }))).toEqual(['e0', 'e1', 'e2']);
      expect(await entryIdsOf(mapWith(das, { a: ['part'] }))).toEqual(['e1']);
      expect(await entryIdsOf(mapWith(das, { a: ['mixed'] }))).toEqual(['e1', 'e2']);
    });

    it('ignores literals, values, assets and unknown leaves', async () => {
      const da = {
        return: {
          lit: { type: 'literal' },
          val: { type: 'value' },
          asset: { type: 'asset', asset: 0, field: 'file', locale: 0 },
          unk: { type: 'unknown' },
          weird: { type: 'somethingNew' },
        },
      };

      expect(
        await entryIdsOf(
          mapWith([da], { a: ['lit'], b: ['val'], c: ['asset'], d: ['unk'], e: ['weird'] })
        )
      ).toBeUndefined();
    });

    it('does not report entries no rendered node binds', async () => {
      const da = { return: { used: entry(0), unused: entry(3) } };

      expect(await entryIdsOf(mapWith([da], { a: ['used'] }))).toEqual(['e0']);
    });

    it('dedupes entries bound more than once', async () => {
      const da = { return: { one: entry(0), two: entry(0), three: entry(1) } };

      expect(await entryIdsOf(mapWith([da], { a: ['one'], b: ['two'], c: ['three'] }))).toEqual([
        'e0',
        'e1',
      ]);
    });

    it('survives a Data Assembly cycle', async () => {
      const a = { return: { loop: { type: 'dataAssembly', dataAssembly: 1 }, hit: entry(0) } };
      const b = { return: { back: { type: 'dataAssembly', dataAssembly: 0 } } };

      expect(await entryIdsOf(mapWith([a, b], { x: [] }))).toEqual(['e0']);
    });

    it('skips a dangling or malformed binding without failing', async () => {
      const da = { return: { ok: entry(0), ghost: entry(99) } };
      const sourceMap = mapWith([da], { a: ['ok'], b: ['ghost'], c: ['missing'], d: 'nope' });

      expect(await entryIdsOf(sourceMap)).toEqual(['e0']);
    });

    it('keeps attribution, without entry ids, when the map has no dataAssemblies array', async () => {
      const sourceMap = mapWith([], { a: ['ok'] }, { dataAssemblies: undefined });

      const plan = await resolve([node('n')], sourceMap);

      expect(plan.diagnostics).toEqual([]);
      expect(plan.nodes[0]!.attribution!.scopes[0]).toMatchObject({ entityId: 'exp' });
      expect(plan.nodes[0]!.attribution).not.toHaveProperty('entryIds');
    });

    it('keeps attribution, without entry ids, when the map has no entries array', async () => {
      const da = { return: { ok: entry(0) } };
      const sourceMap = mapWith([da], { a: ['ok'] }, { entries: undefined });

      const plan = await resolve([node('n')], sourceMap);

      expect(plan.diagnostics).toEqual([]);
      expect(plan.nodes[0]!.attribution!.scopes[0]).toMatchObject({ entityId: 'exp' });
      expect(plan.nodes[0]!.attribution).not.toHaveProperty('entryIds');
    });

    it('leaves entryIds off a node bound to nothing', async () => {
      const plan = await resolve([node('node-3-1'), node('node-3-2')], LANDING_SOURCE_MAP);

      expect(plan.nodes[0]!.attribution!.entryIds).toEqual(['demo-entry-hero']);
      expect(plan.nodes[1]!.attribution).not.toHaveProperty('entryIds');

      expect(plan.nodes[1]!.attribution!.scopes[0]!.entryIds).toEqual(['demo-entry-hero']);
    });
  });
});
