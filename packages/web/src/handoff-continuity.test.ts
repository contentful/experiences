import { describe, expect, it } from 'vitest';

import { shouldApplyHandoffProfile } from './handoff-continuity.js';

// A handoff that is cached and shared carries no visitor, so it must never change the
// identity this browser already holds. These are the Optimization SDK's rules.
describe('shouldApplyHandoffProfile', () => {
  it('applies the profile of a private request handoff that carries one', () => {
    expect(
      shouldApplyHandoffProfile({
        cache: { scope: 'private-request' },
        state: { profile: { id: 'visitor' } },
      })
    ).toBe(true);
  });

  it('applies an explicit clear, which a private request handoff states as an undefined profile', () => {
    expect(
      shouldApplyHandoffProfile({
        cache: { scope: 'private-request' },
        state: { profile: undefined },
      })
    ).toBe(true);
  });

  it('ignores a private request handoff that says nothing about the profile', () => {
    expect(shouldApplyHandoffProfile({ cache: { scope: 'private-request' }, state: {} })).toBe(
      false
    );
    expect(shouldApplyHandoffProfile({ cache: { scope: 'private-request' } })).toBe(false);
  });

  it.each(['static', 'public-permutation'] as const)(
    'never applies a %s handoff profile, even an explicit clear',
    (scope) => {
      expect(shouldApplyHandoffProfile({ cache: { scope }, state: { profile: undefined } })).toBe(
        false
      );
      expect(
        shouldApplyHandoffProfile({ cache: { scope }, state: { profile: { id: 'visitor' } } })
      ).toBe(false);
    }
  );
});
