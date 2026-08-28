/**
 * Maps Contentful component / experience-template ids to the app's components, and wires
 * `resolveToken`. Components style themselves from their auto-filled design
 * props; `Header` is the deliberate exception, kept on `getDesignValues()` so
 * this app exercises that path against a real space.
 */

import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type ExperienceTemplates,
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

const experienceTemplates: ExperienceTemplates = {
  hi: { component: Page, defaults: { title: 'Welcome' } },
  hero: { component: Page, defaults: { title: 'Featured' } },
};

// Resolves opaque token ids to their underlying values — only you know what a
// token id means. Returning undefined drops the key. A real app might use CSS
// vars, a Tailwind theme, or a tokens package.
const brandTokens: Record<string, string> = {
  'color.surface.hero': '#4f39f6',
  'color.surface.subtle': '#f4f4f5',
  'color.text.onPrimary': '#ffffff',
};

const resolveToken: ResolveToken = (token) => brandTokens[token.value];

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
