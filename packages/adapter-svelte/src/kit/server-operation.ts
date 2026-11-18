import type { RequestEvent } from '@sveltejs/kit';
import {
  ContentfulExperiences,
  ExperienceFetchError,
  assertExperienceSelector,
  isNotFoundError,
  isPreviewSessionFetchError,
  ANONYMOUS_ID_COOKIE,
  type ConsentInput,
  type FetchExperienceOptions,
} from '@contentful/experiences-node';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
import { projectRequestResult, type RawRequestResult } from './request-projection.js';
import type {
  PreparationInput,
  ServerBindingOptions,
  ServerOperationContext,
  ServerValue,
} from './server-types.js';

const ANONYMOUS_ID_COOKIE_LEGACY = 'ntaid';

function resolveValue<T>(
  value: ServerValue<T>,
  event: RequestEvent,
  context: ServerOperationContext
): T | Promise<T> {
  return typeof value === 'function'
    ? (value as (event: RequestEvent, context: ServerOperationContext) => T | Promise<T>)(
        event,
        context
      )
    : value;
}

function consentRecord(value: ConsentInput) {
  return typeof value === 'boolean' ? { events: value, persistence: value } : value;
}

/** One owned primary operation. Application composition shares its live request facade. */
export function createServerOperation(options: ServerBindingOptions) {
  if (options.request.mode !== 'ssr' && options.request.mode !== 'hybrid')
    throw new TypeError('request.mode must be ssr or hybrid.');
  if (typeof options.request.authorizeExperience !== 'function')
    throw new TypeError('request.authorizeExperience is required.');
  if (options.consent?.server === undefined) throw new TypeError('consent.server is required.');
  const {
    config,
    endpoint: _endpoint,
    cookie: _cookie,
    consent: _consent,
    request: _request,
    ...nodeConfig
  } = options;
  const sdk = new ContentfulExperiences(nodeConfig);
  return async (
    event: RequestEvent,
    input: PreparationInput,
    trusted: { document: boolean; prerender?: boolean }
  ) => {
    if (trusted.prerender)
      throw new TypeError('Private Experience preparation cannot run during prerendering.');
    assertExperienceSelector(input.experience);
    const url = new URL(input.routeKey, event.url.origin);
    if (url.origin !== event.url.origin || input.routeKey !== url.pathname + url.search)
      throw new TypeError('routeKey must be a same-origin pathname plus original search.');
    const eventFree = input.operation === 'read';
    const context: ServerOperationContext = {
      url,
      routeKey: input.routeKey,
      experience: input.experience,
      eventFree,
      resolveOptions: input.resolveOptions,
    };
    const base: RawRequestResult = {
      requestId: globalThis.crypto.randomUUID(),
      routeKey: input.routeKey,
      experience: input.experience,
      ...(eventFree ? { eventFree: true } : {}),
    };
    if (!(await options.request.authorizeExperience(event, input.experience, context))) {
      const result = projectRequestResult({ ...base, error: { statusCode: 403 } }, options);
      if (trusted.document && !eventFree)
        options.request.onResult?.(event, globalThis.structuredClone(result));
      return result;
    }
    const serverConsent = consentRecord(await resolveValue(options.consent.server, event, context));
    const incoming = input.consent === undefined ? undefined : consentRecord(input.consent);
    const consent = {
      events: serverConsent.events === true && incoming?.events !== false,
      persistence: serverConsent.persistence === true && incoming?.persistence !== false,
    };
    const profileId = trusted.document
      ? consent.persistence
        ? (event.cookies.get(ANONYMOUS_ID_COOKIE) ?? event.cookies.get(ANONYMOUS_ID_COOKIE_LEGACY))
        : undefined
      : input.profileId;
    const sessionId = options.preview ? resolvePreviewSessionId(url.searchParams) : undefined;
    const request = sdk.forRequest({
      ...(!trusted.document || eventFree ? { preflight: true } : {}),
      consent,
      locale: input.locale,
      eventContext: input.eventContext,
      ...(profileId ? { profile: { id: profileId } } : {}),
      ...(sessionId ? { preview: { sessionId } } : {}),
    });
    try {
      const configuredResolve =
        options.request.resolveOptions === undefined
          ? {}
          : await resolveValue(options.request.resolveOptions, event, context);
      const resolveOptions = {
        ...input.resolveOptions,
        ...configuredResolve,
        metadata: { ...input.resolveOptions?.metadata, ...configuredResolve.metadata },
        config,
      };
      let descriptor: FetchExperienceOptions = input.experience;
      let initialPagePayload;
      if (eventFree || request.isPreview) {
        const { personalization: _personalization, ...selection } = descriptor;
        descriptor = selection;
      } else if (descriptor.personalization?.events === undefined) {
        const events =
          options.request.initialEvents === undefined
            ? undefined
            : await resolveValue(options.request.initialEvents, event, context);
        const query = Object.fromEntries(
          [...new Set(url.searchParams.keys())].map((key) => {
            const values = url.searchParams.getAll(key);
            return [key, values.length === 1 ? values[0]! : values];
          })
        );
        initialPagePayload =
          options.request.pagePayload === undefined
            ? {
                properties: {
                  path: url.pathname,
                  url: url.href,
                  search: url.search,
                  query,
                  referrer: event.request.headers.get('referer') ?? '',
                },
              }
            : await resolveValue(options.request.pagePayload, event, context);
        descriptor = {
          ...descriptor,
          personalization: {
            ...descriptor.personalization,
            events: [...(events ?? []), { type: 'page', ...initialPagePayload }],
          },
        };
      }
      const ssr = trusted.document && !eventFree && options.request.mode === 'ssr';
      let output: Pick<RawRequestResult, 'plan' | 'redirect' | 'error' | 'handoff'>;
      try {
        output =
          !eventFree && !request.isPreview && !ssr
            ? await request.fetchExperienceForHandoff(descriptor, resolveOptions, {
                routeKey: input.routeKey,
              })
            : await request
                .fetchExperience(descriptor, resolveOptions)
                .then((value) => ('redirect' in value ? value : { plan: value }));
      } catch (error) {
        if (!(
          error instanceof ExperienceFetchError ||
          isNotFoundError(error) ||
          isPreviewSessionFetchError(error)
        ))
          throw error;
        output = { error };
      }
      if (
        output.error !== undefined &&
        !(
          output.error instanceof ExperienceFetchError ||
          isNotFoundError(output.error) ||
          isPreviewSessionFetchError(output.error)
        )
      )
        throw output.error;
      const primary: RawRequestResult = {
        ...base,
        ...output,
        ...(!request.isPreview && ssr ? { initialPageOwner: 'server' as const } : {}),
        ...(initialPagePayload ? { initialPagePayload } : {}),
        ...(options.preview
          ? {
              preview: {
                ...(options.preview.sessionHost === undefined
                  ? {}
                  : { sessionHost: options.preview.sessionHost }),
                ...(options.preview.resourceResolution === undefined
                  ? {}
                  : { resourceResolution: options.preview.resourceResolution }),
              },
            }
          : {}),
      };
      if (ssr && !request.isPreview && !output.redirect) {
        const state = output.plan?.personalization;
        const finalId = request.profile?.id ?? state?.profile.id;
        output = {
          ...output,
          handoff: {
            spaceId: options.spaceId,
            environmentId: options.environmentId,
            cache: { scope: 'private-request' },
            ...(finalId ? { profileId: finalId } : {}),
            ...(state ? { state } : {}),
          },
        };
      }
      const prepared = { ...primary, ...output };
      if (!eventFree) await options.request.composeRequest?.(request, prepared, event, context);
      const result = projectRequestResult(prepared, {
        ...options,
        metadataKeys: options.request.metadataKeys,
        isPreview: request.isPreview,
      });
      if (ssr && !request.isPreview) {
        const { expires = 365, ...attributes } = options.cookie ?? {};
        if (!Number.isFinite(expires)) throw new TypeError('cookie.expires must be finite.');
        const cookieOptions = {
          path: '/',
          sameSite: 'lax' as const,
          httpOnly: false,
          ...attributes,
        };
        if (request.canPersistProfile && request.profile?.id)
          event.cookies.set(ANONYMOUS_ID_COOKIE, request.profile.id, {
            ...cookieOptions,
            expires: new Date(Date.now() + expires * 86_400_000),
          });
        else if (!request.canPersistProfile)
          event.cookies.delete(ANONYMOUS_ID_COOKIE, cookieOptions);
        if (event.cookies.get(ANONYMOUS_ID_COOKIE_LEGACY))
          event.cookies.delete(ANONYMOUS_ID_COOKIE_LEGACY, cookieOptions);
      }
      if (trusted.document && !eventFree)
        options.request.onResult?.(event, globalThis.structuredClone(result));
      return result;
    } finally {
      request.destroy();
    }
  };
}
