import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { bindSvelteKitServerExperiences } from '@contentful/experiences-svelte/kit/server';
import { experienceConfig } from '../experience-config.js';
import { buildPagePayload } from './personalization.js';

export function isLocalRedirectPath(target: unknown): target is string {
  return (
    typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.includes('\\') &&
    [...target].every(
      (character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127
    )
  );
}

export const { request } = bindSvelteKitServerExperiences({
  config: experienceConfig,
  endpoint: '/_exo/primary',
  spaceId: env.SPACE_ID ?? '',
  environmentId: env.ENVIRONMENT_ID || 'master',
  delivery: { accessToken: env.CDA_TOKEN ?? '' },
  preview:
    env.LIVE_PREVIEW_ENABLED === 'true' && env.CPA_TOKEN?.trim()
      ? { accessToken: env.CPA_TOKEN }
      : undefined,
  cookie: { path: '/', sameSite: 'lax', secure: !dev },
  consent: {
    server: (event) => ({
      events: event.cookies.get('site-events-consent') === 'accepted',
      persistence: event.cookies.get('site-persistence-consent') === 'accepted',
    }),
  },
  request: {
    mode: 'ssr',
    metadataKeys: ['slug', 'renderer'],
    authorizeExperience(_event, descriptor, context) {
      const byId = /^\/experiences\/([^/]+)$/.exec(context.url.pathname);
      const personalized = ['true', '1'].includes(
        context.url.searchParams.get('personalization') ?? ''
      );
      const keys = byId
        ? ['experienceId', 'locale', 'personalization', 'extensions']
        : ['destinationId', 'path', 'locale', 'personalization'];
      const events = descriptor.personalization;
      const allowedIntent =
        events === undefined
          ? personalized
          : Object.keys(events).every((key) => key === 'events') &&
            Array.isArray(events.events) &&
            events.events.length === 0;
      const preview =
        env.LIVE_PREVIEW_ENABLED === 'true' &&
        env.CPA_TOKEN?.trim() &&
        context.url.searchParams.get('preview_session_id')?.trim();
      const locale = preview ? undefined : (context.url.searchParams.get('locale') ?? 'en-US');
      const extensions = 'experienceId' in descriptor ? descriptor.extensions : undefined;
      const sourceMap = extensions?.sourceMap;
      const allowedExtensions =
        extensions === undefined ||
        (!preview &&
          Object.keys(extensions).length === 1 &&
          Object.keys(extensions)[0] === 'sourceMap' &&
          sourceMap !== null &&
          typeof sourceMap === 'object' &&
          !Array.isArray(sourceMap) &&
          Object.keys(sourceMap).length === 0);
      return Boolean(
        env.SPACE_ID &&
        env.CDA_TOKEN &&
        Object.keys(descriptor).every((key) => keys.includes(key)) &&
        descriptor.locale === locale &&
        allowedIntent &&
        allowedExtensions &&
        context.resolveOptions === undefined &&
        (byId
          ? 'experienceId' in descriptor && descriptor.experienceId === decodeURIComponent(byId[1]!)
          : 'destinationId' in descriptor &&
            descriptor.destinationId === env.DESTINATION_ID &&
            'path' in descriptor &&
            descriptor.path === context.url.pathname)
      );
    },
    resolveOptions: (_event, { url }) => ({
      debug: ['true', '1'].includes(url.searchParams.get('debug') ?? ''),
      metadata: {
        slug: url.pathname.startsWith('/experiences/')
          ? decodeURIComponent(url.pathname.slice('/experiences/'.length))
          : url.pathname.slice(1),
        renderer: 'server',
      },
    }),
    pagePayload: (event, { url }) =>
      buildPagePayload({
        origin: url.origin,
        path: url.pathname,
        locale: url.searchParams.get('locale') ?? 'en-US',
        referrer: event.request.headers.get('referer') ?? '',
        searchParams: Object.fromEntries(
          [...new Set(url.searchParams.keys())].map((key) => {
            const values = url.searchParams.getAll(key);
            return [key, values.length === 1 ? values[0] : values];
          })
        ),
      }),
    onResult(event, result) {
      if (
        !['/[...path]', '/experiences/[id]'].includes(event.route.id ?? '') ||
        event.isDataRequest ||
        event.isSubRequest ||
        !['GET', 'HEAD'].includes(event.request.method)
      )
        return;
      const routeKey = event.url.pathname + event.url.search;
      if (result.routeKey !== routeKey) return;
      // Keep the captured-fetch result intact. The outer document hook applies
      // a validated redirect only after Kit completes this same document.
      const target = result.redirect?.path;
      event.locals.exoDocumentOutcome = {
        routeKey,
        notFound: result.notFound === true,
        ...(isLocalRedirectPath(target) ? { redirect: target } : {}),
      };
    },
  },
});
