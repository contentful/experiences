import '$app/server';
import { building } from '$app/env';
import { createSvelteKitServerBinding } from './server-binding.js';
import type { ServerBindingOptions } from './server-types.js';

export { serializePlan } from './request-projection.js';
export type { ServerBindingOptions, SvelteKitServerExperiencesOptions } from './server-types.js';
export type { RequestResult } from './request-result.js';

/** Bind once in a server-only module; native Kit fetch retains ownership of transport. */
export function bindSvelteKitServerExperiences(options: ServerBindingOptions) {
  return createSvelteKitServerBinding(options, { building });
}
