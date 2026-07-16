/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * Design-system components in `./components/` stay free of any
 * `@contentful/*` imports. A component that needs the Experience runtime
 * context or the raw Contentful payload calls `getExperience()` /
 * `getContentfulComponent()` at the top of its `<script>` block.
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
  // Bare-component form — for the common case with no defaults / resolveData.
  button: Button,
  text: Text,

  // The Header stays vanilla (no `@contentful/*` imports beyond the design
  // helper, no `cf*`-prefixed props). Design never arrives as props — the
  // component reads it itself via `getDesignValues()` and turns the CSS-
  // shaped keys into a style string with `toCss`. `defaults` only seeds
  // editorial content the payload doesn't always supply.
  header: defineComponent<HeaderProps>({
    component: Header,
    defaults: { text: 'Hello World' },
  }),
};

const templates: Templates = {
  hi: { component: Page, defaults: { title: 'Welcome' } },
  hero: { component: Page, defaults: { title: 'Featured' } },
};

/**
 * Design token resolver. XDA emits `{ type: 'DesignToken', value: '<id>' }`
 * envelopes for design props whose value is an ExO Design Token. The `value`
 * is the token id from the customer's DTCG file — its shape is customer-
 * defined (dotted, slashed, flat, uuid), so the SDK never normalizes it.
 *
 * Three common patterns customers wire here (pick the one that matches how
 * their design system stores values):
 *
 *   // 1. CSS custom properties — no JS cost, and the browser handles theme swaps.
 *   resolveToken: (token) => `var(--${token.value.replaceAll('/', '-')})`
 *
 *   // 2. Tailwind — walk the resolved theme by the id path.
 *   import twConfig from '../tailwind.config.js';
 *   import resolveConfig from 'tailwindcss/resolveConfig';
 *   const tw = resolveConfig(twConfig);
 *   resolveToken: (token) =>
 *     token.value.split('/').reduce<any>((o, k) => o?.[k], tw.theme)
 *
 *   // 3. JS literals from a design-system tokens package (e.g. Porsche).
 *   import * as porscheTokens from '@porsche-design-system/tokens';
 *   resolveToken: (token) => porscheTokens[token.value as keyof typeof porscheTokens]
 *
 * The example below uses a small in-code map so we can demo it against any
 * payload — swap it for one of the patterns above in a real integration.
 */
const brandTokens: Record<string, string> = {
  'color.surface.hero': '#4f39f6',
  'color.surface.subtle': '#f4f4f5',
  'color.text.onPrimary': '#ffffff',
};

const resolveToken: ResolveToken = (token) => brandTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
