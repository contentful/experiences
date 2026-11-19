import { env } from '$env/dynamic/public';
import { request } from './experiences.js';

export function demoSelection(url: URL, experienceId?: string) {
  const personalized = ['true', '1'].includes(url.searchParams.get('personalization') ?? '');
  const preview =
    env.PUBLIC_LIVE_PREVIEW_ENABLED === 'true' &&
    env.PUBLIC_CPA_TOKEN?.trim() &&
    url.searchParams.get('preview_session_id')?.trim();
  return {
    ...(experienceId
      ? { experienceId, ...(!preview ? { extensions: { sourceMap: {} } } : {}) }
      : { destinationId: env.PUBLIC_DESTINATION_ID ?? '', path: url.pathname }),
    ...(preview ? {} : { locale: url.searchParams.get('locale') ?? 'en-US' }),
    // An explicit empty list suppresses automatic managed page intent.
    ...(!personalized ? { personalization: { events: [] } } : {}),
  };
}

export { request };
