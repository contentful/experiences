/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * Design-system components live in `../components/` and stay free of any
 * `@contentful/*` imports. A component that needs the Experience runtime
 * context or the raw Contentful payload calls `useExperience()` /
 * `useContentfulComponent()` at its top.
 *
 * - `components` — `componentTypeId` → bare component OR config object.
 *   Keys match the segment after the last slash in `componentType.sys.urn`.
 * - `templates`  — `templateId` → bare component OR config object. Keys
 *   match the segment after the last slash in `payload.sys.template.sys.urn`.
 */

import { type Components, type Config, type Templates } from '@contentful/experiences-react';

import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';

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
