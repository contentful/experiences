import { notFound } from 'next/navigation';
import { resolveExperience } from '@contentful/experiences-react';

import { ClientExperience } from '@/components/ClientExperience';
import { fetchExperience } from '@/lib/delivery-client';
import { experienceConfig } from '@/lib/experience-config';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ExperiencePage({ params }: PageProps) {
  const { slug: experienceId } = await params;

  // Server-side fetch via `getExperienceWithOverrides` returns the plan
  // *and* an `extensions.sourceMap` that describes how each node was picked.
  // Threading the sourceMap through `resolveExperience` puts it on the plan
  // so per-node instrumentation can light up after hydration.
  const { payload, sourceMap } = await fetchExperience(experienceId);
  if (!payload.nodes.length) notFound();

  const experience = await resolveExperience(payload, experienceConfig, { sourceMap });

  return <ClientExperience experience={experience} />;
}
