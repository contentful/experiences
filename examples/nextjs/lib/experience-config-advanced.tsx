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

import { defineComponent, type Components, type Config, type Templates } from '@contentful/experiences-react';

import { Button, type ButtonProps } from '@/components/Button';
import { Header } from '@/components/Header';
import { Page } from '@/components/Page';
import { Text } from '@/components/Text';

// Pretend this fetches enrichment from a catalog or pricing API. The point is
// just that it's async and takes non-trivial time — the SDK fans these out
// across all nodes in parallel via Promise.all in resolveExperience.
async function fetchButtonEnrichment(text: string): Promise<{ formattedText: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { formattedText: text.toUpperCase() };
}

const components: Components = {
  // defineComponent narrows the resolveData ctx + return type to ButtonProps.
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: async ({ content, experience }) => {
      const rawText = (content.text as string) ?? 'Button';
      const { formattedText } = await fetchButtonEnrichment(rawText);
      const locale = (experience.metadata.locale as string) ?? 'en-US';
      const slug = (experience.metadata.slug as string) ?? '';
      return {
        text: formattedText,
        url: `/${locale}/${slug}`,
      };
    },
    component: Button,
  }),

  header: { component: Header, defaults: { variant: 'h2', text: 'Hello World' } },
  text: Text,
};

const templates: Templates = {
  hi: { component: Page, defaults: { title: 'Welcome (advanced)' } },
  hero: { component: Page, defaults: { title: 'Featured (advanced)' } },
};

export const advancedExperienceConfig: Config = { components, templates };
