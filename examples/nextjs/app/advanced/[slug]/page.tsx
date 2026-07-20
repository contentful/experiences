import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  NotFoundError,
  ServerExperienceRenderer,
  fetchExperience,
} from '@contentful/experiences-react';

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
 *     `fetchExperience`. `?preview=true` flips `MissingComponent` from
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

  try {
    const experience = await fetchExperience(
      {
        spaceId: process.env.SPACE_ID ?? '',
        environmentId: process.env.ENVIRONMENT_ID ?? 'master',
        experienceId,
        locale,
      },
      {
        // Preview mode reads from the CPA endpoint, which needs a Content
        // Preview token — the CDA token is rejected by that host. If preview
        // mode is on but CPA_TOKEN is unset, we still call preview but the
        // request will 401; document this in .env.example.
        accessToken:
          previewMode && process.env.CPA_TOKEN
            ? process.env.CPA_TOKEN
            : process.env.CDA_TOKEN!,
        host: previewMode ? 'https://preview.xdn.contentful.com' : 'https://xdn.contentful.com',
      },
      {
        config: advancedExperienceConfig,
        context: {
          isPreview: previewMode,
          metadata: { slug: experienceId, locale },
        },
      }
    );

    return (
      <ServerExperienceRenderer
        experience={experience}
        config={advancedExperienceConfig}
        initialViewportId={initialViewportId}
        context={{ isPreview: previewMode, metadata: { slug: experienceId, locale } }}
      />
    );
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
