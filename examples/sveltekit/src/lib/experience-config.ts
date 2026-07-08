/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * Design-system components in `./components/` stay free of any
 * `@contentful/*` imports. A component that needs the Experience runtime
 * context or the raw Contentful payload calls `getExperience()` /
 * `getContentfulComponent()` at the top of its `<script>` block.
 */

import { type Components, type Config, type Templates } from '@contentful/experiences-svelte';

import Button from './components/Button.svelte';
import Header from './components/Header.svelte';
import Page from './components/Page.svelte';
import Text from './components/Text.svelte';

const components: Components = {
  // Bare-component form — for the common case with no defaults / resolveData.
  button: Button,
  text: Text,

  // Config-object form — when you need defaults or resolveData.
  header: { component: Header, defaults: { variant: 'h2', text: 'Hello World' } },
};

const templates: Templates = {
  hi: { component: Page, defaults: { title: 'Welcome' } },
  hero: { component: Page, defaults: { title: 'Featured' } },
};

export const experienceConfig: Config = { components, templates };
