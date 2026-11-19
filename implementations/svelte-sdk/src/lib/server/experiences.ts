import '$app/server';
import { bindSvelteKitServerExperiences } from '@contentful/experiences-svelte/kit/server';
import { experienceConfig } from '#lib/experience-config.js';
import { consentCookies, isPreviewRequested } from '#lib/reference.js';
import { getServerConfiguration } from '#lib/server/config.js';
let binding: ReturnType<typeof createBinding> | undefined;
function createBinding() {
  const { node, browser } = getServerConfiguration();
  return bindSvelteKitServerExperiences({
    ...node,
    config: experienceConfig,
    endpoint: '/_exo/prepare',
    consent: {
      server(event) {
        const decision = (name: string) => {
          const value = event.cookies.get(name);
          return value === 'granted' ? true : value === 'denied' ? false : undefined;
        };
        return {
          events: decision(consentCookies.events),
          persistence: decision(consentCookies.persistence),
        };
      },
    },
    request: {
      mode(event) {
        return /^\/ssr(\/page-two|\/single-experience)?$/.test(event.url.pathname)
          ? 'ssr'
          : 'hybrid';
      },
      authorizeExperience(_event, selector, context) {
        // Allow only by-ID content and the debug option derived from the route.
        const allowed = ['experienceId', 'extensions', 'personalization'];
        const path = context.url.pathname;
        const validRoute = /^\/(ssr|hybrid)(\/page-two|\/single-experience)?$/.test(path);
        const resolve = context.resolveOptions;
        const resolveKeys = Object.keys(resolve ?? {});
        const validResolve =
          resolve === undefined ||
          (context.url.searchParams.has('debug') &&
            resolve.debug === true &&
            resolveKeys.length === 1 &&
            resolveKeys[0] === 'debug');
        const expectedId = path.endsWith('/page-two')
          ? browser.experienceIds.at(-1)
          : browser.experienceIds[0];
        const preview = isPreviewRequested(context.url.searchParams, browser.previewEnabled);
        return (
          validRoute &&
          selector.experienceId === expectedId &&
          typeof selector.experienceId === 'string' &&
          browser.experienceIds.includes(selector.experienceId) &&
          Object.keys(selector).every((key) => allowed.includes(key)) &&
          validResolve &&
          selector.personalization === undefined &&
          (selector.extensions === undefined ||
            (!preview && JSON.stringify(selector.extensions) === '{"sourceMap":{}}'))
        );
      },
      resolveOptions: (_event, context) => ({ debug: context.url.searchParams.has('debug') }),
      initialEvents: (event, context) =>
        event.url.pathname + event.url.search === context.routeKey &&
        !event.isDataRequest &&
        !event.isSubRequest &&
        context.url.searchParams.get('userId') === 'charles'
          ? [{ type: 'identify', userId: 'charles', traits: { identified: true } }]
          : [],
      onResult(event, result) {
        event.locals.exoDocumentOutcome = {
          routeKey: result.routeKey,
          notFound: result.notFound === true,
        };
      },
    },
  });
}
export function getBinding() {
  return (binding ??= createBinding());
}
