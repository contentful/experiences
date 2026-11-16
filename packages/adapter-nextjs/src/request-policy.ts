import type {
  RequestRuntime,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-node';
import { createNextjsPageContext } from './request-context.js';
import {
  isNextjsContentError,
  resolveNextjsServerValue,
  type NextjsServerExperiencesConfig,
  type NextjsServerRequestContext,
  type NextjsServerRequestOverrides,
  type NextjsServerRequestResult,
} from './server-config.js';
import { serializeNextjsHandoff } from './serialization.js';

export async function resolveNextjsRequestPolicy(
  options: NextjsServerExperiencesConfig,
  overrides: NextjsServerRequestOverrides,
  context: NextjsServerRequestContext
) {
  const policy = { ...options.request, ...overrides };
  if (!policy.experience) throw new TypeError('Request components require request.experience.');
  const descriptor = await resolveNextjsServerValue(policy.experience, context);
  if (
    descriptor.personalization?.events !== undefined &&
    (policy.initialEvents !== undefined || policy.pagePayload !== undefined)
  )
    throw new TypeError('personalization.events conflicts with initialEvents or pagePayload.');
  const defaults = options.request?.resolveOptions;
  const resolveOptions: FetchResolveOptions = {
    ...(defaults === undefined ? {} : await resolveNextjsServerValue(defaults, context)),
    ...(overrides.resolveOptions === undefined
      ? {}
      : await resolveNextjsServerValue(overrides.resolveOptions, context)),
    config: options.config,
  };
  const { personalization: _personalization, ...experience } = descriptor;
  const explicitEvents = descriptor.personalization?.events;
  const result: NextjsServerRequestResult = {
    requestId: globalThis.crypto.randomUUID(),
    experienceId: descriptor.experienceId,
    routeKey: context.routeKey,
    experience: {
      ...experience,
      ...(explicitEvents !== undefined && !explicitEvents.some((event) => event.type === 'page')
        ? { personalization: { events: [] } }
        : {}),
    },
  };
  return { policy, descriptor, resolveOptions, result };
}

/** One primary fetch. Any additional fetches and their identity effects belong to composeRequest. */
export async function loadNextjsPrimaryExperience(
  request: RequestRuntime,
  resolved: Awaited<ReturnType<typeof resolveNextjsRequestPolicy>>,
  context: NextjsServerRequestContext,
  options: NextjsServerExperiencesConfig
): Promise<NextjsServerRequestResult> {
  const { policy, descriptor, resolveOptions, result } = resolved;
  let fetchOptions: FetchExperienceOptions = descriptor;
  let initialPagePayload: NextjsServerRequestResult['initialPagePayload'];
  if (descriptor.personalization?.events === undefined && !request.isPreview) {
    const url = new URL(context.requestUrl);
    initialPagePayload =
      policy.pagePayload === undefined
        ? {
            properties: createNextjsPageContext({
              path: url.pathname,
              url: context.requestUrl,
              searchParams: url.searchParams,
              referrer: context.headers.get('referer') ?? '',
            }),
          }
        : await resolveNextjsServerValue(policy.pagePayload, context);
    const initialEvents =
      policy.initialEvents === undefined
        ? []
        : ((await resolveNextjsServerValue(policy.initialEvents, context)) ?? []);
    fetchOptions = {
      ...descriptor,
      personalization: {
        ...descriptor.personalization,
        events: [...initialEvents, { type: 'page', ...initialPagePayload }],
      },
    };
  }
  let output: Pick<NextjsServerRequestResult, 'plan' | 'error' | 'handoff'>;
  try {
    output = !request.isPreview
      ? await request.fetchExperienceForHandoff(fetchOptions, resolveOptions, {
          routeKey: context.routeKey,
        })
      : { plan: await request.fetchExperience(fetchOptions, resolveOptions) };
  } catch (error) {
    if (!isNextjsContentError(error)) throw error;
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
    ...(output.handoff ? { handoff: serializeNextjsHandoff(output.handoff, options) } : {}),
  };
}
