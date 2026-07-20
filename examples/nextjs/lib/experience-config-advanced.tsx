/**
 * Advanced config: async `resolveData` on `card` (fake enrichment fetch +
 * a metadata-aware CTA rewrite), plus preview-mode + design-token wiring
 * — layered on top of the simple `./experience-config`.
 *
 * Compared to `./experience-config`, the differences are:
 *   1. `card` is registered with `defineComponent({ resolveData, component })`
 *      so we can demonstrate async enrichment (a stand-in for "fetch a badge
 *      from a catalog service") and use per-page metadata (locale, slug) to
 *      rewrite the CTA URL.
 *   2. Everything else — primitives + hero-plain — is identical to the
 *      simple config.
 */

import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
  type Templates,
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
// service call, or anything else you'd want to do off the critical render path.
// Resolvers run in parallel across nodes, so slow ones don't block others.
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
      // Rewrite the CTA to a locale-aware localized route (fake — for demo).
      const originalUrl = (content.ctaUrl as string) ?? '';
      const ctaUrl = originalUrl.startsWith('http')
        ? originalUrl
        : `/${locale}/${slug}${originalUrl}`;
      return {
        title: `${badge}`,
        ctaUrl,
      };
    },
    component: Card,
  }),
};

const templates: Templates = {
  page: { component: Page, defaults: { title: 'Featured (advanced)' } },
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const advancedExperienceConfig: Config = { components, templates, resolveToken };
