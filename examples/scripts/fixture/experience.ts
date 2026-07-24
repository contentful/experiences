import type { ExperienceFixture, ExperienceNode, DesignValue } from './types.js';

const tokenValue = (value: string): DesignValue => ({ type: 'DesignToken', value });
const manualValue = (value: string | number | boolean): DesignValue => ({
  type: 'ManualDesignValue',
  value,
});

// Wrap a design value for the default viewport ('_').
const atDefault = (value: DesignValue) => ({ _: value });

const heroNode: ExperienceNode = {
  id: 'node:hero',
  nodeType: 'InlineFragment',
  componentTypeId: 'hero-plain',
  designProperties: {
    backgroundColor: atDefault(tokenValue('color.primary')),
    color: atDefault(tokenValue('color.primaryText')),
  },
  contentBindings: {
    dataAssemblyTempId: 'assembly:hero',
    parameters: {
      promo: { $entryTempId: 'entry:hero' },
    },
  },
};

const cardOnNode: ExperienceNode = {
  id: 'node:card-on',
  nodeType: 'InlineFragment',
  componentTypeId: 'card',
  designProperties: {
    backgroundColor: atDefault(tokenValue('color.white')),
    color: atDefault(tokenValue('color.text')),
  },
  contentBindings: {
    dataAssemblyTempId: 'assembly:card',
    parameters: {
      promo: { $entryTempId: 'entry:card-on' },
    },
  },
};

const cardGuideNode: ExperienceNode = {
  id: 'node:card-guide',
  nodeType: 'InlineFragment',
  componentTypeId: 'card',
  designProperties: {
    backgroundColor: atDefault(tokenValue('color.white')),
    color: atDefault(tokenValue('color.text')),
  },
  contentBindings: {
    dataAssemblyTempId: 'assembly:card',
    parameters: {
      promo: { $entryTempId: 'entry:card-guide' },
    },
  },
};

const cardsContainerNode: ExperienceNode = {
  id: 'node:cards',
  nodeType: 'InlineFragment',
  componentTypeId: 'Section',
  designProperties: {
    direction: atDefault(manualValue('row')),
    columns: atDefault(manualValue('2')),
    gap: atDefault(tokenValue('size.xl')),
    verticalSpacing: atDefault(tokenValue('size.xl')),
    horizontalSpacing: atDefault(tokenValue('size.sm')),
    backgroundColor: atDefault(tokenValue('color.none')),
  },
  slots: {
    children: [cardOnNode, cardGuideNode],
  },
};

export const experience: ExperienceFixture = {
  id: 'landing',
  name: 'Landing (demo)',
  description:
    'Minimal ExO demo — 1 hero + 2 cards, all bound via DataAssembly to promotion entries',
  templateId: 'page',
  viewports: [{ id: '_', query: '*', displayName: 'Default', previewSize: '1024px' }],
  slots: {
    content: [heroNode, cardsContainerNode],
  },
};
