/**
 * Maps Contentful component/template ids to the app's components, and wires
 * `resolveToken`. Registry keys match the last URN segment of each node's
 * `componentType` / `template`. Components read design via `useDesignValues()`.
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

const components: Components = {
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
};

const templates: Templates = {
  page: Page,
};

// Maps DesignToken ids (`size.xl`, `color.text`) to CSS values. Returning
// undefined drops the key. A real app might use CSS vars or a tokens package,
// e.g. `(token) => `var(--${token.value.replaceAll('.', '-')})``.
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, templates, resolveToken };
