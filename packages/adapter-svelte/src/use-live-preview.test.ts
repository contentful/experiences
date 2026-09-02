import { render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import LivePreviewProbe from './test-fixtures/LivePreviewProbe.svelte';
import type { UseLivePreviewOptions } from './use-live-preview.svelte.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly close = vi.fn();
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const payload = (title: string): ExperiencePayload => ({
  nodes: [
    {
      component: {
        sys: {
          type: 'ResourceLink',
          linkType: 'Contentful:Component',
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
      designProperties: {},
      slots: {},
    },
  ],
  sys: { type: 'Experience' },
  viewports: [
    {
      displayName: 'Default',
      id: 'default',
      previewSize: '1024px',
      query: '*',
    },
  ],
});

const options = (overrides: Partial<UseLivePreviewOptions> = {}): UseLivePreviewOptions => ({
  environmentId: 'environment-id',
  previewToken: 'preview-token',
  sessionHost: 'wss://preview-session.example.test',
  sessionId: 'session-id',
  spaceId: 'space-id',
  ...overrides,
});

describe('useLivePreview', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns initial raw data and updates from the Preview Session', async () => {
    const initialData = payload('initial');
    const view = render(LivePreviewProbe, { props: { options: options({ initialData }) } });
    expect(view.container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0]?.emitMessage(
      JSON.stringify({ type: 'next', data: payload('updated') })
    );
    await vi.waitFor(() => expect(view.container.textContent).toBe('updated'));
  });

  it('does not connect when a session credential is missing', () => {
    const view = render(LivePreviewProbe, {
      props: { options: options({ initialData: payload('initial'), sessionId: undefined }) },
    });

    expect(view.container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
