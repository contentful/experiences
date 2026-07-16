/**
 * Advanced config: async `resolveData` on `Button` (fake fetch + a localized
 * URL from `experience.metadata`), on top of the simple `./experience-config`.
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

// Stand-in for an async enrichment fetch; resolvers run in parallel per node.
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
