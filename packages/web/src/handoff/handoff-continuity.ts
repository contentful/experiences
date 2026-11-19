import type { EventProfile } from '@contentful/experiences-runtime';

/** The part of a handoff that decides whether it may change the visitor's identity. */
export interface HandoffContinuityInput {
  readonly cache: { readonly scope: 'private-request' | 'public-permutation' | 'static' };
  readonly state?: { readonly profile?: EventProfile };
}

/**
 * Whether a handoff's profile may be adopted. Only a private request carries a visitor, and
 * only when it states the profile: an explicit `undefined` is a clear, while an omitted field
 * says nothing. A shared handoff never applies one. The runtime already refuses a shared
 * handoff that carries a profile, so refusing it here as well is a second line of defence.
 */
export function shouldApplyHandoffProfile(handoff: HandoffContinuityInput): boolean {
  return (
    handoff.cache.scope === 'private-request' &&
    handoff.state !== undefined &&
    Object.hasOwn(handoff.state, 'profile')
  );
}
