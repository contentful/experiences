/**
 * Thrown by `fetchExperience` for a fetch failure that is not "experience not
 * found" — network failure, an invalid/expired token, a 5xx from the
 * delivery API, etc. This failure mode is "surface clearly to the host app,"
 * unlike the diagnostics `resolveExperience` collects for resolve/render-time
 * issues — there's no partial payload to render around a fetch that never
 * returned one, so a real thrown class is the right shape.
 *
 * `NotFoundError` (the delivery client's class, re-exported from this
 * package) is the one exception: it passes through undisturbed so callers
 * can route it to their framework's 404 idiom, per the existing
 * distinguishable-404 contract.
 *
 * `environmentId` is `undefined` for the destination-shaped `fetchExperience`
 * branches — the destinations delivery endpoints are space-scoped only, with
 * no environment segment, unlike the by-id path.
 */
export class ExperienceFetchError extends Error {
  readonly spaceId: string;
  readonly environmentId: string | undefined;
  readonly experienceId: string;

  constructor(
    message: string,
    options: {
      spaceId: string;
      environmentId?: string;
      experienceId: string;
      cause?: unknown;
    }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ExperienceFetchError';
    this.spaceId = options.spaceId;
    this.environmentId = options.environmentId;
    this.experienceId = options.experienceId;
  }
}

/**
 * Thrown by `fetchExperience` when `clientOptions.preview` is `true` and
 * `experienceOptions` is destination-shaped (`destinationId` + `nodeId` or
 * `destinationId` + `path`). The Destinations Delivery API has no preview
 * host or preview-token support yet, so this guards against silently hitting the
 * production host with a preview token it doesn't accept.
 *
 * This is a bridge, not a permanent design: revisit once the platform ships
 * preview support for destinations.
 *
 * Only fires for the inline-credentials branch of `ClientOptions`. A
 * caller-supplied `{ client }` already ignores `preview` entirely, per that
 * branch's existing contract.
 */
export class DestinationPreviewNotSupportedError extends Error {
  readonly spaceId: string;
  readonly destinationId: string;
  readonly nodeId: string | undefined;
  readonly path: string | undefined;

  constructor(
    message: string,
    options: { spaceId: string; destinationId: string; nodeId?: string; path?: string }
  ) {
    super(message);
    this.name = 'DestinationPreviewNotSupportedError';
    this.spaceId = options.spaceId;
    this.destinationId = options.destinationId;
    this.nodeId = options.nodeId;
    this.path = options.path;
  }
}

/** Thrown by `fetchPreviewSession` for a non-404 Preview Session fetch failure. */
export class PreviewSessionFetchError extends Error {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly sessionId: string;

  constructor(
    message: string,
    options: { spaceId: string; environmentId: string; sessionId: string; cause?: unknown }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PreviewSessionFetchError';
    this.spaceId = options.spaceId;
    this.environmentId = options.environmentId;
    this.sessionId = options.sessionId;
  }
}
