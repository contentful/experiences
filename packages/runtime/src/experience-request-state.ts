/** Why the latest Personalization request failed. */
export type ExperienceRequestFailureReason = 'timeout' | 'api-error';

/** State of the latest Personalization request, owned by the runtime leaf. */
export type ExperienceRequestState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success' }
  | { status: 'failed'; reason: ExperienceRequestFailureReason };
