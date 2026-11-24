import { Component, provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClientExperienceRenderer,
  injectContentfulComponent,
  injectLivePreview,
  type InjectLivePreviewOptions,
  injectLivePreviewInspection,
  type InjectLivePreviewInspectionOptions,
  type ResolveContext,
} from './index.js';
import { minimalSourceMap } from './test-fixtures/source-map.js';

@Component({
  selector: 'cf-inspection-probe',
  template: `<div data-cf-node-id="n">{{ title() }}</div>`,
})
class InspectionProbe {
  readonly title = signal('committed');
  readonly options = signal<InjectLivePreviewInspectionOptions>({
    sourceMap: minimalSourceMap(),
  });
  constructor() {
    injectLivePreviewInspection(() => this.options());
  }
}

function createFixture<T>(component: Type<T>, setup?: (instance: T) => void) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  setup?.(fixture.componentInstance);
  fixture.detectChanges();
  return fixture;
}

const geometryMessages = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls
    .map(
      ([message]) =>
        message as { eventType?: string; payload: { sourceMap: unknown; nodes: unknown } }
    )
    .filter((message) => message.eventType === 'canvasGeometryUpdated');

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    top: 20,
    left: 10,
    right: 110,
    bottom: 50,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('injectLivePreviewInspection', () => {
  it('starts after the enabled render commits and forwards the supplied map without subscribing', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const WebSocket = vi.fn(() => {
      throw new Error('standalone inspection cannot subscribe');
    });
    vi.stubGlobal('WebSocket', WebSocket);
    const fetch = vi.fn(() => {
      throw new Error('standalone inspection cannot request maps');
    });
    vi.stubGlobal('fetch', fetch);
    const fixture = createFixture(InspectionProbe);
    await fixture.whenStable();
    expect(geometryMessages(postMessage)).toEqual([]);

    fixture.componentInstance.title.set('updated');
    fixture.componentInstance.options.update((options) => ({ ...options, enabled: true }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(geometryMessages(postMessage)).toHaveLength(1));
    const message = geometryMessages(postMessage)[0]!;
    expect(fixture.nativeElement.textContent.trim()).toBe('updated');
    expect(message.payload.sourceMap).toBe(fixture.componentInstance.options().sourceMap);
    expect(message.payload.nodes).toEqual({
      n: { coordinates: { x: 10, y: 20, width: 100, height: 30 } },
    });
    expect(WebSocket).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    fixture.destroy();
  });
  it('replaces pending observation with the newly committed map and clears mapless renders', async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fixture = createFixture(InspectionProbe, (probe) => {
      probe.options.update((options) => ({ ...options, enabled: true }));
    });
    await vi.advanceTimersByTimeAsync(500);
    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    const replacement = minimalSourceMap({ experienceId: 'replacement' });
    fixture.componentInstance.options.set({ sourceMap: replacement, enabled: true });
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage).length).toBeGreaterThan(0);
    expect(
      geometryMessages(postMessage).every((message) => message.payload.sourceMap === replacement)
    ).toBe(true);
    fixture.componentInstance.options.set({ enabled: true });
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage).at(-1)!.payload).toMatchObject({
      sourceMap: null,
      nodes: {},
    });
    fixture.destroy();
  });

  it.each(['disable', 'destroy'] as const)(
    'cancels pending measurements without a final clearing snapshot on %s',
    async (action) => {
      vi.useFakeTimers();
      const postMessage = vi
        .spyOn(window.parent, 'postMessage')
        .mockImplementation(() => undefined);
      const fixture = createFixture(InspectionProbe, (probe) => {
        probe.options.update((options) => ({ ...options, enabled: true }));
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(geometryMessages(postMessage).length).toBeGreaterThan(0);
      postMessage.mockClear();
      window.dispatchEvent(new Event('resize'));
      if (action === 'disable') {
        fixture.componentInstance.options.update((options) => ({ ...options, enabled: false }));
        fixture.detectChanges();
      } else fixture.destroy();
      await vi.advanceTimersByTimeAsync(500);
      expect(geometryMessages(postMessage)).toEqual([]);
      if (action === 'disable') fixture.destroy();
      vi.useRealTimers();
    }
  );
});

