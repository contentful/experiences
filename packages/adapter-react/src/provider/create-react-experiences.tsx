'use client';

import type { Config } from '../registry/types.js';
import {
  ClientExperienceRenderer,
  type ClientExperienceRendererProps,
} from '../rendering/client-renderer.js';
import { ExperiencesProvider, ExperiencesRoot } from './experiences-provider.js';

export interface CreateReactExperiencesOptions {
  readonly config: Config;
}
export type BoundExperienceRendererProps = Omit<ClientExperienceRendererProps, 'config'>;

/** Pure registry binding; SDK construction happens only when an owner activates. */
export function createReactExperiences({ config }: CreateReactExperiencesOptions) {
  function ExperienceRenderer(props: BoundExperienceRendererProps) {
    return <ClientExperienceRenderer {...props} config={config} />;
  }
  return { ExperiencesRoot, ExperiencesProvider, ExperienceRenderer };
}
