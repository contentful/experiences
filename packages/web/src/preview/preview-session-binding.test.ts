import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { getPreviewSessionBinding } from '../preview-session-binding.js';

const defaults = { experienceId: 'default' };
describe.runIf(inject('webTestEnvironment') === 'browser')(
  'Web Preview Session binding in a browser',
  () => {
    let initialUrl: string;
    beforeEach(() => {
      initialUrl = window.location.href;
    });
    afterEach(() => window.history.replaceState(null, '', initialUrl));
    it('reads current browser parameters on each call', () => {
      window.history.replaceState(null, '', '?preview_session_id=first');
      expect(getPreviewSessionBinding(defaults)).toMatchObject({
        experienceId: 'default',
        sessionId: 'first',
      });
      window.history.replaceState(
        null,
        '',
        '?preview_session_id=second&preview_experience_id=hero'
      );
      expect(getPreviewSessionBinding(defaults)).toMatchObject({
        experienceId: 'hero',
        sessionId: 'second',
      });
      window.history.replaceState(null, '', '?preview_session_id=');
      expect(getPreviewSessionBinding(defaults)).toBeUndefined();
    });

    it('uses explicit target parameters instead of the current browser parameters', () => {
      window.history.replaceState(null, '', '?preview_session_id=current');
      expect(
        getPreviewSessionBinding(defaults, new URLSearchParams('preview_session_id=target'))
      ).toMatchObject({ experienceId: 'default', sessionId: 'target' });
    });
  }
);

describe.runIf(inject('webTestEnvironment') === 'node')(
  'Web Preview Session binding in Node',
  () => {
    it('uses explicit session parameters without browser globals', () => {
      expect(
        getPreviewSessionBinding(
          { experienceId: 'hero' },
          new URLSearchParams('preview_session_id=session')
        )
      ).toMatchObject({ experienceId: 'hero', sessionId: 'session' });
    });
    it('requires explicit parameters without browser globals', () => {
      expect(() => getPreviewSessionBinding({ experienceId: 'hero' })).toThrow(
        'getPreviewSessionBinding requires explicit searchParams outside a browser.'
      );
    });
  }
);
