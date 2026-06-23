/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * The design-system components in `../components/` stay free of any
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

import type { ReactNode } from 'react';

import {
  defineComponent,
  defineTemplate,
  type Components,
  type Config,
  type Templates,
} from '@contentful/experiences-react';

import { Button, type ButtonProps } from '@/components/Button';
import { Header, type HeaderProps } from '@/components/Header';
import { Page, type PageProps } from '@/components/Page';
import { Text, type TextProps } from '@/components/Text';

const components: Components = {
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: ({ content }) => ({
      text: content.text as string,
      children: content.testSlot as ReactNode,
    }),
    render: (props) => <Button {...props} />,
  }),

  header: defineComponent<HeaderProps>({
    defaults: { variant: 'h2', text: 'Hello World' },
    render: Header,
  }),

  text: defineComponent<TextProps>({
    render: Text,
  }),
};

const templates: Templates = {
  hi: defineTemplate<PageProps>({
    defaults: { title: 'Welcome' },
    render: Page,
  }),
  hero: defineTemplate<PageProps>({
    defaults: { title: 'Featured' },
    render: Page,
  }),
};

export const experienceConfig: Config = {
  components,
  templates,
};
