/**
 * Maps Contentful component/template ids to the app's Svelte components,
 * and wires `resolveToken`. Registry keys match the last URN segment of
 * each node's `componentType` / `template`. Components read design via
 * `getDesignValues()`.
 *
 * 1:1 parity with examples/nextjs/lib/experience-config.tsx — same 8
 * ComponentType registrations, same 1 template, same design-token table.
 */

import type { Components, Config, ResolveToken, Templates } from '@contentful/experiences-svelte';

import Button from './components/Button.svelte';
import Card from './components/Card.svelte';
import Heading from './components/Heading.svelte';
import HeroPlain from './components/HeroPlain.svelte';
import Image from './components/Image.svelte';
import Page from './components/Page.svelte';
import RichText from './components/RichText.svelte';
import Section from './components/Section.svelte';
import Text from './components/Text.svelte';
import { designTokens } from './design-tokens.js';

const components: Components = {
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
  'hero-plain': HeroPlain,
  card: Card,
};

const templates: Templates = {
  page: Page,
};

// Resolves opaque token ids (`size.xl`, `color.text`) to their underlying
// values — the SDK doesn't know what a token id means, only you do. Returning
// undefined drops the key.
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
