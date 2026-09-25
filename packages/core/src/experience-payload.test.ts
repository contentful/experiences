import { describe, expect, it } from 'vitest';
import { isExperiencePayload } from './experience-payload.js';

describe('isExperiencePayload', () => {
  it('accepts the dependency-free Experience JSON shape', () => {
    expect(isExperiencePayload({ sys: { type: 'Experience' }, nodes: [] })).toBe(true);
  });

  it.each([
    undefined,
    {},
    { sys: { type: 'Experience' }, nodes: {} },
    { sys: { type: 'ExperienceFragment' }, nodes: [] },
    { sys: { type: 'Experience' }, nodes: [], viewports: {} },
  ])('rejects invalid payloads', (value) => {
    expect(isExperiencePayload(value)).toBe(false);
  });
});
