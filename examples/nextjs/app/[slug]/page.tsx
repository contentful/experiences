import { notFound } from 'next/navigation';
import {
  NotFoundError,
  ServerExperienceRenderer,
  fetchExperience,
} from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ExperiencePage({ params }: PageProps) {
  const { slug: experienceId } = await params;

  try {
    const experience = await fetchExperience(
      {
        spaceId: process.env.SPACE_ID ?? '',
        environmentId: process.env.ENVIRONMENT_ID ?? 'master',
        experienceId,
      },
      { accessToken: process.env.CDA_TOKEN! },
      { config: experienceConfig }
    );

    return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
