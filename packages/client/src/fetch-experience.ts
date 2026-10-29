import type { ContentfulViewDeliveryClient } from '@contentful/experience-delivery';
import { ContentfulViewDelivery } from '@contentful/experience-delivery';
import { serializePersonalization } from './personalization.js';
import { createDebugLogger, resolveExperience } from '@contentful/experiences-sdk-core';
import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-sdk-core';
import { assertDestinationPreviewSupported } from './destination-guards.js';
import { resolveDeliveryClient, type ClientOptions } from './client-resolution.js';
import { ExperienceFetchError } from './errors.js';
import { parameterQuery, type ExperienceParameters } from './experience-parameters.js';
import {
  toExperiencePayload,
  toExperiencePayloadFromDestination,
  type ExperienceResponse,
} from './to-experience-payload.js';

export type { ClientOptions };

type DeliveryExperienceRequestExtensions =
  ContentfulViewDelivery.GetWithOverridesExperienceRequest.Extensions;

export type PersonalizationOptions = NonNullable<
  DeliveryExperienceRequestExtensions['personalization']
>;

export type ExperienceRequestExtensions = Omit<
  DeliveryExperienceRequestExtensions,
  'personalization'
>;

export type ByIdExperienceOptions = {
  spaceId: string;
  environmentId: string;
  experienceId: string;
  locale?: string;
  /** Values for declared Experience parameters. Refetch with new values to swap content. */
  parameters?: ExperienceParameters;
  /**
   * Profile and events used by XDA to personalize the resolved Experience.
   */
  personalization?: PersonalizationOptions;
  /**
   * Additional XDA request extensions such as source maps. Supplying a defined
   * extension switches the request to POST.
   */
  extensions?: ExperienceRequestExtensions;
};

/**
 * Resolve an Experience by the Destination Node instead of `experienceId`
 * The destinations delivery endpoints are space-scoped only and have no locale
 * param, unlike the by-id path. Supplying `personalization` switches the
 * request from the cacheable GET to the POST that carries it.
 */
export type ByDestinationNodeIdExperienceOptions = {
  spaceId: string;
  destinationId: string;
  nodeId: string;
  /** Profile and events used by XDA to personalize the resolved Experience. */
  personalization?: PersonalizationOptions;
};

/**
 * Resolve an Experience by the absolute path wired up to a
 * Destination Node, instead of a node id directly. Same scoping as
 * `ByDestinationNodeIdExperienceOptions` — no `environmentId` or `locale`.
 */
export type ByDestinationPathExperienceOptions = {
  spaceId: string;
  destinationId: string;
  /** Absolute path to resolve. Must start with `/`. */
  path: string;
  /** Profile and events used by XDA to personalize the resolved Experience. */
  personalization?: PersonalizationOptions;
};

export type ExperienceOptions =
  ByIdExperienceOptions | ByDestinationNodeIdExperienceOptions | ByDestinationPathExperienceOptions;

/**
 * A Destination resolution that the app must act on as control flow — honor
 * it by navigating or re-resolving at the new path — rather than a hydrated
 * Experience to render. Modeled as a normal return value, not a thrown error,
 * per the Destinations delivery API's own framing of a redirect response.
 */
export interface DestinationRedirectResult {
  redirect: { path: string };
}

export type ResolveOptions = {
  config: ResolverConfig;
  /**
   * Arbitrary per-render metadata exposed to every resolver as
   * `ctx.experience.metadata` and readable at render time via the framework
   * adapter's `useExperience()` / `getExperience()`.
   */
  metadata?: Record<string, unknown>;
  /**
   * Observability switch. When on: logs the fetch (host, ids) and the raw
   * payload here, and threads through to `resolveExperience` (resolution steps
   * + `resolveData` timings) and the renderer (visible missing-component box,
   * debug fallback). A single boolean across fetch + resolve + render.
   */
  debug?: boolean;
};

