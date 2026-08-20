import type { PortableRenderPlan } from '@contentful/experiences-angular';

/**
 * Everything the Express layer resolves per request, handed to Angular as the
 * `requestContext` argument of `AngularNodeAppEngine.handle()` and read back
 * through `inject(REQUEST_CONTEXT)`.
 *
 * This is the Angular analogue of SvelteKit's `+page.server.ts` return value.
 * It stays plain JSON so `TransferState` can carry it to the browser — the
 * component classes live in `experienceConfig`, never in the plan.
 */
export interface ExperienceRouteData {
  slug: string;
  experience: PortableRenderPlan | null;
  initialViewportId?: string;
  debug: boolean;
  metadata: Record<string, unknown>;
  /** True when the delivery API had no Experience under `slug`. */
  notFound: boolean;
}

export function isExperienceRouteData(value: unknown): value is ExperienceRouteData {
  return typeof value === 'object' && value !== null && 'experience' in value && 'slug' in value;
}
