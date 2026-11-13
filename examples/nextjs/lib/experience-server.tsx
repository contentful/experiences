import 'server-only';

import { bindAppRouterServerExperiences } from '@contentful/experiences-nextjs/app-router/server';
import { createPageContext, createPrivateFetch } from '@contentful/experiences-nextjs/server';

import {
  ExperiencesRoot as ClientRoot,
  Experience as ClientExperience,
} from '@/lib/experience-client';
import { experienceConfig } from '@/lib/experience-config';
import { parseParameters } from '@/lib/page-options';

const previewToken = process.env.CPA_TOKEN?.trim();

export const binding = bindAppRouterServerExperiences(
  {
    spaceId: process.env.SPACE_ID!,
    environmentId: process.env.ENVIRONMENT_ID ?? 'master',
    locale: 'en-US',
    delivery: { accessToken: process.env.CDA_TOKEN!, fetch: createPrivateFetch() },
    preview: previewToken ? { accessToken: previewToken } : undefined,
    config: experienceConfig,
    // The demo has no server CMP. Only default-allowlisted events (including
    // page) are admitted. Browser consent choices stay browser-owned.
    consent: { server: false },
    request: {
      experience: ({ requestUrl }) => {
        const url = new URL(requestUrl);
        const locale = url.searchParams.get('locale') ?? 'en-US';
        const preview = previewToken && url.searchParams.get('preview_session_id')?.trim();
        if (url.pathname.startsWith('/experiences/')) {
          const experienceId = decodeURIComponent(url.pathname.slice('/experiences/'.length));
          const parameters = url.searchParams.get('parameters');
          return {
            experienceId,
            ...(!preview
              ? {
                  locale,
                  ...(parameters !== null ? { parameters: parseParameters(parameters) } : {}),
                }
              : {}),
          };
        }
        return {
          destinationId: process.env.DESTINATION_ID!,
          path: url.pathname,
          ...(!preview ? { locale } : {}),
        };
      },
      resolveOptions: ({ requestUrl }) => {
        const url = new URL(requestUrl);
        return {
          debug: ['true', '1'].includes(url.searchParams.get('debug') ?? ''),
          metadata: {
            slug: url.pathname.replace(/^\/(?:experiences\/)?/, ''),
            locale: url.searchParams.get('locale') ?? 'en-US',
          },
        };
      },
      metadataKeys: ['slug', 'locale'],
      // Customize the SDK-built page without replacing its standard properties.
      // This toggle changes only the simulated audience input, not page intent.
      pagePayload: ({ requestUrl, headers }) => {
        const url = new URL(requestUrl);
        return {
          locale: url.searchParams.get('locale') ?? 'en-US',
          properties: {
            ...createPageContext({
              path: url.pathname,
              url: requestUrl,
              searchParams: url.searchParams,
              referrer: headers.get('referer') ?? '',
            }),
            title: 'Contentful Experiences — Next.js example',
          },
          ...(['true', '1'].includes(url.searchParams.get('personalization') ?? '')
            ? { location: { city: 'Berlin', countryCode: 'DE', continent: 'EU' } }
            : {}),
        };
      },
    },
  },
  { request: { ExperiencesRoot: ClientRoot, Experience: ClientExperience } }
);

export const { ExperiencesRoot, Experience } = binding.request;
