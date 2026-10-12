// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('current-page attempt ownership', () => {
  it.each(['refused', 'failed'] as const)(
    'keeps a new same-route attempt pending after reset when the old completes and the new is %s',
    async (outcome) => {
      const runtime = new ContentfulExperiences({
        spaceId: 'space',
        environmentId: 'environment',
        delivery: { accessToken: 'delivery-token' },
      });
      try {
        const old = deferred<{ accepted: boolean }>();
        const current = deferred<{ accepted: boolean }>();
        const page = vi
          .spyOn(runtime, 'page')
          .mockReturnValueOnce(old.promise)
          .mockReturnValueOnce(current.promise)
          .mockResolvedValue({ accepted: true });
        const initialFlags: boolean[] = [];
        const buildPayload = ({ isInitialEmission }: { isInitialEmission: boolean }) => {
          initialFlags.push(isInitialEmission);
          return {};
        };

        const oldAttempt = runtime.trackCurrentPage({ routeKey: '/same', buildPayload });
        runtime.reset();
        const currentAttempt = runtime.trackCurrentPage({ routeKey: '/same', buildPayload });
        old.resolve({ accepted: true });
        await expect(oldAttempt).resolves.toEqual({ accepted: true });

        await expect(
          runtime.trackCurrentPage({ routeKey: '/same', buildPayload })
        ).resolves.toEqual({
          accepted: false,
        });
        expect(page).toHaveBeenCalledTimes(2);
        expect(initialFlags).toEqual([true, true]);

        if (outcome === 'refused') {
          current.resolve({ accepted: false });
          await expect(currentAttempt).resolves.toEqual({ accepted: false });
        } else {
          current.reject(new Error('send failed'));
          await expect(currentAttempt).rejects.toThrow('send failed');
        }

        await expect(
          runtime.trackCurrentPage({ routeKey: '/same', buildPayload })
        ).resolves.toEqual({
          accepted: true,
        });
        expect(page).toHaveBeenCalledTimes(3);
        expect(initialFlags).toEqual([true, true, true]);
      } finally {
        runtime.destroy();
      }
    }
  );
});
