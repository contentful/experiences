import type { ContentTypeFixture } from './types.js';

export const contentTypes: ContentTypeFixture[] = [
  {
    id: 'promotion',
    name: 'Promotion',
    description:
      'A promotional card: title + short teaser + long-form body + CTA + hero image. One entry backs one node in the demo Experience.',
    displayField: 'internalName',
    fields: [
      { id: 'internalName', name: 'Internal name', type: 'Symbol', required: true },
      { id: 'title', name: 'Title', type: 'Symbol', required: true },
      { id: 'teaser', name: 'Teaser', type: 'Symbol' },
      { id: 'body', name: 'Body', type: 'RichText' },
      { id: 'ctaLabel', name: 'CTA label', type: 'Symbol' },
      { id: 'ctaUrl', name: 'CTA URL', type: 'Symbol' },
      { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
    ],
  },
];
