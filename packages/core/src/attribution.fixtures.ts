/*
 * Real XDA source maps recorded in EXA-2167 (Max Toball, 2026-09-29): a selected
 * Experience-personalization variant, a selected Fragment-experiment variant,
 * and a live capture of the nextjs example's /landing page with nothing active.
 */

import type { ExperienceSourceMap } from './types.js';

export const EXPERIENCE_SOURCE_MAP: ExperienceSourceMap = {
  version: 1,
  variants: [
    { type: 'personalization', id: 'default' },
    {
      type: 'personalization',
      id: '3931542a-c6fb-4bdf-a45c-7d45f70f3dff',
      experienceId: '4U7LvmPRpVnyXZ99swrKDB',
      optimizationId: 'mtoballCkoExperienceP13n',
      variantId: '3931542a-c6fb-4bdf-a45c-7d45f70f3dff',
      variantIndex: 1,
    },
  ],
  spaces: ['u32flu02kn1w'],
  environments: ['mtoball'],
  locales: ['en-US'],
  entries: [
    { space: 0, environment: 0, id: 'mtoballSmPersonalized' },
    { space: 0, environment: 0, id: 'mtoballSmFragmentBaseline' },
  ],
  assets: [],
  layers: [
    { kind: 'Experience', id: '4U7LvmPRpVnyXZ99swrKDB', variants: [1] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'InlineExperienceFragment', id: 'mtoball-personalized-hero', dataAssembly: 0 },
    { kind: 'Component', id: 'mtoball-demo-intro' },
    { kind: 'InlineExperienceFragment', id: 'mtoball-experiment-hero-inline', dataAssembly: 1 },
    { kind: 'Component', id: 'mtoball-demo-hero' },
  ],
  dataAssemblies: [
    {
      id: '3x6nn7opWZmHZBgy7ksF9S',
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
      id: '3x6nn7opWZmHZBgy7ksF9S',
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
    crazMajw: {
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
    UCFoGvoL: {
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
      id: 'bf07694c-a84d-4222-882c-b8e28f06213b',
      optimizationId: 'mtoballCkoFragmentExp',
      variantId: 'bf07694c-a84d-4222-882c-b8e28f06213b',
      variantIndex: 1,
    },
  ],
  spaces: ['u32flu02kn1w'],
  environments: ['mtoball'],
  locales: ['en-US'],
  entries: [{ space: 0, environment: 0, id: 'mtoballSmFragmentVariantB' }],
  assets: [],
  layers: [
    { kind: 'Experience', id: '1wcc7mRucneXijoVZPZqxx', variants: [0] },
    { kind: 'ExperienceTemplate', id: 'page' },
    { kind: 'Slot', id: 'content' },
    { kind: 'ExperienceFragment', id: 'zvosZZZnhrV17KZNIzWqi', variants: [1], dataAssembly: 0 },
    { kind: 'Component', id: 'mtoball-demo-hero' },
  ],
  dataAssemblies: [
    {
      id: '3x6nn7opWZmHZBgy7ksF9S',
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
    gUzHp2GL: {
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
  spaces: ['aox0hhtsbl0l'],
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
      id: '2OP0Lv8EzklGo1ZCaNxIuA',
      parameters: { promo: { type: 'entry', entry: 0 } },
      return: {
        image: { type: 'unknown' },
        title: { type: 'entry', entry: 0, field: 'title', locale: 0, resolver: 'promoNode' },
        ctaUrl: { type: 'entry', entry: 0, field: 'ctaUrl', locale: 0, resolver: 'promoNode' },
        ctaLabel: { type: 'entry', entry: 0, field: 'ctaLabel', locale: 0, resolver: 'promoNode' },
      },
    },
    {
      id: '5KLQMTSMK4sr0wQqr1nd9n',
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
      id: 'demo-card-guide-assembly',
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
    '8wYTMvI6': {
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
    yYC7lNJo: { layers: [6, 5, 2, 1, 0], scope: 5, contentProperties: [] },
    wC4h4HTc: {
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
    ulNQW8vo: {
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
