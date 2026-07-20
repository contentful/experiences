import { assetRef, type EntryFixture } from './types.js';

// Small helper for authoring rich text without importing @contentful/rich-text-types.
const rt = (paragraphs: Array<Array<{ text: string; bold?: boolean; italic?: boolean }>>) => ({
  nodeType: 'document',
  data: {},
  content: paragraphs.map((spans) => ({
    nodeType: 'paragraph',
    data: {},
    content: spans.map(({ text, bold, italic }) => ({
      nodeType: 'text',
      value: text,
      data: {},
      marks: [
        ...(bold ? [{ type: 'bold' as const }] : []),
        ...(italic ? [{ type: 'italic' as const }] : []),
      ],
    })),
  })),
});

export const entries: EntryFixture[] = [
  {
    tempId: 'entry:hero',
    contentTypeId: 'promotion',
    fields: {
      internalName: { 'en-US': 'Hero — Modernize your content stack' },
      title: { 'en-US': 'Ready to modernize your content stack?' },
      teaser: {
        'en-US': 'Unify your content operations and deliver experiences that convert.',
      },
      body: {
        'en-US': rt([
          [
            { text: 'The world’s leading brands trust Contentful to ' },
            { text: 'unify their content operations', bold: true },
            { text: ' and deliver experiences that convert.' },
          ],
          [
            { text: 'Join thousands of teams who’ve left legacy CMS behind. ' },
            { text: 'Your content infrastructure starts here.', italic: true },
          ],
        ]),
      },
      ctaLabel: { 'en-US': 'Book a demo' },
      ctaUrl: { 'en-US': 'https://www.contentful.com/contact/sales/' },
      image: { 'en-US': assetRef('asset:hero-bg') },
    },
  },
  {
    tempId: 'entry:card-on',
    contentTypeId: 'promotion',
    fields: {
      internalName: { 'en-US': 'Card — On case study' },
      title: { 'en-US': 'See how On runs on Contentful' },
      teaser: {
        'en-US':
          'On, the Swiss performance brand, uses Contentful to power global digital experiences at speed.',
      },
      body: {
        'en-US': rt([
          [
            { text: 'On uses Contentful to power ' },
            { text: 'global digital experiences at speed', bold: true },
            { text: ' — across DTC, wholesale, and brand channels simultaneously.' },
          ],
        ]),
      },
      ctaLabel: { 'en-US': 'Read the On case study' },
      ctaUrl: { 'en-US': 'https://www.contentful.com/case-studies/on/' },
      image: { 'en-US': assetRef('asset:card-on') },
    },
  },
  {
    tempId: 'entry:card-guide',
    contentTypeId: 'promotion',
    fields: {
      internalName: { 'en-US': 'Card — Developer guide' },
      title: { 'en-US': 'Content as Infrastructure' },
      teaser: {
        'en-US':
          'Contentful isn’t just a CMS — it’s a content infrastructure layer for developers.',
      },
      body: {
        'en-US': rt([
          [
            {
              text: 'Contentful isn’t just a CMS — it’s a content infrastructure layer for developers building modern digital experiences.',
            },
          ],
        ]),
      },
      ctaLabel: { 'en-US': 'Read the developer guide' },
      ctaUrl: { 'en-US': 'https://www.contentful.com/developers/' },
      image: { 'en-US': assetRef('asset:card-guide') },
    },
  },
];
