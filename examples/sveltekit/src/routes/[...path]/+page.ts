import { demoSelection, request } from '$lib/load-experience.js';
import type { PageLoad } from './$types.js';

// Visitor-specific captured transfers must never be prerendered or publicly cached.
export const prerender = false;
export const load: PageLoad = async (event) => ({
  primarySource: await request.loadExperience(event, { experience: demoSelection(event.url) }),
});
