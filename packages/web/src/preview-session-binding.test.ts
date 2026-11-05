import { afterEach, describe, expect, it } from 'vitest';
import { getPreviewSessionBinding } from './preview-session-binding.js';

const defaults = { experienceId: 'default' };
const initialUrl = window.location.href;

afterEach(() => window.history.replaceState(null, '', initialUrl));

describe('Web Preview Session binding', () => {
  it('reads current browser parameters on each call', () => {
    window.history.replaceState(null, '', '?preview_session_id=first');
    expect(getPreviewSessionBinding(defaults)).toMatchObject({
      experienceId: 'default',
      sessionId: 'first',
    });
    window.history.replaceState(null, '', '?preview_session_id=second&preview_experience_id=hero');
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
});
