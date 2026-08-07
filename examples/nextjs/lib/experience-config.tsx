/**
 * Maps Contentful component / experience-template ids to the app's components, and wires
 * `resolveToken`. Registry keys match the last URN segment of each node's
 * `component` / `experienceTemplate`. Components read design via `useDesignValues()`.
 *
 * `card` is registered via `defineComponent({ resolveData, component })` to
 * demonstrate async enrichment (a stand-in for a catalog fetch) plus
 * metadata-aware URL rewriting. `resolveData` hooks run in parallel across
 * nodes, so slow resolvers don't block their peers.
 */

import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type ExperienceTemplates,
} from '@contentful/experiences-react';

import { Button } from '@/components/Button';
import { Card, type CardProps } from '@/components/Card';
import { Heading } from '@/components/Heading';
import { HeroPlain } from '@/components/HeroPlain';
import { Image } from '@/components/Image';
import { Page } from '@/components/Page';
import { RichText } from '@/components/RichText';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { designTokens } from '@/lib/design-tokens';

// Stand-in for an async enrichment fetch — a catalog lookup, a personalization
// service call, or anything else you'd want off the critical render path.
async function fetchCardEnrichment(title: string): Promise<{ badge: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { badge: `Featured: ${title}` };
}

const components: Components = {
  Section,
  Heading,
  RichText,
  Text,
  Button,
  Image,
  'hero-plain': HeroPlain,

  // defineComponent narrows the resolveData ctx + return type to CardProps.
  card: defineComponent<CardProps>({
    resolveData: async ({ content, experience }) => {
      const rawTitle = (content.title as string) ?? 'Untitled';
      const { badge } = await fetchCardEnrichment(rawTitle);
      const locale = (experience.metadata.locale as string) ?? 'en-US';
      const slug = (experience.metadata.slug as string) ?? '';
      // Rewrite relative CTAs to a locale-aware localized route (fake — for demo).
      const originalUrl = (content.ctaUrl as string) ?? '';
      const ctaUrl = originalUrl.startsWith('http')
        ? originalUrl
        : `/${locale}/${slug}${originalUrl}`;
      return {
        title: badge,
        ctaUrl,
      };
    },
    component: Card,
  }),
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
