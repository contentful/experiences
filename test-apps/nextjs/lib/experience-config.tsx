/**
 * Maps Contentful component / experience-template ids to the app's components, and wires
 * `resolveToken`. Registry keys match the last URN segment of each node's
 * `component` / `experienceTemplate`. Components read design via `useDesignValues()`.
 */

import {
  type Components,
  type Config,
  type ResolveToken,
  type ExperienceTemplates,
} from '@contentful/experiences-react';

import { Button } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Image } from '@/components/Image';
import { Page } from '@/components/Page';
import { RichText } from '@/components/RichText';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { designTokens } from '@/lib/design-tokens';

const components: Components = {
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
};

const experienceTemplates: ExperienceTemplates = {
  page: Page,
};

// Resolves opaque token ids (`size.xl`, `color.text`) to their underlying
// values — the SDK doesn't know what a token id means, only you do. Returning
// undefined drops the key. A real app might use CSS vars or a tokens package,
// e.g. `(token) => `var(--${token.value.replaceAll('.', '-')})``.
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