@Component({
  selector: 'cf-inspected-hero',
  template: `<div [attr.data-cf-node-id]="component()?.nodeId">
    {{ component()?.content?.['title'] ?? '' }}
  </div>`,
})
class InspectedHero {
  readonly component = injectContentfulComponent();
}

@Component({
  selector: 'cf-integrated-inspection-probe',
  imports: [ClientExperienceRenderer],
  template: `<cf-experience [experience]="livePreview.data()" [config]="config" />`,
})
class IntegratedInspectionProbe {
  readonly config = { components: { hero: InspectedHero } };
  readonly options = signal<InjectLivePreviewOptions>({
    initialPlan: {
      nodes: [
        {
          nodeId: 'n',
          registration: { kind: 'component', id: 'hero' },
          props: { content: { title: 'initial' }, design: {}, designRaw: {} },
          slots: {},
        },
      ],
      sourceMap: minimalSourceMap(),
      metadata: {},
      debug: false,
      diagnostics: [],
    },
    previewSessionOptions: {
      spaceId: 'space',
      environmentId: 'env',
      previewToken: 'token',
      sessionId: 'session',
    },
    resolveOptions: { config: { components: {} } },
  });
  readonly livePreview = injectLivePreview(() => this.options());
}

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly close = vi.fn();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type: 'next', data }) });
  }
}

const payload = (title: string, sourceMap = minimalSourceMap()) => ({
  sys: { type: 'Experience' as const },
  nodes: [
    {
      id: 'n',
      component: {
        sys: {
          type: 'ResourceLink' as const,
          linkType: 'Contentful:Component' as const,
          urn: 'crn:contentful:::experience:components/hero',
        },
      },
      contentProperties: { title },
    },
  ],
  extensions: { sourceMap },
});

