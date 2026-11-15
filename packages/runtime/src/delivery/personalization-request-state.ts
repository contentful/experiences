/** Why the latest Personalization request failed. */
export type PersonalizationRequestFailureReason = 'timeout' | 'api-error';

/** State of the latest Personalization request, owned by the runtime leaf. */
export type PersonalizationRequestState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success' }
  | { status: 'failed'; reason: PersonalizationRequestFailureReason };
