import type { ExperiencePayload } from './types.js';

export const REPEATED_FRAGMENT_PAYLOAD = {
  sys: {
    type: 'Experience',
    id: 'nt4312-probe-20261005',
  },
  nodes: [
    {
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Section',
        },
      },
      id: 'Mksv7-QC',
      contentProperties: {},
      designProperties: {},
      slots: {
        children: [
          {
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Text',
              },
            },
            id: 'BsXMMRwA',
            contentProperties: {},
            designProperties: {},
            slots: {},
          },
        ],
      },
    },
    {
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Section',
        },
      },
      id: 'Mksv7-QC',
      contentProperties: {},
      designProperties: {},
      slots: {
        children: [
          {
            component: {
              sys: {
                type: 'ResourceLink',
                linkType: 'Contentful:Component',
                urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/Text',
              },
            },
            id: 'BsXMMRwA',
            contentProperties: {},
            designProperties: {},
            slots: {},
          },
        ],
      },
    },
  ],
  extensions: {
    sourceMap: {
      version: 1,
      variants: [
        {
          type: 'personalization',
          id: 'default',
        },
      ],
      spaces: [],
      environments: [],
      locales: [],
      entries: [],
      assets: [],
      layers: [
        {
          kind: 'Experience',
          id: 'nt4312-probe-20261005',
          variants: [0],
        },
        {
          kind: 'ExperienceTemplate',
          id: 'page',
        },
        {
          kind: 'Slot',
          id: 'content',
        },
        {
          kind: 'ExperienceFragment',
          id: 'nt4312-probe-fragment',
          variants: [0],
        },
        {
          kind: 'Component',
          id: 'Section',
        },
        {
          kind: 'Slot',
          id: 'children',
        },
        {
          kind: 'InlineExperienceFragment',
          id: 'probe-inline-text',
        },
        {
          kind: 'Component',
          id: 'Text',
        },
      ],
      dataAssemblies: [],
      nodes: {
        'Mksv7-QC': {
          layers: [4, 3, 2, 1, 0],
          scope: 3,
          contentProperties: [],
        },
        BsXMMRwA: {
          layers: [7, 6, 5, 4, 3, 2, 1, 0],
          scope: 6,
          contentProperties: [],
        },
      },
    },
  },
} as unknown as ExperiencePayload;
