import { Component, type Type, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';

import {
  injectLivePreviewExperience,
  type InjectLivePreviewExperienceOptions,
} from './inject-live-preview-experience.js';
import {
  injectExperiencePlan,
  type InjectExperiencePlanOptions,
} from './inject-experience-plan.js';

type FakeSocket = {
  readonly url: string;
  readonly close: ReturnType<typeof vi.fn>;
  emitMessage(data: unknown): void;
};

const sockets: FakeSocket[] = [];

class FakeWebSocket {
  readonly url: string;
  readonly close = vi.fn();
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
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
          linkType: 'Contentful:Component',
          type: 'ResourceLink',
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

const initialPlan: PortableRenderPlan = {
  fallbackViewportIndex: 0,
  nodes: [
    {
      nodeId: 'initial',
      registration: { kind: 'component', id: 'hero' },
      props: { content: { title: 'initial' }, design: {}, designRaw: {} },
      slots: {},
    },
  ],
  viewports: payload('initial').viewports,
  metadata: {},
  debug: false,
  diagnostics: [],
};

const livePreviewOptions = (
  initialPayload?: ExperiencePayload
): InjectLivePreviewExperienceOptions => ({
  previewSessionOptions: {
    environmentId: 'environment-id',
    previewToken: 'preview-token',
    sessionHost: 'wss://preview-session.example.test',
    sessionId: 'session-id',
    spaceId: 'space-id',
  },
  initialPayload,
});

@Component({
  selector: 'cf-live-preview-probe',
  template: `<output>{{
    livePreview.data()?.nodes?.[0]?.contentProperties?.['title'] ?? ''
  }}</output>`,
})
class LivePreviewExperienceProbe {
  readonly options = signal<InjectLivePreviewExperienceOptions>(livePreviewOptions());
  readonly livePreview = injectLivePreviewExperience(() => this.options());
}

@Component({
  selector: 'cf-experience-plan-probe',
  template: `<output>{{ plan.data()?.nodes?.[0]?.props?.content?.['title'] ?? '' }}</output>`,
})
class ExperiencePlanProbe {
  readonly options = signal<InjectExperiencePlanOptions>({
    payload: undefined,
    initialPlan,
    resolveOptions: { config: { components: {} } },
  });
  readonly plan = injectExperiencePlan(() => this.options());
}

function createFixture<T>(component: Type<T>, setup?: (instance: T) => void) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  setup?.(fixture.componentInstance);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  sockets.length = 0;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  TestBed.resetTestingModule();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('injectLivePreviewExperience', () => {
  it('keeps initial data and opens the socket after the first render', async () => {
    const initialPayload = payload('initial');
    const fixture = createFixture(LivePreviewExperienceProbe, (probe) => {
      probe.options.set(livePreviewOptions(initialPayload));
    });

    await vi.waitFor(() => expect(sockets).toHaveLength(1));

    expect(fixture.componentInstance.livePreview.data()).toBe(initialPayload);
    expect(fixture.nativeElement.textContent).toContain('initial');
    fixture.destroy();
  });

  it('updates the signal from a valid next message', async () => {
    const fixture = createFixture(LivePreviewExperienceProbe);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));

    const nextData = payload('updated');
    sockets[0]?.emitMessage(JSON.stringify({ type: 'next', data: nextData }));
    fixture.detectChanges();

    expect(fixture.componentInstance.livePreview.data()).toEqual(nextData);
    expect(fixture.nativeElement.textContent).toContain('updated');
    fixture.destroy();
  });

  it('does not open a socket when preview credentials are incomplete', async () => {
    const fixture = createFixture(LivePreviewExperienceProbe, (probe) => {
      probe.options.set({
        ...livePreviewOptions(payload('initial')),
        previewSessionOptions: {
          ...livePreviewOptions().previewSessionOptions,
          previewToken: undefined,
        },
      });
    });
    await fixture.whenStable();

    expect(sockets).toHaveLength(0);
    expect(fixture.componentInstance.livePreview.data()?.nodes[0]?.contentProperties?.title).toBe(
      'initial'
    );
    fixture.destroy();
  });

  it('replaces the client when connection options change and closes it on destroy', async () => {
    const fixture = createFixture(LivePreviewExperienceProbe);
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const firstSocket = sockets[0];

    fixture.componentInstance.options.update((options) => ({
      ...options,
      previewSessionOptions: {
        ...options.previewSessionOptions,
        sessionId: 'next-session-id',
      },
    }));
    fixture.detectChanges();

    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    expect(firstSocket?.close).toHaveBeenCalledTimes(1);

    const secondSocket = sockets[1];
    fixture.destroy();

    expect(secondSocket?.close).toHaveBeenCalledTimes(1);
  });
});

describe('injectExperiencePlan', () => {
  it('keeps the initial experience until raw data resolves', async () => {
    const fixture = createFixture(ExperiencePlanProbe);
    expect(fixture.componentInstance.plan.data()).toBe(initialPlan);

    fixture.componentInstance.options.update((options) => ({
      ...options,
      payload: payload('updated'),
    }));
    fixture.detectChanges();

    await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('updated'));
    expect(fixture.componentInstance.plan.data()?.nodes[0]?.props.content.title).toBe('updated');
    fixture.destroy();
  });

  it('retains the initial experience when resolving raw data produces diagnostics', async () => {
    const fixture = createFixture(ExperiencePlanProbe);
    fixture.componentInstance.options.set({
      payload: payload('failed'),
      initialPlan,
      resolveOptions: {
        config: {
          components: {
            hero: {
              resolveData: () => Promise.reject(new Error('resolver failed')),
            },
          },
        },
      },
    });
    fixture.detectChanges();

    await fixture.whenStable();
    expect(fixture.componentInstance.plan.data()).toBe(initialPlan);
    expect(fixture.nativeElement.textContent).toContain('initial');
    fixture.destroy();
  });

  it('allows only the latest raw-data update to publish', async () => {
    let resolveFirst: ((value: Record<string, unknown>) => void) | undefined;
    let resolveSecond: ((value: Record<string, unknown>) => void) | undefined;
    let resolveCall = 0;
    const fixture = createFixture(ExperiencePlanProbe);

    const resolveOptions = {
      config: {
        components: {
          hero: {
            resolveData: () =>
              new Promise<Record<string, unknown>>((resolve) => {
                resolveCall += 1;
                if (resolveCall === 1) resolveFirst = resolve;
                else resolveSecond = resolve;
              }),
          },
        },
      },
    };

    fixture.componentInstance.options.set({
      payload: payload('first'),
      initialPlan,
      resolveOptions,
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(resolveCall).toBe(1));

    fixture.componentInstance.options.set({
      payload: payload('second'),
      initialPlan,
      resolveOptions,
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(resolveCall).toBe(2));

    resolveSecond?.({});
    await vi.waitFor(() => expect(fixture.nativeElement.textContent).toContain('second'));

    resolveFirst?.({});
    await Promise.resolve();
    expect(fixture.nativeElement.textContent).toContain('second');
    fixture.destroy();
  });
});