describe('injectLivePreview inspection', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  it('changes source-map-only subscription options while inspection stays disabled', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fixture = createFixture(IntegratedInspectionProbe);
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    expect(new URL(FakeSocket.instances[0]!.url).searchParams.has('source_map')).toBe(false);
    fixture.componentInstance.options.update((options) => ({
      ...options,
      previewSessionOptions: { ...options.previewSessionOptions!, sourceMap: true },
    }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(new URL(FakeSocket.instances[1]!.url).searchParams.get('source_map')).toBe('true');
    fixture.componentInstance.options.update((options) => ({
      ...options,
      previewSessionOptions: { ...options.previewSessionOptions!, sourceMap: false },
    }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(3));
    expect(new URL(FakeSocket.instances[2]!.url).searchParams.has('source_map')).toBe(false);
    expect(geometryMessages(postMessage)).toEqual([]);
    fixture.destroy();
  });
  it('requests source maps and observes the committed render when enabled', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fixture = createFixture(IntegratedInspectionProbe);
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const latest = payload('latest', minimalSourceMap({ experienceId: 'latest' }));
    FakeSocket.instances[0]!.emit(latest);
    await vi.waitFor(() => expect(fixture.nativeElement.textContent.trim()).toBe('latest'));
    const committedMap = fixture.componentInstance.livePreview.data()!.sourceMap;

    fixture.componentInstance.options.update((options) => ({ ...options, inspection: true }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(geometryMessages(postMessage).length).toBeGreaterThan(0));
    expect(geometryMessages(postMessage).at(-1)!.payload.sourceMap).toBe(committedMap);
    expect(fixture.nativeElement.textContent.trim()).toBe('latest');
    expect(new URL(FakeSocket.instances.at(-1)!.url).searchParams.get('source_map')).toBe('true');
    expect(FakeSocket.instances[0]!.close).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('toggles inspection without restarting an existing source-map subscription', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fixture = createFixture(IntegratedInspectionProbe, (probe) => {
      probe.options.update((options) => ({
        ...options,
        initialPayload: { ...payload('original'), extensions: undefined },
        initialPlan: { ...options.initialPlan!, sourceMap: undefined },
        previewSessionOptions: { ...options.previewSessionOptions!, sourceMap: true },
      }));
    });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0]!;
    socket.emit({ ...payload('current'), extensions: undefined });
    await vi.waitFor(() => expect(fixture.nativeElement.textContent.trim()).toBe('current'));

    fixture.componentInstance.options.update((options) => ({ ...options, inspection: true }));
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(geometryMessages(postMessage).at(-1)?.payload).toMatchObject({
        sourceMap: null,
        nodes: {},
      })
    );
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent.trim()).toBe('current');

    const mapped = payload('mapped', minimalSourceMap({ experienceId: 'mapped' }));
    socket.emit(mapped);
    await vi.waitFor(() => expect(fixture.nativeElement.textContent.trim()).toBe('mapped'));
    await vi.waitFor(() =>
      expect(geometryMessages(postMessage).at(-1)?.payload.sourceMap).toEqual(
        mapped.extensions.sourceMap
      )
    );
    fixture.componentInstance.options.update((options) => ({ ...options, inspection: false }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent.trim()).toBe('mapped');
    fixture.destroy();
  });

  it('retains the committed DOM and map across rejected and superseded updates', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const pending = new Map<
      string,
      { resolve(value: Record<string, unknown>): void; reject(error: Error): void }
    >();
    const fixture = createFixture(IntegratedInspectionProbe, (probe) => {
      probe.options.update((options) => ({
        ...options,
        inspection: true,
        resolveOptions: {
          config: {
            components: {
              hero: {
                resolveData: (context: ResolveContext) =>
                  new Promise<Record<string, unknown>>((resolve, reject) => {
                    pending.set(context.content.title as string, { resolve, reject });
                  }),
              },
            },
          },
        },
      }));
    });
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    await vi.waitFor(() => expect(geometryMessages(postMessage).length).toBeGreaterThan(0));
    const initialMap = fixture.componentInstance.livePreview.data()!.sourceMap;
    FakeSocket.instances[0]!.emit(
      payload('rejected', minimalSourceMap({ experienceId: 'rejected' }))
    );
    await vi.waitFor(() => expect(pending.has('rejected')).toBe(true));
    pending.get('rejected')!.reject(new Error('resolver failed'));
    await fixture.whenStable();
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => expect(geometryMessages(postMessage).length).toBeGreaterThan(1));
    expect(fixture.nativeElement.textContent.trim()).toBe('initial');
    expect(geometryMessages(postMessage).at(-1)!.payload.sourceMap).toBe(initialMap);

    FakeSocket.instances[0]!.emit(
      payload('superseded', minimalSourceMap({ experienceId: 'superseded' }))
    );
    await vi.waitFor(() => expect(pending.has('superseded')).toBe(true));
    const latest = payload('latest', minimalSourceMap({ experienceId: 'latest' }));
    FakeSocket.instances[0]!.emit(latest);
    await vi.waitFor(() => expect(pending.has('latest')).toBe(true));
    pending.get('latest')!.resolve({});
    await vi.waitFor(() => expect(fixture.nativeElement.textContent.trim()).toBe('latest'));
    await vi.waitFor(() =>
      expect(geometryMessages(postMessage).at(-1)!.payload.sourceMap).toEqual(
        latest.extensions.sourceMap
      )
    );
    pending.get('superseded')!.resolve({});
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe('latest');
    expect(fixture.componentInstance.livePreview.data()!.sourceMap).toEqual(
      latest.extensions.sourceMap
    );
    fixture.destroy();
  });
  it('stops integrated inspection on disable and destroy without clearing the canvas', async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fixture = createFixture(IntegratedInspectionProbe, (probe) => {
      probe.options.update((options) => ({
        ...options,
        inspection: true,
        previewSessionOptions: { ...options.previewSessionOptions!, sourceMap: true },
      }));
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage).length).toBeGreaterThan(0);
    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    fixture.componentInstance.options.update((options) => ({ ...options, inspection: false }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage)).toEqual([]);
    fixture.componentInstance.options.update((options) => ({ ...options, inspection: true }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage).length).toBeGreaterThan(0);
    postMessage.mockClear();
    window.dispatchEvent(new Event('resize'));
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(500);
    expect(geometryMessages(postMessage)).toEqual([]);
  });
});
