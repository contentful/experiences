import { notFound } from 'next/navigation';
import {
  ExperienceRenderer,
  resolveExperience,
} from '@contentful/experiences-react';

import { fetchExperience } from '@/lib/delivery-client';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ExperiencePage({ params }: PageProps) {
  const { slug: experienceId } = await params;

  const { payload } = await fetchExperience(experienceId);
  if (!payload.nodes.length) notFound();

  const experience = await resolveExperience(payload, experienceConfig);

  return (
    <ExperienceRenderer
      experience={experience}
      config={experienceConfig}
      enablePreview
    />
  );
}
