/**
 * Thrown by `fetchPreviewSession` for a Preview Session fetch failure other
 * than a missing session.
 */
export class PreviewSessionFetchError extends Error {
  readonly spaceId: string;
  readonly environmentId: string;
  readonly sessionId: string;

  constructor(
    message: string,
    options: {
      spaceId: string;
      environmentId: string;
      sessionId: string;
      cause?: unknown;
    }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PreviewSessionFetchError';
    this.spaceId = options.spaceId;
    this.environmentId = options.environmentId;
    this.sessionId = options.sessionId;
  }
}
