/**
 * The integration layer between Contentful's Experience payload shape and
 * the customer's design system.
 *
 * Design-system components live in `../components/`. Each one styles itself
 * by calling `useDesignValues()` at its top — the single entry point for
 * design. Design is never injected as props; content properties (`text`,
 * `label`, `src`, …) are.
 *
 * - `components` — `componentTypeId` → bare component OR config object.
 *   Keys match the segment after the last slash in `componentType.sys.urn`
 *   (here: `Section`, `Heading`, `RichText`, `Text`, `Button`, `Image`).
 * - `templates`  — `templateId` → bare component OR config object. Keys
 *   match the segment after the last slash in `payload.sys.template.sys.urn`
 *   (here: `page`).
 */

import {
  type Components,
  type Config,
  type ResolveToken,
  type Templates,
} from '@contentful/experiences-react';

import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Image } from '@/components/Image';
import { Page } from '@/components/Page';
import { RichText } from '@/components/RichText';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { designTokens } from '@/lib/design-tokens';

// Keys match the last URN segment of each node's `componentType.sys.urn`.
// Every component reads its own design via `useDesignValues()`, so none of
// these need a config wrapper — bare registration is enough.
const components: Components = {
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
};

const templates: Templates = {
  // The page-level template wrapping all top-level nodes.
  page: Page,
};

/**
 * Design token resolver. XDA emits `{ type: 'DesignToken', value: '<id>' }`
 * envelopes for design props whose value is an ExO Design Token (e.g.
 * `size.xl`, `color.text`, `fontSize.3xl`). The `value` is the token id from
 * the customer's DTCG file — its shape is customer-defined, so the SDK never
 * normalizes it; this resolver owns the mapping to a runtime value.
 *
 * Here we look the id up in a flat in-code table (`lib/design-tokens.ts`).
 * Returning `undefined` signals "not resolvable" — the SDK drops that key
 * from the design record, and `useDesignValues()` simply won't include it.
 *
 * In a real integration you'd swap the table for one of these:
 *
 *   // 1. CSS custom properties — no JS cost, browser handles theme swaps.
 *   resolveToken: (token) => `var(--${token.value.replaceAll('.', '-')})`
 *
 *   // 2. Tailwind — walk the resolved theme by the id path.
 *   resolveToken: (token) =>
 *     token.value.split('.').reduce<any>((o, k) => o?.[k], tw.theme)
 *
 *   // 3. JS literals from a design-system tokens package.
 *   resolveToken: (token) => tokens[token.value as keyof typeof tokens]
 */
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
