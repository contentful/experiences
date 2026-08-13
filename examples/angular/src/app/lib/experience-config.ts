/**
 * Maps Contentful component / experience-template ids to the app's Angular
 * components, and wires `resolveToken`. Registry keys match the last URN segment
 * of each node's `component` / `experienceTemplate`. Components read design via
 * `injectDesignValues()`.
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
  type ExperienceTemplates,
  type ResolveToken,
} from '@contentful/experiences-angular';

import { ButtonComponent } from '../components/button.component.js';
import { CardComponent, type CardProps } from '../components/card.component.js';
import { HeadingComponent } from '../components/heading.component.js';
import { HeroPlainComponent } from '../components/hero-plain.component.js';
import { ImageComponent } from '../components/image.component.js';
import { PageComponent } from '../components/page.component.js';
import { RichTextComponent } from '../components/rich-text.component.js';
import { SectionComponent } from '../components/section.component.js';
import { TextComponent } from '../components/text.component.js';
import { designTokens } from './design-tokens.js';

// Stand-in for an async enrichment fetch — a catalog lookup, a personalization
// service call, or anything else you'd want off the critical render path.
async function fetchCardEnrichment(title: string): Promise<{ badge: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { badge: `Featured: ${title}` };
}

const components: Components = {
  Section: SectionComponent,
  Heading: HeadingComponent,
  RichText: RichTextComponent,
  Text: TextComponent,
  Button: ButtonComponent,
  Image: ImageComponent,
  'hero-plain': HeroPlainComponent,

  // defineComponent narrows the resolveData ctx + return type to CardProps.
  card: defineComponent<CardProps>({
    resolveData: async ({ content, experience }) => {
      const rawTitle = (content['title'] as string) ?? 'Untitled';
      const { badge } = await fetchCardEnrichment(rawTitle);
      const locale = (experience.metadata['locale'] as string) ?? 'en-US';
      const slug = (experience.metadata['slug'] as string) ?? '';
      // Rewrite relative CTAs to a locale-aware localized route (fake — for demo).
      const originalUrl = (content['ctaUrl'] as string) ?? '';
      const ctaUrl = originalUrl.startsWith('http')
        ? originalUrl
        : `/${locale}/${slug}${originalUrl}`;
      return {
        title: badge,
        ctaUrl,
      };
    },
    component: CardComponent,
  }),
};

const experienceTemplates: ExperienceTemplates = {
  page: PageComponent,
};

// Resolves opaque token ids (`size.xl`, `color.text`) to their underlying
// values — the SDK doesn't know what a token id means, only you do. Returning
// undefined drops the key.
const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, experienceTemplates, resolveToken };
