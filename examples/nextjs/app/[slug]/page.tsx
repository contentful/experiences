import { notFound } from 'next/navigation';
import { ServerExperienceRenderer, resolveExperience } from '@contentful/experiences-react';

import { fetchExperience } from '@/lib/delivery-client';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExperiencePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const previewMode = sp.preview === 'true' || sp.preview === '1';

  const { payload } = await fetchExperience(slug, { preview: previewMode });
  if (!payload.nodes.length) notFound();

  const experience = await resolveExperience(payload, experienceConfig, {
    experience: { isPreview: previewMode, metadata: { slug } },
  });

  return (
    <ServerExperienceRenderer
      experience={experience}
      config={experienceConfig}
      context={{ isPreview: previewMode, metadata: { slug } }}
    />
  )
}
