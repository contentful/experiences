import { describe, expect, it } from 'vitest';
import { createExperienceClient } from './create-client.js';

const BASE_OPTS = {
  spaceId: 'space-1',
  environmentId: 'master',
  accessToken: 'token-abc',
};

describe('createExperienceClient', () => {
  it('creates an XDN (delivery) client when preview is false', () => {
    const client = createExperienceClient({ ...BASE_OPTS, preview: false });
    expect(client.preview).toBe(false);
    expect(client.spaceId).toBe('space-1');
    expect(client.environmentId).toBe('master');
    expect(client.accessToken).toBe('token-abc');
  });

  it('defaults preview to false when omitted', () => {
    const client = createExperienceClient(BASE_OPTS);
    expect(client.preview).toBe(false);
  });

  it('creates an XPA (preview) client when preview is true', () => {
    const client = createExperienceClient({ ...BASE_OPTS, preview: true });
    expect(client.preview).toBe(true);
  });

  it('exposes the view client', () => {
    const client = createExperienceClient(BASE_OPTS);
    expect(client.view).toBeDefined();
    expect(typeof client.view.getExperience).toBe('function');
  });

  it('throws when spaceId is missing', () => {
    expect(() => createExperienceClient({ ...BASE_OPTS, spaceId: '' })).toThrow(
      'spaceId is required'
    );
  });

  it('throws when environmentId is missing', () => {
    expect(() => createExperienceClient({ ...BASE_OPTS, environmentId: '' })).toThrow(
      'environmentId is required'
    );
  });

  it('throws when accessToken is missing', () => {
    expect(() => createExperienceClient({ ...BASE_OPTS, accessToken: '' })).toThrow(
      'accessToken is required'
    );
  });
});
