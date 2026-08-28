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
  /**
   * The resolved plan. It carries its own `metadata`, `debug`, and pre-resolved
   * viewport, so none of those are relayed separately — the renderer reads them
   * off the plan.
   */
  experience: PortableRenderPlan | null;
  /** Only set when there is no plan to read it from. */
  debug?: boolean;
  /** True when the delivery API had no Experience under `slug`. */
  notFound: boolean;
}

export function isExperienceRouteData(value: unknown): value is ExperienceRouteData {
  return typeof value === 'object' && value !== null && 'experience' in value && 'slug' in value;
}
