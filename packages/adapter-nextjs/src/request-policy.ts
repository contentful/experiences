import {
  getExperienceSelectorKind,
  isDestinationRedirect,
  parseExperiencesHandoffEnvelope,
  type ExperienceRequest,
  type ExperiencesHandoff,
  type FetchDestinationOptions,
  type FetchExperienceOptions,
  type FetchResolveOptions,
  type PortableRenderPlan,
  type RequestRuntime,
} from '@contentful/experiences-node';
import { createPageContext } from './request-context.js';
import {
  isContentError,
  isNotFoundError,
  resolveServerValue,
  type ServerConfig,
  type ServerRequestContext,
  type ServerRequestOverrides,
  type ServerRequestResult,
} from './server-config.js';
import { serializeHandoff } from './serialization.js';

/** Browser descriptor: the selector only, with events reduced to page-free intent markers. */
function browserDescriptor(descriptor: ExperienceRequest): ExperienceRequest {
  const { personalization, ...selector } = descriptor;
  const explicitEvents = personalization?.events;
  return {
    ...selector,
    ...(explicitEvents !== undefined && !explicitEvents.some((event) => event.type === 'page')
      ? { personalization: { events: [] } }
      : {}),
  } as ExperienceRequest;
}

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
  // Exactly one primary: an Experience id, a Destination path or a Destination node.
  const selector = getExperienceSelectorKind(descriptor);
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
  const result: ServerRequestResult = {
    requestId: globalThis.crypto.randomUUID(),
    ...(selector === 'experience'
      ? { experienceId: (descriptor as FetchExperienceOptions).experienceId }
      : {}),
    routeKey: context.routeKey,
    experience: browserDescriptor(descriptor),
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
  return { policy, mode, descriptor, selector, resolveOptions, result };
}

type PrimaryOutput = Pick<ServerRequestResult, 'plan' | 'error' | 'handoff' | 'redirect'>;

/** Ordinary fetch for any selector. A Destination redirect is a value, not content. */
async function fetchPrimary(
  request: RequestRuntime,
  options: ExperienceRequest,
  resolveOptions: FetchResolveOptions
): Promise<PrimaryOutput> {
  if ('experienceId' in options && options.experienceId !== undefined)
    return { plan: await request.fetchExperience(options, resolveOptions) };
  const destination = options as FetchDestinationOptions;
  const result: PortableRenderPlan | { redirect: { path: string } } =
    'nodeId' in destination
      ? await request.fetchByDestinationNode(destination, resolveOptions)
      : await request.fetchByDestinationPath(destination, resolveOptions);
  return isDestinationRedirect(result) ? { redirect: result.redirect } : { plan: result };
}

/** Actual hybrid transfer for any selector: server preflight, browser replay. */
async function fetchPrimaryForHandoff(
  request: RequestRuntime,
  options: ExperienceRequest,
  resolveOptions: FetchResolveOptions,
  routeKey: string
): Promise<PrimaryOutput> {
  if ('experienceId' in options && options.experienceId !== undefined)
    return request.fetchExperienceForHandoff(options, resolveOptions, { routeKey });
  const { redirect, ...output } = await request.fetchDestinationForHandoff(
    options as FetchDestinationOptions,
    resolveOptions,
    { routeKey }
  );
  // A redirect is never presented: no handoff is emitted for its route.
  return redirect ? { redirect } : output;
}

/** One primary fetch. Any additional fetches and their identity effects belong to composeRequest. */
export async function loadPrimaryExperience(
  request: RequestRuntime,
  resolved: Awaited<ReturnType<typeof resolveRequestPolicy>>,
  context: ServerRequestContext,
  options: ServerConfig
): Promise<ServerRequestResult> {
  const { policy, mode, descriptor, resolveOptions, result } = resolved;
  let fetchOptions: ExperienceRequest = descriptor;
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
    } as ExperienceRequest;
  }
  let output: PrimaryOutput;
  try {
    output =
      !request.isPreview && mode === 'hybrid'
        ? await fetchPrimaryForHandoff(request, fetchOptions, resolveOptions, context.routeKey)
        : await fetchPrimary(request, fetchOptions, resolveOptions);
  } catch (error) {
    if (!isContentError(error)) throw error;
    output = { error };
  }
  const redirect = output.redirect;
  // A redirect is control flow: no state handoff, page owner or browser page payload.
  const ownsInitialPage = !request.isPreview && mode === 'ssr' && redirect === undefined;
  if (ownsInitialPage) {
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
  const resolvedExperienceId = output.plan?.experienceId;
  const primary: ServerRequestResult = {
    ...result,
    ...output,
    ...(result.experienceId === undefined && resolvedExperienceId !== undefined
      ? { experienceId: resolvedExperienceId }
      : {}),
    ...(ownsInitialPage ? { initialPageOwner: 'server' as const } : {}),
    ...(initialPagePayload && redirect === undefined ? { initialPagePayload } : {}),
    ...(output.error !== undefined ? { contentError: 'Experience content unavailable.' } : {}),
    ...(isNotFoundError(output.error) ? { notFound: true as const } : {}),
  };
  await policy.composeRequest?.(request, primary, context);
  return {
    ...primary,
    ...(output.handoff ? { handoff: serializeHandoff(output.handoff, options) } : {}),
  };
}
