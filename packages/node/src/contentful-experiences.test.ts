import { describe, expect, it, vi } from 'vitest';

import { ContentfulExperiences } from './contentful-experiences.js';
import { DEFAULT_EVENT_CONTEXT_LIBRARY } from './sdk-info.js';

function createRuntime() {
  return new ContentfulExperiences({
    spaceId: 'space',
    environmentId: 'environment',
    locale: 'en-US',
    resolverConfig: { components: {} },
    delivery: { client: {} as never },
    resolveDefaults: { debug: true, metadata: { source: 'constructor', shared: 'constructor' } },
    app: { name: 'site', version: '1.0.0' },
  });
}

describe('Node ContentfulExperiences', () => {
  it('applies stable Node attribution and creates distinct request facades', () => {
    const runtime = createRuntime();
    const first = runtime.forRequest({ locale: 'de-DE' });
    const second = runtime.forRequest({ locale: 'fr-FR' });

    expect(first).not.toBe(second);
    expect('eventBuilder' in first).toBe(false);
    expect(runtime.eventBuilder.channel).toBe('server');
    expect(runtime.eventBuilder.library).toEqual(DEFAULT_EVENT_CONTEXT_LIBRARY);
    expect(runtime.eventBuilder.buildTrack({ event: 'runtime' }).context).toMatchObject({
      app: { name: 'site', version: '1.0.0' },
      gdpr: { isConsentGiven: false },
      locale: 'en-US',
      library: DEFAULT_EVENT_CONTEXT_LIBRARY,
    });
  });

  it('keeps concurrent request context isolated', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi
      .spyOn(runtime, 'fetchExperience')
      .mockImplementation(
        async (options, resolveOptions) =>
          ({ locale: options.locale, metadata: resolveOptions?.metadata }) as never
      );
    const german = runtime.forRequest({
      locale: 'de-DE',
      resolveOptions: { metadata: { request: 'german' } },
    });
    const french = runtime.forRequest({
      locale: 'fr-FR',
      resolveOptions: { metadata: { request: 'french' } },
    });

    const [germanResult, frenchResult] = await Promise.all([
      german.fetchExperience({ experienceId: 'german' }),
      french.fetchExperience({ experienceId: 'french' }),
    ]);

    expect(germanResult).toEqual({
      locale: 'de-DE',
      metadata: { request: 'german' },
    });
    expect(frenchResult).toEqual({
      locale: 'fr-FR',
      metadata: { request: 'french' },
    });
    expect(fetchExperience).toHaveBeenCalledTimes(2);
  });

  it('applies request options before method options, including explicit false', async () => {
    const runtime = createRuntime();
    const resolveExperience = vi
      .spyOn(runtime, 'resolveExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const request = runtime.forRequest({
      resolveOptions: {
        debug: true,
        initialViewportId: 'tablet',
        metadata: { request: 'value', shared: 'request' },
      },
    });

    await request.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { debug: false, initialViewportId: 'phone', metadata: { method: 'value', shared: 'method' } }
    );

    expect(resolveExperience).toHaveBeenCalledWith(expect.anything(), {
      debug: false,
      initialViewportId: 'phone',
      metadata: { request: 'value', method: 'value', shared: 'method' },
    });
  });

  it('passes merged request options through the Client runtime defaults', async () => {
    const runtime = createRuntime();
    const request = runtime.forRequest({
      resolveOptions: { debug: true, metadata: { request: 'value', shared: 'request' } },
    });

    const plan = await request.resolveExperience(
      { sys: { type: 'Experience' }, nodes: [] },
      { debug: false, metadata: { method: 'value', shared: 'method' } }
    );

    expect(plan.debug).toBe(false);
    expect(plan.metadata).toEqual({
      source: 'constructor',
      request: 'value',
      method: 'value',
      shared: 'method',
    });
  });

  it('forwards fetch and destination calls with the request locale and resolve options', async () => {
    const runtime = createRuntime();
    const fetchExperience = vi
      .spyOn(runtime, 'fetchExperience')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const byNode = vi
      .spyOn(runtime, 'fetchByDestinationNode')
      .mockResolvedValue({ nodes: [], viewports: [] } as never);
    const byPath = vi
      .spyOn(runtime, 'fetchByDestinationPath')
      .mockResolvedValue({ redirect: { path: '/next' } });
    const request = runtime.forRequest({
      locale: 'es-ES',
      resolveOptions: { metadata: { request: true } },
    });

    await request.fetchExperience({ experienceId: 'experience' });
    await request.fetchByDestinationNode({ destinationId: 'destination', nodeId: 'node' });
    await request.fetchByDestinationPath({ destinationId: 'destination', path: '/path' });

    expect(fetchExperience).toHaveBeenCalledWith(
      { experienceId: 'experience', locale: 'es-ES' },
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
    expect(byNode).toHaveBeenCalledWith(
      { destinationId: 'destination', nodeId: 'node' },
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
    expect(byPath).toHaveBeenCalledWith(
      { destinationId: 'destination', path: '/path' },
      { metadata: { request: true }, debug: undefined, initialViewportId: undefined }
    );
  });
});
