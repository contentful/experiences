import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ServerExperienceRenderer } from '@contentful/experiences-react';

import { fetchExperiencePage } from '@/lib/delivery-client';
import { detectViewportFromUserAgent } from '@/lib/detect-viewport';
import { advancedExperienceConfig } from '@/lib/experience-config-advanced';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Advanced version of the [slug] route. Demonstrates three SDK features the
 * minimal three-line page in `app/[slug]/page.tsx` doesn't reach for:
 *
 *  1. **Preview mode + per-page metadata** via the `context` arg of
 *     `fetchExperiencePage`. `?preview=true` flips `MissingComponent` from
 *     "silent null" to "visible red box"; metadata flows into every
 *     `resolveData` hook.
 *  2. **User-Agent → viewport seeding** via `initialViewportId` so SSR
 *     renders at the device's expected viewport (avoids hydration drift on
 *     the client renderer's first paint).
 *  3. **Async `resolveData` with external fetch** — the advanced config
 *     `lib/experience-config-advanced.tsx` does a fake catalog fetch on the
 *     `button` component and uppercases the editorial text. The SDK runs
 *     resolvers in parallel across nodes, so the slow resolver doesn't
 *     block the others.
 */
export default async function AdvancedExperiencePage({ params, searchParams }: PageProps) {
  const { slug: experienceId } = await params;
  const sp = (await searchParams) ?? {};

  const previewMode = sp.preview === 'true' || sp.preview === '1';
  const locale = typeof sp.locale === 'string' ? sp.locale : 'en-US';

  const userAgent = (await headers()).get('user-agent') ?? '';
  const initialViewportId = detectViewportFromUserAgent(userAgent);

  const experience = await fetchExperiencePage(experienceId, advancedExperienceConfig, {
    preview: previewMode,
    locale,
    context: {
      isPreview: previewMode,
      metadata: { slug: experienceId, locale },
    },
  });
  if (!experience) notFound();

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={advancedExperienceConfig}
      initialViewportId={initialViewportId}
      context={{ isPreview: previewMode, metadata: { slug: experienceId, locale } }}
    />
  );
}
