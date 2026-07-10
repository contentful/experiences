import { notFound } from 'next/navigation';
import { ServerExperienceRenderer } from '@contentful/experiences-react';

import { fetchExperiencePage } from '@/lib/delivery-client';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ExperiencePage({ params }: PageProps) {
  const { slug: experienceId } = await params;

  const experience = await fetchExperiencePage(experienceId, experienceConfig);
  if (!experience) notFound();

  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
