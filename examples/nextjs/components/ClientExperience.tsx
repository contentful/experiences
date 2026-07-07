'use client';

import type { ReactNode } from 'react';
import { ClientExperienceRenderer, type PortableRenderPlan } from '@contentful/experiences-react';

import { experienceConfig } from '@/lib/experience-config';
import { getOptimizationClient } from '@/lib/optimization-client';

export interface ClientExperienceProps {
  experience: PortableRenderPlan;
}

/**
 * Client boundary for the personalization pipeline. The optimization SDK is
 * browser-only, so we can't construct it on the server — this component owns
 * that lifetime and hands the singleton to `ClientExperienceRenderer` via the
 * `optimization` prop. The renderer publishes `OptimizationProvider` to the
 * subtree and, after hydration, calls `attachInteractionRuntime({ views,
 * clicks, hovers })` — from that point on, personalized nodes emit
 * `exo_node_view` / `click` / `hover` events as the user interacts with them.
 */
export function ClientExperience({ experience }: ClientExperienceProps): ReactNode {
  const optimization = getOptimizationClient();

  return (
    <ClientExperienceRenderer
      experience={experience}
      config={experienceConfig}
      optimization={{ enabled: true, client: optimization }}
    />
  );
}
