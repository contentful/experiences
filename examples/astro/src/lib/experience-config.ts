/**
 * The SDK `Config`: maps component / experience-template ids to React
 * components and resolves design tokens. Registry keys match the last URN
 * segment of each node's `component` / `experienceTemplate`.
 */
import type { Config } from '@contentful/experiences-react';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Heading } from '../components/Heading';
import { HeroPlain } from '../components/HeroPlain';
import { Image } from '../components/Image';
import { Page } from '../components/Page';
import { RichText } from '../components/RichText';
import { Section } from '../components/Section';
import { Text } from '../components/Text';
import { designTokens } from './design-tokens';

export const experienceConfig: Config = {
  components: {
    Section,
    Heading,
    RichText,
    Text,
    Button,
    Image,
    'hero-plain': HeroPlain,
    card: Card,
  },
  experienceTemplates: { page: Page },
  resolveToken: (token) => designTokens[token.value],
};
