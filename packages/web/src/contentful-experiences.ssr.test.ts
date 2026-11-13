import { completeProfile as profileFixture } from './test-fixtures/profile.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

let runtime: import('./contentful-experiences.js').ContentfulExperiences | undefined;

afterEach(() => {
  runtime?.destroy();
  runtime = undefined;
  vi.restoreAllMocks();
});

describe('Web public entry on the server', () => {
  it('imports without browser work and exposes safe context fallbacks', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const web = await import('./index.js');

    expect(fetch).not.toHaveBeenCalled();
    expect(web.getPageProperties()).toEqual({
      path: '',
      query: {},
      referrer: '',
      search: '',
      title: '',
      url: '',
    });
    expect(web.getUserAgent()).toBeUndefined();
    expect(
      web.getPreviewSessionBinding(
        { experienceId: 'hero' },
        new URLSearchParams('preview_session_id=session')
      )
    ).toMatchObject({ experienceId: 'hero', sessionId: 'session' });
    expect(() => web.getPreviewSessionBinding({ experienceId: 'hero' })).toThrow(
      'getPreviewSessionBinding requires explicit searchParams outside a browser.'
    );
  });

  it('retains live profile state when browser persistence is unavailable', async () => {
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
      defaults: { profile: profileFixture('server-render-profile') },
    });

    expect(runtime.states.profile.current).toEqual(profileFixture('server-render-profile'));

    runtime.reset();
    expect(runtime.states.profile.current).toBeUndefined();
  });
});

describe('Web interaction tracking on the server', () => {
  it('automatically initializes and accepts tracking controls without a DOM', async () => {
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
    });

    expect(() => {
      runtime!.tracking.disable('views');
      runtime!.tracking.enable('views');
      runtime!.reset();
      runtime!.destroy();
    }).not.toThrow();
  });
});

describe('Session preview without browser globals', () => {
  it('keeps ordinary policy when no browser URL session is available', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { ContentfulExperiences } = await import('./index.js');
    runtime = new ContentfulExperiences({
      spaceId: 'space',
      environmentId: 'environment',
      delivery: { accessToken: 'delivery-token' },
      preview: { accessToken: 'preview-token' },
      defaults: { consent: true },
    });
    expect(runtime.isPreview).toBe(false);
    expect(runtime.states.preview.current).toBeUndefined();
    runtime.destroy();
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('reads snapshot flags and static flag observables without browser state or exposure', async () => {
  const { createSnapshotRuntime } = await import('./runtime.js');
  const fetch = vi.spyOn(globalThis, 'fetch');
  const runtime = createSnapshotRuntime({
    data: {
      changes: [
        {
          type: 'Variable',
          key: 'banner',
          value: { value: [false, 'nested'] },
          meta: { experienceId: 'experiment', variantIndex: 1 },
        },
      ],
    },
  });
  expect(runtime.getFlag('banner')).toEqual([false, 'nested']);
  const flag = runtime.states.flag('banner');
  expect(flag.current).toEqual([false, 'nested']);
  const next = vi.fn();
  flag.subscribe(next).unsubscribe();
  expect(next).toHaveBeenCalledExactlyOnceWith([false, 'nested']);
  expect(runtime.getFlag('missing')).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
