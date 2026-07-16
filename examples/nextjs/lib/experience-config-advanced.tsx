/**
 * Advanced integration config — shows the knobs you reach for when the
 * simple config (`./experience-config.tsx`) isn't enough:
 *
 *  - **Async `resolveData`** on `button` — a deliberately slow fake fetch,
 *    plus a synthetic localized URL derived from `experience.metadata.locale`.
 *    Resolvers run in parallel across nodes before rendering, and they
 *    receive `experience.metadata` (which the advanced page passes in via
 *    `resolveExperience`'s third argument).
 *  - **Reads `experience.metadata`** to build a per-page URL, proving that
 *    metadata is threaded through every resolver.
 */

import {
  defineComponent,
  type Components,
  type Config,
  type Templates,
} from '@contentful/experiences-react';

import { Button, type ButtonProps } from '@/components/Button';
import { Heading } from '@/components/Heading';
import { Image } from '@/components/Image';
import { Page } from '@/components/Page';
import { RichText } from '@/components/RichText';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';

// Pretend this fetches enrichment from a catalog or pricing API. The point is
// just that it's async and takes non-trivial time — the SDK fans these out
// across all nodes in parallel via Promise.all in resolveExperience.
async function fetchButtonEnrichment(label: string): Promise<{ formattedLabel: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { formattedLabel: label.toUpperCase() };
}

const components: Components = {
  Section,
  Heading,
  RichText,
  Image,
  Text,

  // defineComponent narrows the resolveData ctx + return type to ButtonProps.
  Button: defineComponent<ButtonProps>({
    resolveData: async ({ content, experience }) => {
      const rawLabel = (content.label as string) ?? 'Button';
      const { formattedLabel } = await fetchButtonEnrichment(rawLabel);
      const locale = (experience.metadata.locale as string) ?? 'en-US';
      const slug = (experience.metadata.slug as string) ?? '';
      return {
        label: formattedLabel,
        url: `/${locale}/${slug}`,
      };
    },
    component: Button,
  }),
};

const templates: Templates = {
  page: { component: Page, defaults: { title: 'Featured (advanced)' } },
};

export const advancedExperienceConfig: Config = { components, templates };
