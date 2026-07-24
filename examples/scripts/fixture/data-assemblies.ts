import type { DataAssemblyFixture } from './types.js';

// Each DataAssembly is a small transform from an Entry to a ComponentType's
// contentProperties. GraphQL is the resolver source; the query field naming
// matches how Contentful's content graph auto-generates types (Promotion,
// promotion.name, etc.).

const heroAssembly: DataAssemblyFixture = {
  tempId: 'assembly:hero',
  name: 'Hero from Promotion',
  description: 'Maps a promotion entry into the hero-plain ComponentType',
  // dataType MUST mirror hero-plain's contentProperties.
  dataType: [
    { id: 'title', name: 'Title', type: 'String', required: true },
    { id: 'ctaLabel', name: 'CTA label', type: 'String' },
    { id: 'ctaUrl', name: 'CTA URL', type: 'String' },
    { id: 'image', name: 'Image URL', type: 'String' },
  ],
  parameters: {
    promo: {
      name: 'Promotion entry',
      linkType: 'Contentful:Entry',
      allowedContentTypes: ['promotion'],
    },
  },
  resolvers: {
    promoNode: {
      source: 'Contentful:GraphQL',
      query: `query ($id: ID!) {
  _node(id: $id) {
    __typename
    ... on Promotion {
      title
      ctaLabel
      ctaUrl
      image { url }
    }
  }
}`,
      parameters: { id: '$parameters/promo' },
    },
  },
  return: {
    title: { $from: '$resolvers/promoNode/_node/title' },
    ctaLabel: { $from: '$resolvers/promoNode/_node/ctaLabel' },
    ctaUrl: { $from: '$resolvers/promoNode/_node/ctaUrl' },
    image: { $from: '$resolvers/promoNode/_node/image/url' },
  },
};

const cardAssembly: DataAssemblyFixture = {
  tempId: 'assembly:card',
  name: 'Card from Promotion',
  description: 'Maps a promotion entry into the card ComponentType',
  // dataType MUST mirror card's contentProperties.
  dataType: [
    { id: 'title', name: 'Title', type: 'String', required: true },
    { id: 'teaser', name: 'Teaser', type: 'String' },
    { id: 'ctaLabel', name: 'CTA label', type: 'String' },
    { id: 'ctaUrl', name: 'CTA URL', type: 'String' },
    { id: 'image', name: 'Image URL', type: 'String' },
  ],
  parameters: {
    promo: {
      name: 'Promotion entry',
      linkType: 'Contentful:Entry',
      allowedContentTypes: ['promotion'],
    },
  },
  resolvers: {
    promoNode: {
      source: 'Contentful:GraphQL',
      query: `query ($id: ID!) {
  _node(id: $id) {
    __typename
    ... on Promotion {
      title
      teaser
      ctaLabel
      ctaUrl
      image { url }
    }
  }
}`,
      parameters: { id: '$parameters/promo' },
    },
  },
  return: {
    title: { $from: '$resolvers/promoNode/_node/title' },
    teaser: { $from: '$resolvers/promoNode/_node/teaser' },
    ctaLabel: { $from: '$resolvers/promoNode/_node/ctaLabel' },
    ctaUrl: { $from: '$resolvers/promoNode/_node/ctaUrl' },
    image: { $from: '$resolvers/promoNode/_node/image/url' },
  },
};

export const dataAssemblies: DataAssemblyFixture[] = [heroAssembly, cardAssembly];

// Which ComponentType each DataAssembly binds to. When publishing an Experience
// that uses a DA on a ComponentType node, that ComponentType MUST list the DA
// in its `dataAssemblies` array or publish fails with
// `DataAssemblyMembershipViolation`. This mapping lets the bootstrap update the
// ComponentType after the DA is created.
export const dataAssemblyComponentTypeLinks: Array<{
  dataAssemblyTempId: string;
  componentTypeId: string;
}> = [
  { dataAssemblyTempId: 'assembly:hero', componentTypeId: 'hero-plain' },
  { dataAssemblyTempId: 'assembly:card', componentTypeId: 'card' },
];