// TS overload signatures, not real redeclarations — base ESLint's no-redeclare doesn't know the
// overload form (@typescript-eslint's own version does), so each repeated signature needs a
// disable comment.
export async function fetchExperience(
  experienceOptions: ByIdExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ByDestinationNodeIdExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ByDestinationPathExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult>;
// eslint-disable-next-line no-redeclare -- see above
export async function fetchExperience(
  experienceOptions: ExperienceOptions,
  clientOptions: ClientOptions,
  resolveOptions: ResolveOptions
): Promise<PortableRenderPlan | DestinationRedirectResult> {
  const { config, metadata, debug } = resolveOptions;
  const log = createDebugLogger(debug, 'client');

  if (!('client' in clientOptions) && 'destinationId' in experienceOptions) {
    const { spaceId, destinationId } = experienceOptions;
    const locator =
      'nodeId' in experienceOptions
        ? { nodeId: experienceOptions.nodeId }
        : { path: experienceOptions.path };
    assertDestinationPreviewSupported(clientOptions.preview, {
      spaceId,
      destinationId,
      ...locator,
    });
  }

  const client = resolveDeliveryClient(clientOptions, log, 'fetchExperience');

  if ('nodeId' in experienceOptions) {
    const { spaceId, destinationId, nodeId, personalization } = experienceOptions;
    // Serialize before the request so invalid input is a TypeError, as on the by-id path.
    const extensions = destinationExtensions(personalization);
    return fetchByDestination(
      { spaceId, destinationId, locator: nodeId },
      () =>
        extensions === undefined
          ? client.destination.resolveByNodeId(spaceId, destinationId, nodeId)
          : client.destination.resolveByNodeIdWithOverrides(spaceId, destinationId, nodeId, {
              extensions,
            }),
      log,
      { config, metadata, debug }
    );
  }

  if ('path' in experienceOptions) {
    const { spaceId, destinationId, path, personalization } = experienceOptions;
    const extensions = destinationExtensions(personalization);
    return fetchByDestination(
      { spaceId, destinationId, locator: path },
      () =>
        client.destination.resolveByPath(spaceId, destinationId, {
          path,
          ...(extensions === undefined ? {} : { extensions }),
        }),
      log,
      { config, metadata, debug }
    );
  }

  const { spaceId, environmentId, experienceId, locale, personalization, extensions } =
    experienceOptions;

  log.log('fetching experience', {
    spaceId,
    environmentId,
    experienceId,
    locale,
    // avoiding log any personalization sensitive data
    personalization: personalization !== undefined,
    extensions,
  });

  const response = await fetchByExperienceId(client, experienceOptions);

  const payload = toExperiencePayload(response);
  log.lazy('received raw payload', () => payload);

  return resolveExperience(payload, config, { metadata, debug });
}

async function fetchByExperienceId(
  client: ContentfulViewDeliveryClient,
  options: ByIdExperienceOptions
): Promise<ExperienceResponse> {
  const { spaceId, environmentId, experienceId, locale, parameters, personalization, extensions } =
    options;
  const requestExtensions: DeliveryExperienceRequestExtensions = { ...extensions };
  if (personalization !== undefined) {
    requestExtensions.personalization = serializePersonalization(personalization);
  }

  try {
    // GET uses namespaced query leaves. POST preserves values that cannot be
    // represented by leaves and carries existing request extensions.
    // The generated delivery client owns the alpha-feature header on both
    // paths, including when the caller supplied the client instance.
    //
    // Await inside the try so rejected requests are normalized below.
    const queryParams = parameterQuery(parameters);
    if (hasRequestExtensions(requestExtensions) || queryParams === undefined) {
      // dev.10's POST serializer passes through extra body keys. Its generated
      // request type omits parameters, so retain our typed extension locally.
      // TODO: Remove this intersection once contentful-experience-delivery.js
      // generates parameters on GetWithOverridesExperienceRequest and we upgrade.
      const request: ContentfulViewDelivery.GetWithOverridesExperienceRequest & {
        parameters?: ExperienceParameters;
      } = {
        locale,
        extensions: requestExtensions,
        ...(parameters === undefined ? {} : { parameters }),
      };
      return await client.experience.getWithOverrides(
        spaceId,
        environmentId,
        experienceId,
        request
      );
    }

    if (Object.keys(queryParams).length > 0) {
      return await client.experience.get(
        spaceId,
        environmentId,
        experienceId,
        { locale },
        {
          queryParams,
        }
      );
    }
    return await client.experience.get(spaceId, environmentId, experienceId, { locale });
  } catch (err) {
    // Preserve expected 404 control flow for framework routers. Other failures
    // are wrapped with stable SDK context instead of exposing transport-specific
    // error shapes.
    if (err instanceof ContentfulViewDelivery.NotFoundError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ExperienceFetchError(
      `Failed to fetch Experience "${experienceId}" (space "${spaceId}", environment ` +
        `"${environmentId}"): ${reason}. Check network connectivity, the access token, and ` +
        `that the space/environment/experience ids are correct.`,
      { spaceId, environmentId, experienceId, cause: err }
    );
  }
}

/**
 * Shared response-handling for both destination-shaped `fetchExperience`
 * branches (by node id, by path).
 */
async function fetchByDestination(
  identity: { spaceId: string; destinationId: string; locator: string },
  resolve: () => Promise<ContentfulViewDelivery.DestinationExperienceResolutionResponse>,
  log: ReturnType<typeof createDebugLogger>,
  resolveOptions: {
    config: ResolverConfig;
    metadata: Record<string, unknown> | undefined;
    debug: boolean | undefined;
  }
): Promise<PortableRenderPlan | DestinationRedirectResult> {
  const { spaceId, destinationId, locator } = identity;
  const { config, metadata, debug } = resolveOptions;

  log.log('resolving destination experience', { spaceId, destinationId, locator });

  let response: ContentfulViewDelivery.DestinationExperienceResolutionResponse;
  try {
    response = await resolve();
  } catch (err) {
    if (err instanceof ContentfulViewDelivery.NotFoundError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new ExperienceFetchError(
      `Failed to resolve Destination "${destinationId}" at "${locator}" (space "${spaceId}"): ` +
        `${reason}. Check network connectivity, the access token, and that the space/` +
        `destination/node-or-path values are correct.`,
      { spaceId, experienceId: locator, cause: err }
    );
  }

  if ('redirect' in response) {
    log.log('destination resolved to a redirect', response.redirect);
    return { redirect: response.redirect };
  }

  const [firstExperience] = response.experiences;
  if (!firstExperience) {
    throw new ExperienceFetchError(
      `Destination "${destinationId}" resolved "${locator}" to zero Experiences ` +
        `(space "${spaceId}"). Expected exactly one hydrated Experience or a redirect.`,
      { spaceId, experienceId: locator }
    );
  }

  const payload = toExperiencePayloadFromDestination(firstExperience.experience);
  log.lazy('received raw payload', () => payload);

  return resolveExperience(payload, config, {
    metadata,
    debug,
  });
}

function destinationExtensions(
  personalization: PersonalizationOptions | undefined
): ContentfulViewDelivery.DestinationExperiencesExtensions | undefined {
  if (personalization === undefined) return undefined;
  return { personalization: serializePersonalization(personalization) };
}

function hasRequestExtensions(
  extensions: DeliveryExperienceRequestExtensions | undefined
): extensions is DeliveryExperienceRequestExtensions {
  return (
    extensions !== undefined &&
    Object.values(extensions).some((extension) => extension !== undefined)
  );
}
