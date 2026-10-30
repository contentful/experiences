import type { ExperienceFixture, ExperienceNode, DesignValue } from './types.js';

const tokenValue = (value: string): DesignValue => ({ type: 'DesignToken', value });
const manualValue = (value: string | number | boolean): DesignValue => ({
  type: 'ManualDesignValue',
  value,
});

const heroNode: ExperienceNode = {
  id: 'node:hero',
  nodeType: 'InlineExperienceFragment',
  componentId: 'hero-plain',
  designProperties: {
    backgroundColor: tokenValue('color.primary'),
    color: tokenValue('color.primaryText'),
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
  nodeType: 'InlineExperienceFragment',
  componentId: 'card',
  designProperties: {
    backgroundColor: tokenValue('color.white'),
    color: tokenValue('color.text'),
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
  nodeType: 'InlineExperienceFragment',
  componentId: 'card',
  designProperties: {
    backgroundColor: tokenValue('color.white'),
    color: tokenValue('color.text'),
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
  nodeType: 'InlineExperienceFragment',
  componentId: 'Section',
  designProperties: {
    direction: manualValue('row'),
    columns: manualValue('2'),
    gap: tokenValue('size.xl'),
    verticalSpacing: tokenValue('size.xl'),
    horizontalSpacing: tokenValue('size.sm'),
    backgroundColor: tokenValue('color.none'),
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
  experienceTemplateId: 'page',
  slots: {
    content: [heroNode, cardsContainerNode],
  },
};

// Served by the Destination's home node (`/`), so the root path renders a
// different page than `/demo/landing`.
const homeHeroNode: ExperienceNode = {
  ...heroNode,
  id: 'node:home-hero',
  contentBindings: {
    dataAssemblyTempId: 'assembly:hero',
    parameters: {
      promo: { $entryTempId: 'entry:home-hero' },
    },
  },
};

export const homeExperience: ExperienceFixture = {
  id: 'home',
  name: 'Home (demo)',
  description: 'Minimal ExO demo home page — 1 hero bound via DataAssembly to a promotion entry',
  experienceTemplateId: 'page',
  slots: {
    content: [homeHeroNode],
  },
};
