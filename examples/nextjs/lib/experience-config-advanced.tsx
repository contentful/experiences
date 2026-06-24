/**
 * Advanced integration config — shows the configuration knobs you reach for
 * when the simple config (`./experience-config.tsx`) isn't enough.
 *
 * Differences from the simple config:
 *  - **Async `resolveData`** on `button` — a deliberately slow fake fetch,
 *    plus a synthetic localized URL derived from `experience.metadata.locale`.
 *    Demonstrates that resolvers run **in parallel across nodes** before
 *    rendering, and that they have access to `experience.metadata` (which the
 *    advanced page passes in via `resolveExperience`'s third argument).
 *  - **Reads `experience.metadata`** to build a per-page label — proves the
 *    metadata is threaded through every resolver.
 *
 * Templates and the rest of the components are identical to the simple
 * config. Only the `button` is enriched.
 */

import {
  defineComponent,
  defineTemplate,
  type Components,
  type Config,
  type Templates,
} from '@contentful/experiences-react';

import { Button, type ButtonProps } from '@/components/Button';
import { Header, type HeaderProps } from '@/components/Header';
import { Page, type PageProps } from '@/components/Page';
import { Text, type TextProps } from '@/components/Text';

// Pretend this fetches enrichment from a catalog or pricing API. The point
// is just that it's async and takes non-trivial time — the SDK fans these
// out across all nodes in parallel via Promise.all when resolveExperience is called.
async function fetchButtonEnrichment(text: string): Promise<{ formattedText: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { formattedText: text.toUpperCase() };
}

const components: Components = {
  button: defineComponent<ButtonProps>({
    defaults: { type: 'primary' },
    resolveData: async ({ content, experience }) => {
      const rawText = (content.text as string) ?? 'Button';
      const { formattedText } = await fetchButtonEnrichment(rawText);

      // experience.metadata is passed in by the page via
      // resolveExperience(payload, config, { experience: { metadata: {...} } })
      const locale = (experience.metadata.locale as string) ?? 'en-US';
      const slug = (experience.metadata.slug as string) ?? '';

      return {
        text: formattedText,
        url: `/${locale}/${slug}`,
      };
    },
    render: Button,
  }),

  header: defineComponent<HeaderProps>({
    defaults: { variant: 'h2', text: 'Hello World' },
    render: Header,
  }),

  text: defineComponent<TextProps>({
    render: Text,
  }),
};

const templates: Templates = {
  hi: defineTemplate<PageProps>({
    defaults: { title: 'Welcome (advanced)' },
    render: Page,
  }),
  hero: defineTemplate<PageProps>({
    defaults: { title: 'Featured (advanced)' },
    render: Page,
  }),
};

export const advancedExperienceConfig: Config = {
  components,
  templates,
};
