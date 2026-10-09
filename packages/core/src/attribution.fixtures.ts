import type { ExperienceSourceMap } from './types.js';

export const EXPERIENCE_SOURCE_MAP: ExperienceSourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: '1234',
      experienceId: 'experience1',
      optimizationId: 'optimization1',
      variantId: 'variant1',
      variantIndex: 1,
    },
  ],
  spaces: ['space1'],
  environments: ['environment1'],
  locales: ['en-US'],
  entries: [
    { space: 0, environment: 0, id: 'personalized' },
    { space: 0, environment: 0, id: 'baseline' },
  ],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'experience1', variants: [1] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'InlineExperienceFragment', id: 'personalized-hero', dataAssembly: 0 },
    { kind: 'Component', id: 'demo-intro' },
    { kind: 'InlineExperienceFragment', id: 'experiment-hero-inline', dataAssembly: 1 },
    { kind: 'Component', id: 'demo-hero' },
  ],
  dataAssemblies: [
    {
      id: 'assembly1',
      parameters: {
        title: { type: 'literal' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
      return: {
        title: { type: 'entry', entry: 0, field: 'headline', locale: 0, resolver: 'main' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
    },
    {
      id: 'assembly1',
      parameters: {
        title: { type: 'literal' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
      return: {
        title: { type: 'entry', entry: 1, field: 'headline', locale: 0, resolver: 'main' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
    },
  ],
  nodes: {
    'node1-1': {
      layers: [4, 3, 2, 1, 0],
      scope: 3,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 0,
          bindings: { title: ['title'], eyebrow: ['eyebrow'], description: ['description'] },
        },
      ],
    },
    'node1-2': {
      layers: [6, 5, 2, 1, 0],
      scope: 5,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 1,
          bindings: { title: ['title'], eyebrow: ['eyebrow'], description: ['description'] },
        },
      ],
    },
  },
};

export const FRAGMENT_SOURCE_MAP: ExperienceSourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: '2345',
      optimizationId: 'optimization2',
      variantId: 'variant2',
      variantIndex: 1,
    },
  ],
  spaces: ['space1'],
  environments: ['environment1'],
  locales: ['en-US'],
  entries: [{ space: 0, environment: 0, id: 'smFragmentVariantB' }],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'experience2', variants: [0] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'ExperienceFragment', id: 'fragment2', variants: [1], dataAssembly: 0 },
    { kind: 'Component', id: 'demo-hero' },
  ],
  dataAssemblies: [
    {
      id: 'assembly1',
      parameters: {
        title: { type: 'literal' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
      return: {
        title: { type: 'entry', entry: 0, field: 'headline', locale: 0, resolver: 'main' },
        eyebrow: { type: 'literal' },
        description: { type: 'literal' },
      },
    },
  ],
  nodes: {
    'node2-1': {
      layers: [4, 3, 2, 1, 0],
      scope: 3,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 0,
          bindings: { title: ['title'], eyebrow: ['eyebrow'], description: ['description'] },
        },
      ],
    },
  },
};

/** Live capture: local `nextjs` example's `/landing` page, no personalization active. */
export const LANDING_SOURCE_MAP: ExperienceSourceMap = {
  version: 1,
  variants: [{ type: 'personalization', id: 'default' }],
  spaces: ['space2'],
  environments: ['master'],
  locales: ['en-US'],
  entries: [
    { space: 0, environment: 0, id: 'demo-entry-hero' },
    { space: 0, environment: 0, id: 'demo-entry-card-on' },
    { space: 0, environment: 0, id: 'demo-entry-card-guide' },
  ],
  assets: [],
  layers: [
    { kind: 'Experience', id: 'landing', variants: [0] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'InlineExperienceFragment', id: 'node:hero', dataAssembly: 0 },
    { kind: 'Component', id: 'hero-plain' },
    { kind: 'InlineExperienceFragment', id: 'node:cards' },
    { kind: 'Component', id: 'Section' },
    { kind: 'Slot', id: 'children' },
    { kind: 'InlineExperienceFragment', id: 'node:card-on', dataAssembly: 1 },
    { kind: 'Component', id: 'card' },
    { kind: 'InlineExperienceFragment', id: 'node:card-guide', dataAssembly: 2 },
  ],
  dataAssemblies: [
    {
      id: 'assembly2',
      parameters: { promo: { type: 'entry', entry: 0 } },
      return: {
        image: { type: 'unknown' },
        title: { type: 'entry', entry: 0, field: 'title', locale: 0, resolver: 'promoNode' },
        ctaUrl: { type: 'entry', entry: 0, field: 'ctaUrl', locale: 0, resolver: 'promoNode' },
        ctaLabel: { type: 'entry', entry: 0, field: 'ctaLabel', locale: 0, resolver: 'promoNode' },
      },
    },
    {
      id: 'assembly2',
      parameters: { promo: { type: 'entry', entry: 1 } },
      return: {
        image: { type: 'unknown' },
        title: { type: 'entry', entry: 1, field: 'title', locale: 0, resolver: 'promoNode' },
        ctaUrl: { type: 'entry', entry: 1, field: 'ctaUrl', locale: 0, resolver: 'promoNode' },
        teaser: { type: 'entry', entry: 1, field: 'teaser', locale: 0, resolver: 'promoNode' },
        ctaLabel: { type: 'entry', entry: 1, field: 'ctaLabel', locale: 0, resolver: 'promoNode' },
      },
    },
    {
      id: 'assembly3',
      parameters: { promo: { type: 'entry', entry: 2 } },
      return: {
        image: { type: 'unknown' },
        title: { type: 'entry', entry: 2, field: 'title', locale: 0, resolver: 'promoNode' },
        ctaUrl: { type: 'entry', entry: 2, field: 'ctaUrl', locale: 0, resolver: 'promoNode' },
        teaser: { type: 'entry', entry: 2, field: 'teaser', locale: 0, resolver: 'promoNode' },
        ctaLabel: { type: 'entry', entry: 2, field: 'ctaLabel', locale: 0, resolver: 'promoNode' },
      },
    },
  ],
  nodes: {
    'node-3-1': {
      layers: [4, 3, 2, 1, 0],
      scope: 3,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 0,
          bindings: {
            image: ['image'],
            title: ['title'],
            ctaUrl: ['ctaUrl'],
            ctaLabel: ['ctaLabel'],
          },
        },
      ],
    },
    'node-3-2': { layers: [6, 5, 2, 1, 0], scope: 5, contentProperties: [] },
    'node-3-3': {
      layers: [9, 8, 7, 6, 5, 2, 1, 0],
      scope: 8,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 1,
          bindings: {
            image: ['image'],
            title: ['title'],
            ctaUrl: ['ctaUrl'],
            teaser: ['teaser'],
            ctaLabel: ['ctaLabel'],
          },
        },
      ],
    },
    'node-3-4': {
      layers: [10, 7, 6, 5, 2, 1, 0],
      scope: 10,
      contentProperties: [
        {
          type: 'dataAssembly',
          dataAssembly: 2,
          bindings: {
            image: ['image'],
            title: ['title'],
            ctaUrl: ['ctaUrl'],
            teaser: ['teaser'],
            ctaLabel: ['ctaLabel'],
          },
        },
      ],
    },
  },
};
