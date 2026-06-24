/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * The design-system components in `./components/` stay free of any
 * `@contentful/*` imports — they remain portable and don't know they're
 * being driven by Contentful. This file is where SDK-shaped concerns
 * (defaults, async resolvers, slot binding, prop reshaping) live.
 *
 * - `components` — `componentTypeId` → `defineComponent(...)`. Keys match
 *   the segment after the last slash in `componentType.sys.urn`.
 * - `templates`  — `templateId` → `defineTemplate(...)`. Keys match the
 *   segment after the last slash in `payload.sys.template.sys.urn`.
 * - `experienceConfig` — the composed `Config` object handed to
 *   `resolveExperience` and `<ServerExperienceRenderer>`.
 */

import {
  defineComponent,
  defineTemplate,
  type Components,
  type Config,
  type Templates,
} from '@contentful/experiences-svelte';

import Button, { type ButtonProps } from './components/Button.svelte';
import Header, { type HeaderProps } from './components/Header.svelte';
import Page, { type PageProps } from './components/Page.svelte';
import Text, { type TextProps } from './components/Text.svelte';

const components: Components = {
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: ({ content }) => ({
      text: content.text as string,
    }),
    component: Button,
  }),

  header: defineComponent<HeaderProps>({
    defaults: { variant: 'h2', text: 'Hello World' },
    component: Header,
  }),

  text: defineComponent<TextProps>({
    component: Text,
  }),
};

const templates: Templates = {
  hi: defineTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    component: Page,
  }),
  hero: defineTemplate<PageProps>({
    defaults: { title: 'Featured' },
    component: Page,
  }),
};

export const experienceConfig: Config = {
  components,
  templates,
};
