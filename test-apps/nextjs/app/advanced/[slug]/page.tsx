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
 *  1. **Debug mode + per-page metadata** via the top-level `metadata` and
 *     `debug` args of `fetchExperience`. `?debug=true` flips
 *     `MissingComponent` from "silent null" to "visible red box", turns on
 *     verbose SDK logging, and auto-mounts `<DebugExperience>`; metadata flows
 *     into every `resolveData` hook. Preview host-switching stays independent
 *     via `?preview=true`.
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
  const debug = sp.debug === 'true' || sp.debug === '1';
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
        accessToken: process.env.CDA_TOKEN!,
        previewToken: process.env.PREVIEW_TOKEN,
        preview: previewMode,
      },
      {
        config: advancedExperienceConfig,
        metadata: { slug: experienceId, locale },
        debug,
        // Pre-resolve design against the UA-detected viewport so SSR paints
        // correct design values on first paint (same seed the renderer uses).
        // `resolveToken` is read from `config` — no need to re-supply it here.
        initialViewportId,
      }
    );

    return (
      <ServerExperienceRenderer
        experience={experience}
        config={advancedExperienceConfig}
        initialViewportId={initialViewportId}
        metadata={{ slug: experienceId, locale }}
        debug={debug}
      />
    );
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
