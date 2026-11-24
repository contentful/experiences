import { afterEach, expect, it, vi } from 'vitest';
import { resolveExperience } from '@contentful/experiences-sdk-core';
import { createLivePreviewClient } from '../index';
import { FakeWebSocket, resetSockets, sockets } from '../test-fixtures/fake-websocket';
import { repeatedCapture, repeatedPayload } from '../test-fixtures/inspector-mock';

// This is the local capture configuration boundary, not a mocked map producer.
vi.mock('./capture.js', async () => ({
  capture: (await import('../test-fixtures/inspector-mock')).repeatedCapture,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetSockets();
});

it('delivers real Preview Session content with repeated section, named body, card/actions and empty-slot ownership', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubGlobal('WebSocket', FakeWebSocket);
  const source = createLivePreviewClient({
    spaceId: repeatedCapture.spaceId,
    environmentId: repeatedCapture.environmentId,
    sessionId: 'session',
    previewToken: 'preview-token',
    sourceMap: true,
    sessionHost: 'wss://preview.example.test',
  });
  const stop = source.subscribe(() => {});
  try {
    const url = new URL(sockets[0]!.url);
    expect(url.searchParams.get('source_map')).toBe('true');
    expect(url.searchParams.get('access_token')).toBe('preview-token');
    const input = repeatedPayload();
    sockets[0]!.emitMessage(JSON.stringify({ type: 'next', data: input }));
    const output = source.getResult().data!;
    expect(output.nodes).toEqual(input.nodes);
    const map = output.extensions!.sourceMap!;
    const sourcePath = (id: string) =>
      (map.nodes[id] as { layers: number[] }).layers
        .map((index) => map.layers[index] as { kind: string; id: string; sourceEntity?: number })
        .filter((row) => row.kind === 'SourceNode')
        .map(({ id, sourceEntity }) => [id, map.layers[sourceEntity!]]);
    expect(sourcePath('first-copy')).toEqual([
      ['body-copy', { kind: 'Component', id: 'repeated-sections' }],
      ['body-layout', { kind: 'Component', id: 'repeated-sections' }],
      ['body-placeholder', { kind: 'Component', id: 'cta' }],
      ['section', { kind: 'Component', id: 'cta' }],
      ['first', { kind: 'Component', id: 'repeated-sections' }],
    ]);
    expect(sourcePath('second-primary')).toEqual([
      ['primary', { kind: 'Component', id: 'repeated-sections' }],
      ['actions-placeholder', { kind: 'Component', id: 'card' }],
      ['card-layout', { kind: 'Component', id: 'card' }],
      ['body-card', { kind: 'Component', id: 'repeated-sections' }],
      ['body-placeholder', { kind: 'Component', id: 'cta' }],
      ['section', { kind: 'Component', id: 'cta' }],
      ['second', { kind: 'Component', id: 'repeated-sections' }],
    ]);
    expect(sourcePath('third-heading')).toEqual([
      ['heading', { kind: 'Component', id: 'cta' }],
      ['section', { kind: 'Component', id: 'cta' }],
      ['third', { kind: 'Component', id: 'repeated-sections' }],
    ]);
    expect(Object.keys(map.nodes)).toHaveLength(13);
    const plan = await resolveExperience(output, { components: {} });
    expect(plan.sourceMap).toBe(map);
    expect(plan.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'first-section',
      'second-section',
      'third-section',
    ]);
  } finally {
    stop();
  }
});
