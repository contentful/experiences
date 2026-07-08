/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * Design-system components in `./components/` stay free of any
 * `@contentful/*` imports — they remain portable. When a component needs
 * SDK runtime context or the raw Contentful payload, it opts in via
 * `getExperience()` / `getContentfulComponent()` rather than receiving
 * SDK-shaped props it didn't declare.
 */

import { type Components, type Config, type Templates } from '@contentful/experiences-svelte';

import Button from './components/Button.svelte';
import Header from './components/Header.svelte';
import Page from './components/Page.svelte';
import Text from './components/Text.svelte';

const components: Components = {
  // Bare-component registrations — no defaults, no resolveData, no boilerplate.
  button: Button,
  text: Text,

  // Config-object shape when you need defaults / resolveData.
  header: { component: Header, defaults: { variant: 'h2', text: 'Hello World' } },
};

const templates: Templates = {
  hi: { component: Page, defaults: { title: 'Welcome' } },
  hero: { component: Page, defaults: { title: 'Featured' } },
};

export const experienceConfig: Config = { components, templates };
