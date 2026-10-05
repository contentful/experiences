import { assetRef, type ExperiencePersonalizationFixture } from './types.js';

// Small helper for authoring rich text without importing @contentful/rich-text-types.
const rt = (paragraphs: Array<Array<{ text: string; bold?: boolean }>>) => ({
  nodeType: 'document',
  data: {},
  content: paragraphs.map((spans) => ({
    nodeType: 'paragraph',
    data: {},
    content: spans.map(({ text, bold }) => ({
      nodeType: 'text',
      value: text,
      data: {},
      marks: bold ? [{ type: 'bold' as const }] : [],
    })),
  })),
});

/** Optional personalization layer applied after the base fixture is seeded. */
export const personalization: ExperiencePersonalizationFixture = {
  experienceId: 'landing',
  targetNodeId: 'node:hero',
  bindingParameterId: 'promo',
  entry: {
    tempId: 'entry:hero-developers',
    contentTypeId: 'promotion',
    fields: {
      internalName: { 'en-US': 'Hero — Developers personalization' },
      title: { 'en-US': 'Build composable experiences without glue code' },
      teaser: {
        'en-US': 'A developer-focused hero for visitors in the Developers audience.',
      },
      body: {
        'en-US': rt([
          [
            { text: 'Compose registered components, ' },
            { text: 'resolve content at the edge', bold: true },
            { text: ', and keep your rendering layer framework-native.' },
          ],
        ]),
      },
      ctaLabel: { 'en-US': 'Read the developer docs' },
      ctaUrl: { 'en-US': 'https://www.contentful.com/developers/docs/' },
      image: { 'en-US': assetRef('asset:hero-bg') },
    },
  },
  variant: {
    name: 'Landing (developers)',
    description: 'Personalized landing variant for developer-oriented visitors',
  },
};
