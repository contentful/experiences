import type { Comparison } from '#lib/reference.js';
import type { LoadEvent } from '@sveltejs/kit';
import { request } from '#lib/experiences.js';
import { isPreviewRequested, readRoute } from '#lib/reference.js';
export async function loadReference(
  event: Pick<LoadEvent, 'url' | 'fetch' | 'depends'> & {
    data?: { comparisons?: Comparison[]; configurationError?: string };
  }
) {
  const reference = readRoute(event.url);
  const configurationError = __REFERENCE_ENVIRONMENT__.configurationError;
  if (configurationError || reference.mode === 'csr')
    return { reference, configurationError, comparisons: event.data?.comparisons ?? [] };
  const preview = isPreviewRequested(
    event.url.searchParams,
    __REFERENCE_ENVIRONMENT__.previewEnabled
  );
  const primarySource = await request.loadExperience(event, {
    experience: {
      experienceId: reference.ids[0],
      ...(preview ? {} : { extensions: { sourceMap: {} } }),
    },
    ...(reference.debug ? { resolveOptions: { debug: true } } : {}),
  });
  return {
    reference,
    primarySource,
    comparisons: event.data?.comparisons ?? [],
    configurationError: event.data?.configurationError,
  };
}
