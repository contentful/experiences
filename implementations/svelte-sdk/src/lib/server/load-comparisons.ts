import '$app/server';
import { building } from '$app/env';
import { ContentfulExperiences } from '@contentful/experiences-node';
import { serializePlan } from '@contentful/experiences-svelte/kit/server';
import { experienceConfig } from '#lib/experience-config.js';
import { isPreviewRequested, readRoute, type Comparison } from '#lib/reference.js';
import { getServerConfiguration } from '#lib/server/config.js';
export async function loadComparisons(url: URL) {
  if (building || __REFERENCE_ENVIRONMENT__.configurationError) return { comparisons: [] };
  let configuration;
  try {
    configuration = getServerConfiguration();
  } catch {
    return {
      comparisons: [],
      configurationError: 'Configure server CDA_TOKEN and deployment-gated Preview credentials.',
    };
  }
  const { browser, node } = configuration;
  // A Preview reference shows only its selected primary; comparisons are ordinary Delivery diagnostics.
  if (isPreviewRequested(url.searchParams, browser.previewEnabled)) return { comparisons: [] };
  const route = readRoute(url);
  const ids =
    route.title === 'Single Experience'
      ? []
      : [...new Set([...route.ids.slice(1), browser.experienceIds[0]])].filter(
          (id) => id !== route.ids[0]
        );
  const sdk = new ContentfulExperiences(node);
  const request = sdk.forRequest({
    consent: { events: false, persistence: false },
    preflight: true,
  });
  const comparisons: Comparison[] = [];
  try {
    for (const experienceId of ids) {
      try {
        const value = await request.fetchExperience(
          { experienceId, extensions: { sourceMap: {} } },
          { config: experienceConfig, debug: route.debug }
        );
        if ('redirect' in value) {
          comparisons.push({ experienceId, error: 'Comparison redirected.' });
          continue;
        }
        comparisons.push({
          experienceId,
          plan: serializePlan(value),
          ...(value.diagnostics.length || value.deliveryDiagnostics?.length
            ? { warning: 'Some comparison content could not be resolved.' }
            : {}),
        });
      } catch {
        comparisons.push({ experienceId, error: 'Comparison content unavailable.' });
      }
    }
  } finally {
    request.destroy();
  }
  return { comparisons };
}
