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
 */
export class ExperienceFetchError extends Error {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly experienceId: string;

  constructor(
    message: string,
    options: {
      spaceId: string;
      environmentId: string;
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
