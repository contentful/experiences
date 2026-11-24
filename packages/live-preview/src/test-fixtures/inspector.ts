import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

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
        { kind: 'SourceNode', sourceEntity: 0, id: 'hero-first' },
        { kind: 'SourceNode', sourceEntity: 0, id: 'hero-second' },
        { kind: 'SourceNode', sourceEntity: 1, id: 'heading' },
      ],
      dataAssemblies: [],
      nodes: {
        'rendered-first': { layers: [2, 5, 1, 3, 0], scope: 0, contentProperties: [] },
        'rendered-second': { layers: [2, 5, 1, 4, 0], scope: 0, contentProperties: [] },
      },
    },
  },
};
