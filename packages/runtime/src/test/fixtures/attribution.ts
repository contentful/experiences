const urn = (id: string) =>
  `crn:contentful:::experience:spaces/$self/environments/$self/components/${id}`;

export const attributionPayload = {
  sys: { id: 'exp-1' },
  nodes: [
    {
      id: 'hero',
      component: { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: urn('h') } },
    },
  ],
};

export const attributionSourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: 'variant-b',
      optimizationId: 'opt-1',
      variantId: 'variant-b',
      variantIndex: 1,
    },
  ],
  spaces: ['space-1'],
  environments: ['master'],
  locales: ['en-US'],
  entries: [{ space: 0, environment: 0, id: 'entry-1' }],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'exp-1', variants: [0] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'ExperienceFragment', id: 'frag-1', variants: [1] },
    { kind: 'Component', id: 'hero-component' },
  ],
  dataAssemblies: [
    {
      id: 'da',
      parameters: {},
      return: { title: { type: 'entry', entry: 0, field: 'title', locale: 0 } },
    },
  ],
  nodes: {
    hero: {
      layers: [4, 3, 2, 1, 0],
      scope: 3,
      contentProperties: [
        { type: 'dataAssembly', dataAssembly: 0, bindings: { title: ['title'] } },
      ],
    },
  },
};
