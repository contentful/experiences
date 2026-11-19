import { ContentfulViewDeliveryClient, createExperiences } from '@contentful/experiences-svelte';
import { bindSvelteKitClientExperiences } from '@contentful/experiences-svelte/kit/client';
import { createLivePreviewClient } from '@contentful/experiences-live-preview';
import { experienceConfig } from '#lib/experience-config.js';
import { attemptLog } from '#lib/attempt-log.svelte.js';
const environment = __REFERENCE_ENVIRONMENT__;
// Binding is browser-safe. The root activates its sole owner after commitment.
export const { request } = bindSvelteKitClientExperiences({
  config: experienceConfig,
  endpoint: '/_exo/prepare',
  spaceId: environment.spaceId || 'unconfigured',
  environmentId: environment.environmentId,
  locale: environment.locale,
  delivery: environment.delivery,
  ...(environment.preview
    ? {
        preview: {
          ...environment.preview,
          createClient: __LIVE_PREVIEW_ENABLED__ ? createLivePreviewClient : undefined,
        },
      }
    : {}),
  onStatesReady: attemptLog.onStatesReady,
});
export const web = createExperiences({
  config: experienceConfig,
  onRedirect({ path }) {
    if (path.startsWith('/') && !path.startsWith('//') && !/[\\\t\r\n]/.test(path))
      window.location.assign(path);
  },
});

// Identity-free event-free diagnostics use the supported supplied-client free-function path.
export const comparisonClient = new ContentfulViewDeliveryClient({
  spaceId: environment.spaceId || 'unconfigured',
  environmentId: environment.environmentId,
  ...(typeof environment.delivery.accessToken === 'string'
    ? { token: environment.delivery.accessToken }
    : { token: '', auth: false, baseUrl: environment.delivery.host }),
});
