import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentfulExperiences } from './contentful-experiences.js';
import type { Config } from '../request/types.js';
import type { OptimizationEventStreamEvent } from '@contentful/experiences-runtime';
import { analyticsProfileFixture as completeProfile } from '../test/fixtures/profile.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from '../sdk-info.js';

const runtimes = new Set<ContentfulExperiences>();
function createRuntime(overrides: Partial<Config> = {}) {
  const sdk = new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    delivery: { accessToken: 'delivery-token' },
    resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
    app: { name: 'site', version: '1.0.0' },
    ...overrides,
  });
  runtimes.add(sdk);
  return sdk;
}
function setup() {
  const sdk = createRuntime({
    environmentId: 'env',
    locale: undefined,
    resolveDefaults: undefined,
    app: undefined,
    delivery: { accessToken: 'token' },
  });
  const upsert = vi
    .spyOn(sdk.api.personalization, 'upsertProfile')
    .mockResolvedValue({ profile: completeProfile('response') } as never);
  return { sdk, upsert };
}
afterEach(() => {
  for (const sdk of runtimes) sdk.destroy();
  runtimes.clear();
  vi.restoreAllMocks();
});
describe('Node SDK ownership', () => {
  it('inherits pure flag lookup without retaining changes or tracking exposures', () => {
    const runtime = createRuntime();
    const send = vi.spyOn(runtime.api.analytics, 'sendBatchEvents');
    const personalize = vi.spyOn(runtime.api.personalization, 'upsertProfile');
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

  it('allows independent live SDK instances without requiring teardown', () => {
    const first = createRuntime();
    expect(first.eventBuilder.channel).toBe('server');
    expect(first.eventBuilder.library).toEqual(DEFAULT_EVENT_CONTEXT_LIBRARY);
    expect(first.eventBuilder.buildTrack({ event: 'runtime' }).context.app).toEqual({
      name: 'site',
      version: '1.0.0',
    });
    const german = first.forRequest({ locale: 'de-DE' });
    const french = first.forRequest({ locale: 'fr-FR' });
    const second = createRuntime();

    expect(german.locale).toBe('de-DE');
    expect(french.locale).toBe('fr-FR');
    expect(second.forRequest({ locale: 'es-ES' }).locale).toBe('es-ES');

    first.destroy();
    first.destroy();
    expect(second.forRequest({ locale: 'it-IT' }).locale).toBe('it-IT');
  });

  it('shares its instance registry across request facades', async () => {
    const { sdk, upsert } = setup();
    const other = setup();
    const hook = vi.fn((event: OptimizationEventStreamEvent) => event);
    sdk.interceptors.event.add(hook);
    await sdk.forRequest({ consent: true }).page();
    await sdk.forRequest({ consent: true }).page();
    await other.sdk.forRequest({ consent: true }).page();
    expect(hook).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
