import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

// Constructed backend contract example: two Hero placements render the same
// Heading definition. Source rows are shared; runtime IDs and paths are distinct.
export const inspectorPayload: ExperiencePayload = {
  sys: { type: 'Experience', id: 'page' },
  nodes: ['rendered-first', 'rendered-second'].map((id) => ({
    id,
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: 'crn:contentful:::experience:components/heading',
      },
    },
    contentProperties: { title: id },
    designProperties: {},
    slots: {},
  })),
  extensions: {
    sourceMap: {
      version: 1,
      variants: [{ type: 'personalization', id: 'default' }],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [
        { kind: 'Experience', id: 'page', variants: [0] },
        { kind: 'Component', id: 'hero' },
        { kind: 'Component', id: 'heading' },
      ],
      sources: [
        { layer: 0, id: 'hero-first' },
        { layer: 0, id: 'hero-second' },
        { layer: 1, id: 'heading' },
      ],
      dataAssemblies: [],
      nodes: {
        'rendered-first': { layers: [2, 1, 0], scope: 0, contentProperties: [], path: [0, 2] },
        'rendered-second': { layers: [2, 1, 0], scope: 0, contentProperties: [], path: [1, 2] },
      },
    },
  },
};
