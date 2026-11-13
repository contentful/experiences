import type {
  FetchByDestinationNodeOptions,
  FetchByDestinationPathOptions,
  FetchDestinationOptions,
  FetchExperienceOptions,
} from './contentful-experiences.js';

/** One content request: an Experience id, a Destination path, or a Destination node. */
export type ExperienceRequest = FetchExperienceOptions | FetchDestinationOptions;

export type ExperienceSelectorKind = 'experience' | 'destination-path' | 'destination-node';

type AnySelector = Partial<
  FetchExperienceOptions & FetchByDestinationNodeOptions & FetchByDestinationPathOptions
>;

/**
 * Classify a request by selector, rejecting ambiguous combinations. Destination
 * selectors are space-scoped and carry only personalization, so by-ID transport
 * fields (`locale`, `parameters`, `extensions`) are rejected alongside them.
 */
export function getExperienceSelectorKind(request: ExperienceRequest): ExperienceSelectorKind {
  const value = request as AnySelector;
  const destination = value.destinationId !== undefined;
  const byNode = value.nodeId !== undefined;
  const byPath = value.path !== undefined;
  if (value.experienceId !== undefined) {
    if (destination || byNode || byPath)
      throw new TypeError('An Experience request selects either experienceId or a Destination.');
    return 'experience';
  }
  if (!destination || byNode === byPath)
    throw new TypeError(
      'A Destination request requires destinationId with exactly one of path or nodeId.'
    );
  if (
    value.locale !== undefined ||
    value.parameters !== undefined ||
    value.extensions !== undefined
  )
    throw new TypeError(
      'Destination requests do not accept locale, parameters or extensions; the Destinations API is space-scoped.'
    );
  if (byPath && (typeof value.path !== 'string' || !value.path.startsWith('/')))
    throw new TypeError('A Destination path must be absolute and start with "/".');
  return byNode ? 'destination-node' : 'destination-path';
}

export function isDestinationRequest(
  request: ExperienceRequest
): request is FetchDestinationOptions {
  return getExperienceSelectorKind(request) !== 'experience';
}

/**
 * Transport identity without personalization. Distinct selector kinds never share
 * an identity, even when their locator strings are equal.
 */
export function getExperienceRequestIdentity(request: ExperienceRequest): readonly unknown[] {
  const kind = getExperienceSelectorKind(request);
  if (kind === 'experience') {
    const { experienceId, locale, parameters, extensions } = request as FetchExperienceOptions;
    return [kind, experienceId, locale, parameters, extensions];
  }
  const { destinationId } = request as FetchDestinationOptions;
  return kind === 'destination-node'
    ? [kind, destinationId, (request as FetchByDestinationNodeOptions).nodeId]
    : [kind, destinationId, (request as FetchByDestinationPathOptions).path];
}
