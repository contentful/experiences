'use client';

import { bindAppRouterClientExperiences } from '@contentful/experiences-nextjs/app-router/client';
import { createLivePreviewClient } from '@contentful/experiences-live-preview';

import { experienceConfig } from '@/lib/experience-config';

const previewToken = process.env.NEXT_PUBLIC_CPA_TOKEN?.trim();

const binding = bindAppRouterClientExperiences({
  config: experienceConfig,
  spaceId: process.env.NEXT_PUBLIC_SPACE_ID!,
  environmentId: process.env.NEXT_PUBLIC_ENVIRONMENT_ID ?? 'master',
  locale: 'en-US',
  delivery: { accessToken: process.env.NEXT_PUBLIC_CDA_TOKEN! },
  preview: previewToken
    ? { accessToken: previewToken, createClient: createLivePreviewClient }
    : undefined,
});

export const { ExperiencesRoot, Experience } = binding.request;
