import { notFound } from 'next/navigation';
import { ServerExperienceRenderer, resolveExperience } from '@contentful/experiences-react';

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

  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
