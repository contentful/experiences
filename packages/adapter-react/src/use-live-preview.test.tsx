/** @vitest-environment jsdom */

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload } from '@contentful/experiences-sdk-core';

import { useLivePreview, type UseLivePreviewOptions } from './use-live-preview';

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

function payloadTitle(value: ExperiencePayload | undefined): string {
  const title = value?.nodes[0]?.contentProperties?.title;
  return typeof title === 'string' ? title : '';
}

function LivePreviewProbe({ value }: { value: UseLivePreviewOptions }): ReactElement {
  const { data } = useLivePreview(value);
  return <output>{payloadTitle(data)}</output>;
}

function renderRoot(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
}

describe('useLivePreview', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('returns initial data and updates when the session sends a message', async () => {
    const initialData = payload('initial');
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(<LivePreviewProbe value={options({ initialData })} />);
    });

    expect(container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(1);

    await act(async () => {
      FakeWebSocket.instances[0]?.emitMessage(
        JSON.stringify({ type: 'next', data: payload('updated') })
      );
    });

    expect(container.textContent).toBe('updated');
  });

  it('keeps the source inactive when a session credential is missing', async () => {
    const initialData = payload('initial');
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(<LivePreviewProbe value={options({ initialData, sessionId: undefined })} />);
    });

    expect(container.textContent).toBe('initial');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('does not recreate the source when only the options object is recreated', async () => {
    ({ container, root } = renderRoot());

    await act(async () => {
      root.render(<LivePreviewProbe value={options()} />);
    });
    await act(async () => {
      root.render(<LivePreviewProbe value={{ ...options() }} />);
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(container.textContent).toBe('');
  });

  it('recreates the source when a connection option changes', async () => {
    ({ root } = renderRoot());
    await act(async () => {
      root.render(<LivePreviewProbe value={options()} />);
    });
    const firstSocket = FakeWebSocket.instances[0];

    await act(async () => {
      root.render(<LivePreviewProbe value={options({ sessionId: 'new-session-id' })} />);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(firstSocket?.close).toHaveBeenCalledTimes(1);
  });
});
