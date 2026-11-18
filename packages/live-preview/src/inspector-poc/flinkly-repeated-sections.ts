import type { ExperiencePayload, ExperienceSourceMap } from '@contentful/experiences-sdk-core';

type AuthoredNode =
  { id: string; component: string; slots?: Record<string, AuthoredNode[]> } | { slot: string };
type FilledSlot = { nodes: AuthoredNode[]; owner: string };
type RenderedNode = { component: string; path: number[]; slots: Record<string, RenderedNode[]> };

// Fixed authoring snapshot from 3ig419rcwm58/master, 2026-11-11.
// Only source-map provenance is mocked. Runtime IDs and rendered content stay live.
// Slot contents retain their authoring entity when inserted into implementation trees.
// Add/remove/reorder edits require recapturing this fixture.
const trees: Record<string, AuthoredNode[]> = {
  inspectorRepeatedSections: [
    {
      id: 'cta-first',
      component: 'inspectorCtaSection',
      slots: {
        body: [
          {
            id: 'authored-body-flex',
            component: 'flex',
            slots: {
              children: [
                {
                  id: 'authored-body-paragraph',
                  component: 'paragraph',
                },
                {
                  id: 'authored-body-link',
                  component: 'link',
                },
              ],
            },
          },
        ],
      },
    },
    {
      id: 'cta-second',
      component: 'inspectorCtaSection',
      slots: {
        body: [
          {
            id: 'authored-body-card',
            component: 'inspectorCtaCard',
            slots: {
              actions: [
                {
                  id: 'authored-card-primary',
                  component: 'link',
                },
                {
                  id: 'authored-card-secondary',
                  component: 'link',
                },
              ],
            },
          },
        ],
      },
    },
    {
      id: 'cta-third',
      component: 'inspectorCtaSection',
      slots: {
        body: [],
      },
    },
  ],
  inspectorCtaSection: [
    {
      id: 'cta-section',
      component: 'section',
      slots: {
        children: [
          {
            id: 'cta-layout',
            component: 'flex',
            slots: {
              children: [
                {
                  id: 'cta-heading',
                  component: 'heading',
                },
                {
                  id: 'cta-copy',
                  component: 'paragraph',
                },
                {
                  id: 'cta-body',
                  component: 'flex',
                  slots: {
                    children: [
                      {
                        slot: 'body',
                      },
                    ],
                  },
                },
                {
                  id: 'cta-footer',
                  component: 'paragraph',
                },
              ],
            },
          },
        ],
      },
    },
  ],
  inspectorCtaCard: [
    {
      id: 'card-layout',
      component: 'flex',
      slots: {
        children: [
          {
            id: 'card-heading',
            component: 'heading',
          },
          {
            id: 'card-copy',
            component: 'paragraph',
          },
          {
            id: 'card-actions',
            component: 'flex',
            slots: {
              children: [
                {
                  slot: 'actions',
                },
              ],
            },
          },
        ],
      },
    },
  ],
};

export function addFlinklyComponentSourceMap(payload: ExperiencePayload): ExperiencePayload {
  const layers = Object.keys(trees).map((id) => ({ kind: 'Component', id }));
  for (const [entityId, tree] of Object.entries(trees)) {
    const sources: Array<{ layer: number; id: string }> = [];
    const nodes: ExperienceSourceMap['nodes'] = {};
    const expand = (
      authored: AuthoredNode[],
      owner: string,
      ancestors: number[],
      supplied: Record<string, FilledSlot> = {}
    ): RenderedNode[] =>
      authored.flatMap((node) => {
        if ('slot' in node) {
          const content = supplied[node.slot];
          return content ? expand(content.nodes, content.owner, ancestors) : [];
        }
        const layer = layers.findIndex(({ id }) => id === owner);
        let index = sources.findIndex((source) => source.layer === layer && source.id === node.id);
        if (index === -1) {
          index = sources.length;
          sources.push({ layer, id: node.id });
        }
        const path = [...ancestors, index];
        const implementation = trees[node.component];
        if (implementation) {
          const filledSlots = Object.fromEntries(
            Object.entries(node.slots ?? {}).map(([slot, children]) => [
              slot,
              { nodes: children, owner },
            ])
          );
          return expand(implementation, node.component, path, filledSlots);
        }
        return [
          {
            component: node.component,
            path,
            slots: Object.fromEntries(
              Object.entries(node.slots ?? {}).map(([slot, children]) => [
                slot,
                expand(children, owner, path, supplied),
              ])
            ),
          },
        ];
      });
    const match = (actual: ExperiencePayload['nodes'], expected: RenderedNode[]): boolean =>
      actual.length === expected.length &&
      actual.every((node, index) => {
        const fixture = expected[index]!;
        if (
          !node.id ||
          node.id in nodes ||
          !('component' in node) ||
          !node.component?.sys.urn.endsWith(`/components/${fixture.component}`)
        )
          return false;
        nodes[node.id] = { path: fixture.path };
        const slotNames = new Set([
          ...Object.keys(node.slots ?? {}),
          ...Object.keys(fixture.slots),
        ]);
        return [...slotNames].every((slot) =>
          match(node.slots?.[slot] ?? [], fixture.slots[slot] ?? [])
        );
      });
    if (!match(payload.nodes, expand(tree, entityId, []))) continue;
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
          layers,
          sources,
          nodes,
        },
      },
    };
  }
  return payload;
}
