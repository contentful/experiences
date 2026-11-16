import { renderToString } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type WebExperiencesRuntime,
} from '@contentful/experiences-web';
import {
  ExperiencesContext,
  useExperiences,
  useExperiencesContext,
  type ExperiencesContextValue,
} from './experiences-context.js';

describe('Experiences context access', () => {
  it('narrows only live context to the concrete SDK and retains common runtime actions', () => {
    const sdk = createWebSnapshotRuntime();
    function Probe() {
      const context = useExperiencesContext();
      if (context.isLive) {
        expectTypeOf(context.sdk).toEqualTypeOf<ContentfulExperiences>();
        expectTypeOf(context.sdk.fetchExperience).toEqualTypeOf<
          ContentfulExperiences['fetchExperience']
        >();
        expectTypeOf(context.sdk.resolveExperience).toEqualTypeOf<
          ContentfulExperiences['resolveExperience']
        >();
      } else {
        expectTypeOf(context.sdk).toEqualTypeOf<WebExperiencesRuntime>();
        // @ts-expect-error Snapshot presentation does not expose content fetching.
        expect(context.sdk.fetchExperience).toBeUndefined();
        // @ts-expect-error Snapshot presentation does not expose content resolution.
        expect(context.sdk.resolveExperience).toBeUndefined();
      }
      expectTypeOf(useExperiences()).toEqualTypeOf<WebExperiencesRuntime>();
      const runtime = useExperiences();
      expectTypeOf(runtime.consent).toEqualTypeOf<WebExperiencesRuntime['consent']>();
      expectTypeOf(runtime.reset).toEqualTypeOf<WebExperiencesRuntime['reset']>();
      expectTypeOf(runtime.page).toEqualTypeOf<WebExperiencesRuntime['page']>();
      return null;
    }
    renderToString(
      <ExperiencesContext.Provider
        value={{ sdk, isLive: false, error: new Error('setup failed'), isContentReady: true }}
      >
        <Probe />
      </ExperiencesContext.Provider>
    );
  });
  it.each([
    ['context', useExperiencesContext],
    ['SDK', useExperiences],
  ] as const)('requires a provider for %s access', (_name, useAccess) => {
    function Missing() {
      useAccess();
      return null;
    }
    expect(() => renderToString(<Missing />)).toThrow(
      'Experiences hooks require an ExperiencesRoot or ExperiencesProvider.'
    );
  });

  it('returns the supplied context and its SDK without wrapping either', () => {
    const value: ExperiencesContextValue = {
      sdk: {} as WebExperiencesRuntime,
      error: new Error('activation failed'),
      isLive: false,
      isContentReady: true,
    };
    function Probe() {
      expect(useExperiencesContext()).toBe(value);
      expect(useExperiences()).toBe(value.sdk);
      return null;
    }
    renderToString(
      <ExperiencesContext.Provider value={value}>
        <Probe />
      </ExperiencesContext.Provider>
    );
  });
});
