import { describe, expect, it } from 'vitest';
import {
  getExperienceRequestIdentity,
  getExperienceSelectorKind,
  isDestinationRequest,
  type ExperienceRequest,
} from './experience-selector.js';

describe('experience selectors', () => {
  it('classifies Experience, Destination path and Destination node requests', () => {
    expect(getExperienceSelectorKind({ experienceId: 'exp' })).toBe('experience');
    expect(getExperienceSelectorKind({ destinationId: 'dest', path: '/a' })).toBe(
      'destination-path'
    );
    expect(getExperienceSelectorKind({ destinationId: 'dest', nodeId: 'node' })).toBe(
      'destination-node'
    );
    expect(isDestinationRequest({ experienceId: 'exp' })).toBe(false);
    expect(isDestinationRequest({ destinationId: 'dest', nodeId: 'node' })).toBe(true);
  });

  it('rejects ambiguous or unsupported Destination selectors', () => {
    const invalid = [
      { experienceId: 'exp', destinationId: 'dest', path: '/a' },
      { destinationId: 'dest' },
      { destinationId: 'dest', path: '/a', nodeId: 'node' },
      { path: '/a' },
      { destinationId: 'dest', path: 'relative' },
      { destinationId: 'dest', path: '/a', locale: 'de-DE' },
      { destinationId: 'dest', nodeId: 'node', parameters: { a: 'b' } },
      { destinationId: 'dest', nodeId: 'node', extensions: { sourceMap: {} } },
    ];
    for (const request of invalid)
      expect(() => getExperienceSelectorKind(request as unknown as ExperienceRequest)).toThrow(
        TypeError
      );
  });

  it('never shares identity across selector kinds with equal locators', () => {
    const byId = getExperienceRequestIdentity({ experienceId: 'same' });
    const byPath = getExperienceRequestIdentity({ destinationId: 'dest', path: '/same' });
    const byNode = getExperienceRequestIdentity({ destinationId: 'dest', nodeId: '/same' });
    expect(new Set([byId, byPath, byNode].map((value) => JSON.stringify(value))).size).toBe(3);
    expect(
      getExperienceRequestIdentity({
        destinationId: 'dest',
        path: '/same',
        personalization: { profileId: 'p' },
      })
    ).toEqual(byPath);
  });
});
