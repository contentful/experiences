import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from '../test/runtime.js';

describe('Node SDK', () => {
  it('inherits pure flag lookup without retaining changes or tracking exposures', () => {
    const runtime = createRuntime();
    const send = vi.spyOn(runtime.api.insights, 'sendBatchEvents');
    const personalize = vi.spyOn(runtime.api.experience, 'upsertProfile');
    const changes = [
      {
        type: 'Variable',
        key: 'flag',
        value: 0,
        meta: { experienceId: 'experiment', variantIndex: 0 },
      },
    ];
    expect(runtime.getFlag('flag', changes)).toBe(0);
    expect(runtime.getFlag('flag')).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(personalize).not.toHaveBeenCalled();
  });
});
