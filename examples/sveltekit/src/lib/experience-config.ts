/**
 * Maps Contentful component/template ids to the app's components, and wires
 * `resolveToken`. Components read design via `getDesignValues()`.
 */

import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type Templates,
} from '@contentful/experiences-svelte';

import Button from './components/Button.svelte';
import Header, { type HeaderProps } from './components/Header.svelte';
import Page from './components/Page.svelte';
import Text from './components/Text.svelte';

const components: Components = {
  button: Button,
  text: Text,
  header: defineComponent<HeaderProps>({
    component: Header,
    defaults: { text: 'Hello World' },
  }),
};

const templates: Templates = {
  hi: { component: Page, defaults: { title: 'Welcome' } },
  hero: { component: Page, defaults: { title: 'Featured' } },
};

// Maps DesignToken ids to CSS values; returning undefined drops the key. A
// real app might use CSS vars, a Tailwind theme, or a tokens package.
const brandTokens: Record<string, string> = {
  'color.surface.hero': '#4f39f6',
  'color.surface.subtle': '#f4f4f5',
  'color.text.onPrimary': '#ffffff',
};

const resolveToken: ResolveToken = (token) => brandTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
