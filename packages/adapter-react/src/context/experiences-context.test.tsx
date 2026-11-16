import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WebExperiencesRuntime } from '@contentful/experiences-web';
import {
  ExperiencesContext,
  useExperiences,
  useExperiencesContext,
  type ExperiencesContextValue,
} from './experiences-context.js';

describe('Experiences context access', () => {
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
