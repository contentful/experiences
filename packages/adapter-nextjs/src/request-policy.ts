import type {
  RequestRuntime,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-node';
import { createPageContext } from './request-context.js';
import {
  isContentError,
  resolveServerValue,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
  type ServerRequestResult,
} from './server-config.js';
import { serializeHandoff } from './serialization.js';

export async function resolveRequestPolicy(
  options: ServerConfig,
  overrides: ServerRequestOverrides,
  context: ServerRequestContext
) {
  const policy = { ...options.request, ...overrides };
  if (!policy.experience) throw new TypeError('Request components require request.experience.');
  const descriptor = await resolveServerValue(policy.experience, context);
  if (
    descriptor.personalization?.events !== undefined &&
    (policy.initialEvents !== undefined || policy.pagePayload !== undefined)
  )
    throw new TypeError('personalization.events conflicts with initialEvents or pagePayload.');
  const defaults = options.request?.resolveOptions;
  const resolveOptions: FetchResolveOptions = {
    ...(defaults === undefined ? {} : await resolveServerValue(defaults, context)),
    ...(overrides.resolveOptions === undefined
      ? {}
      : await resolveServerValue(overrides.resolveOptions, context)),
    config: options.config,
  };
  const { personalization: _personalization, ...experience } = descriptor;
  const explicitEvents = descriptor.personalization?.events;
  const result: ServerRequestResult = {
    requestId: globalThis.crypto.randomUUID(),
    experienceId: descriptor.experienceId,
    routeKey: context.routeKey,
    experience: {
      ...experience,
      ...(explicitEvents !== undefined && !explicitEvents.some((event) => event.type === 'page')
        ? { personalization: { events: [] } }
        : {}),
    },
    ...(options.preview
      ? {
          preview: {
            ...(options.preview.enabled === undefined ? {} : { enabled: options.preview.enabled }),
            ...(options.preview.sessionId === undefined
              ? {}
              : { sessionId: options.preview.sessionId }),
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
  return { policy, descriptor, resolveOptions, result };
}

/** One primary fetch. Any additional fetches and their identity effects belong to composeRequest. */
export async function loadPrimaryExperience(
  request: RequestRuntime,
  resolved: Awaited<ReturnType<typeof resolveRequestPolicy>>,
  context: ServerRequestContext,
  options: ServerConfig
): Promise<ServerRequestResult> {
  const { policy, descriptor, resolveOptions, result } = resolved;
  let fetchOptions: FetchExperienceOptions = descriptor;
  let initialPagePayload: ServerRequestResult['initialPagePayload'];
  if (descriptor.personalization?.events === undefined && !request.isPreview) {
    const url = new URL(context.requestUrl);
    initialPagePayload =
      policy.pagePayload === undefined
        ? {
            properties: createPageContext({
              path: url.pathname,
              url: context.requestUrl,
              searchParams: url.searchParams,
              referrer: context.headers.get('referer') ?? '',
            }),
          }
        : await resolveServerValue(policy.pagePayload, context);
    const initialEvents =
      policy.initialEvents === undefined
        ? []
        : ((await resolveServerValue(policy.initialEvents, context)) ?? []);
    fetchOptions = {
      ...descriptor,
      personalization: {
        ...descriptor.personalization,
        events: [...initialEvents, { type: 'page', ...initialPagePayload }],
      },
    };
  }
  let output: Pick<ServerRequestResult, 'plan' | 'error' | 'handoff'>;
  try {
    output = !request.isPreview
      ? await request.fetchExperienceForHandoff(fetchOptions, resolveOptions, {
          routeKey: context.routeKey,
        })
      : { plan: await request.fetchExperience(fetchOptions, resolveOptions) };
  } catch (error) {
    if (!isContentError(error)) throw error;
    output = { error };
  }
  const primary = {
    ...result,
    ...output,
    ...(initialPagePayload ? { initialPagePayload } : {}),
    ...(output.error !== undefined ? { contentError: 'Experience content unavailable.' } : {}),
  };
  await policy.composeRequest?.(request, primary, context);
  return {
    ...primary,
    ...(output.handoff ? { handoff: serializeHandoff(output.handoff, options) } : {}),
  };
}
