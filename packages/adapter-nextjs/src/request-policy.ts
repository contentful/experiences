import {
  parseExperiencesHandoffEnvelope,
  type ExperiencesHandoff,
  type RequestRuntime,
  type FetchExperienceOptions,
  type FetchResolveOptions,
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
  const mode =
    policy.mode === undefined ? 'hybrid' : await resolveServerValue(policy.mode, context);
  if (mode !== 'ssr' && mode !== 'hybrid')
    throw new TypeError('request.mode must be ssr or hybrid.');
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
    ...(descriptor.experienceId === undefined ? {} : { experienceId: descriptor.experienceId }),
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
  return { policy, mode, descriptor, resolveOptions, result };
}

/** One primary fetch. Any additional fetches and their identity effects belong to composeRequest. */
export async function loadPrimaryExperience(
  request: RequestRuntime,
  resolved: Awaited<ReturnType<typeof resolveRequestPolicy>>,
  context: ServerRequestContext,
  options: ServerConfig
): Promise<ServerRequestResult> {
  const { policy, mode, descriptor, resolveOptions, result } = resolved;
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
  let output: Pick<ServerRequestResult, 'plan' | 'error' | 'handoff' | 'redirect'>;
  try {
    output =
      !request.isPreview && mode === 'hybrid'
        ? await request.fetchExperienceForHandoff(fetchOptions, resolveOptions, {
            routeKey: context.routeKey,
          })
        : await request
            .fetchExperience(fetchOptions, resolveOptions)
            .then((value) => ('redirect' in value ? value : { plan: value }));
  } catch (error) {
    if (!isContentError(error)) throw error;
    output = { error };
  }
  if (!output.redirect && !request.isPreview && mode === 'ssr') {
    const personalization = output.plan?.personalization;
    const profileId = personalization?.profile.id ?? request.profile?.id;
    const handoff = parseExperiencesHandoffEnvelope(
      {
        spaceId: options.spaceId,
        environmentId: options.environmentId,
        cache: { scope: 'private-request' },
        ...(profileId ? { profileId } : {}),
        ...(personalization ? { state: personalization } : {}),
      },
      options
    ) as ExperiencesHandoff;
    output = { ...output, handoff };
  }
  const primary = {
    ...result,
    ...output,
    ...(output.plan?.experienceId ? { experienceId: output.plan.experienceId } : {}),
    ...(!request.isPreview && mode === 'ssr' ? { initialPageOwner: 'server' as const } : {}),
    ...(initialPagePayload ? { initialPagePayload } : {}),
    ...(output.error !== undefined ? { contentError: 'Experience content unavailable.' } : {}),
  };
  await policy.composeRequest?.(request, primary, context);
  return {
    ...primary,
    ...(output.handoff ? { handoff: serializeHandoff(output.handoff, options) } : {}),
  };
}
