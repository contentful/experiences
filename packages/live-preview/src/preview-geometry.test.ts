import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { observePreviewGeometry, type CanvasGeometryMessage } from './index.js';
import { inspectorPayload } from './test-fixtures/inspector.js';

const sourceMap = inspectorPayload.extensions!.sourceMap!;
let cleanups: Array<() => void>;
let postMessage: ReturnType<typeof vi.spyOn>;
let resize: (element: Element) => void;

function mark(id: string, rect = new globalThis.DOMRect(20, 30, 200, 48)) {
  const element = document.createElement('div');
  element.setAttribute('data-cf-node-id', id);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  document.body.append(element);
  return element;
}

function observe(map: unknown = sourceMap) {
  const stop = observePreviewGeometry({ sourceMap: map as ExperienceSourceMap });
  cleanups.push(stop);
  return stop;
}

async function frame(milliseconds = 116) {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(milliseconds);
}

function snapshot() {
  return (postMessage.mock.lastCall![0] as CanvasGeometryMessage).payload;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  document.body.style.cssText = 'margin: 0';
  cleanups = [];
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
    window.setTimeout(() => callback(0), 16)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  const observers: Array<{ targets: Set<Element>; notify: () => void }> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      targets = new Set<Element>();
      constructor(notify: () => void) {
        observers.push({ targets: this.targets, notify });
      }
      observe(element: Element) {
        this.targets.add(element);
      }
      disconnect() {
        this.targets.clear();
      }
    }
  );
  resize = (element) => {
    for (const observer of observers) {
      if (observer.targets.has(element)) observer.notify();
    }
  };
});

afterEach(() => {
  cleanups.forEach((stop) => stop());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('observePreviewGeometry', () => {
  it('posts complete document-pixel snapshots with only mapped roots and the unchanged full map', async () => {
    vi.stubGlobal('scrollX', 4);
    vi.stubGlobal('scrollY', 10);
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 801, 2000)
    );
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 150)
    );
    mark('rendered-first');
    const second = mark('rendered-second', new globalThis.DOMRect(230, 30, 100, 48));
    mark('unmapped');
    observe();
    await frame();
    expect(postMessage.mock.lastCall).toEqual([
      {
        source: 'customer-app',
        eventType: 'canvasGeometryUpdated',
        payload: {
          size: { width: 801, height: 160 },
          nodes: {
            'rendered-first': { coordinates: { x: 24, y: 40, width: 200, height: 48 } },
            'rendered-second': { coordinates: { x: 234, y: 40, width: 100, height: 48 } },
          },
          sourceMap,
        },
      },
      '*',
    ]);
    expect(snapshot().sourceMap).toBe(sourceMap);

    second.remove();
    await frame();
    expect(Object.keys(snapshot().nodes)).toEqual(['rendered-first']);
  });

  it('reports mapped runtime IDs that share names with Object properties', async () => {
    const ids = ['__proto__', 'constructor', 'toString'];
    for (const id of ids) mark(id);
    observe({ ...sourceMap, nodes: Object.fromEntries(ids.map((id) => [id, {}])) });
    await frame();

    expect(Object.keys(snapshot().nodes)).toEqual(ids);
    expect(snapshot().nodes['__proto__']).toEqual({
      coordinates: { x: 20, y: 30, width: 200, height: 48 },
    });
  });

  it.each([undefined, null, {}, { nodes: null }, { nodes: [] }, { nodes: 42 }, { nodes: 'bad' }])(
    'clears targets for an absent or unusable node table %j',
    async (map) => {
      mark('rendered-first');
      cleanups.push(observePreviewGeometry({ sourceMap: map as unknown as ExperienceSourceMap }));
      await frame();
      expect(snapshot()).toMatchObject({ nodes: {}, sourceMap: null });
    }
  );

  it.each(['hidden', 'clip', 'auto', 'scroll'])(
    'keeps document sizing within a fixed-height wrapper with overflow %s',
    async (overflow) => {
      vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
        new globalThis.DOMRect(0, 0, 800, 100)
      );
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `height: 100px; margin-bottom: 20px; overflow-y: ${overflow}`;
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(
        new globalThis.DOMRect(0, 0, 200, 100)
      );
      wrapper.append(mark('rendered-first', new globalThis.DOMRect(0, 0, 200, 1000)));
      document.body.append(wrapper);

      observe();
      await frame();
      expect(snapshot().size.height).toBe(120);
      expect(snapshot().nodes['rendered-first']!.coordinates.height).toBe(1000);
    }
  );

  it('uses node membership without validating or changing other source-map fields', async () => {
    const map = { version: 42, nodes: { 'rendered-first': null }, extra: ['untouched'] };
    mark('rendered-first');
    observe(map);
    await frame();
    expect(snapshot().sourceMap).toBe(map);
    expect(Object.keys(snapshot().nodes)).toEqual(['rendered-first']);
  });

  it('excludes every duplicate marked root even when one is hidden, and recovers after removal', async () => {
    mark('rendered-first', new globalThis.DOMRect());
    const visible = mark('rendered-first');
    observe();
    await frame();
    expect(snapshot().nodes).toEqual({});

    visible.previousElementSibling!.remove();
    await frame();
    expect(snapshot().nodes).toEqual({
      'rendered-first': { coordinates: { x: 20, y: 30, width: 200, height: 48 } },
    });
  });

  it('debounces layout bursts with leading and trailing animation-frame snapshots', async () => {
    observe();
    await frame(16);
    expect(postMessage).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new Event('resize'));
      await frame(20);
    }
    expect(postMessage).toHaveBeenCalledTimes(1);
    await frame();
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('refreshes after media resize and head stylesheet changes without a root resize', async () => {
    const element = mark('rendered-first');
    const image = document.createElement('img');
    element.append(image);
    observe();
    await frame();
    vi.mocked(element.getBoundingClientRect).mockReturnValue(
      new globalThis.DOMRect(20, 50, 200, 48)
    );
    resize(image);
    await frame();
    expect(snapshot().nodes['rendered-first']!.coordinates.y).toBe(50);

    vi.mocked(element.getBoundingClientRect).mockReturnValue(
      new globalThis.DOMRect(20, 70, 200, 48)
    );
    const style = document.createElement('style');
    document.head.append(style);
    await frame();
    expect(snapshot().nodes['rendered-first']!.coordinates.y).toBe(70);
    style.remove();
  });

  it('refreshes on resize, media load, and font readiness, without tracking scroll or animation frames', async () => {
    let fontsReady!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          fontsReady = resolve;
        }),
      },
    });
    const element = mark('rendered-first');
    observe();
    await frame();
    for (const [y, notify] of [
      [50, () => resize(element)],
      [70, () => document.dispatchEvent(new Event('load'))],
      [90, () => fontsReady()],
    ] as const) {
      vi.mocked(element.getBoundingClientRect).mockReturnValue(
        new globalThis.DOMRect(20, y, 200, 48)
      );
      notify();
      await frame();
      expect(snapshot().nodes['rendered-first']!.coordinates.y).toBe(y);
    }
    const count = postMessage.mock.calls.length;
    window.dispatchEvent(new Event('scroll'));
    await frame(1000);
    expect(postMessage).toHaveBeenCalledTimes(count);
    Reflect.deleteProperty(document, 'fonts');
  });

  it('measures fixed, absolute, sticky, and negative-bottom roots while guarding document height feedback', async () => {
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 100)
    );
    const map = { ...sourceMap, nodes: { fixed: {}, absolute: {}, sticky: {}, anchored: {} } };
    for (const [id, position, y, bottom] of [
      ['fixed', 'fixed', 100, 'auto'],
      ['absolute', 'absolute', 200, 'auto'],
      ['sticky', 'sticky', 300, 'auto'],
      ['anchored', 'relative', 1000, '-10px'],
    ] as const) {
      const element = mark(id!, new globalThis.DOMRect(20, Number(y), 200, 48));
      element.style.position = position!;
      element.style.bottom = bottom!;
    }
    observe(map);
    await frame();
    expect(snapshot().size.height).toBe(348);
    expect(Object.keys(snapshot().nodes)).toEqual(['fixed', 'absolute', 'sticky', 'anchored']);
    expect(snapshot().nodes.anchored!.coordinates.y).toBe(1000);
  });

  it('reports content growth and shrinkage including collapsed bottom margins without a viewport height floor', async () => {
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(
      new globalThis.DOMRect(0, 0, 800, 2000)
    );
    const bodyRect = vi
      .spyOn(document.body, 'getBoundingClientRect')
      .mockReturnValue(new globalThis.DOMRect(0, 0, 800, 100));
    const element = mark('rendered-first', new globalThis.DOMRect(0, 0, 200, 100));
    element.style.marginBottom = '40px';
    observe();
    await frame();
    expect(snapshot().size.height).toBe(140);

    vi.mocked(element.getBoundingClientRect).mockReturnValue(
      new globalThis.DOMRect(0, 0, 200, 500)
    );
    bodyRect.mockReturnValue(new globalThis.DOMRect(0, 0, 800, 500));
    resize(element);
    await frame();
    expect(snapshot().size.height).toBe(540);

    vi.mocked(element.getBoundingClientRect).mockReturnValue(new globalThis.DOMRect(0, 0, 200, 40));
    bodyRect.mockReturnValue(new globalThis.DOMRect(0, 0, 800, 40));
    resize(element);
    await frame();
    expect(snapshot().size.height).toBe(80);
  });

  it.each([
    { wrappers: 2, bodyMargin: 0, bottomMargin: 40, expectedHeight: 140 },
    { wrappers: 0, bodyMargin: 8, bottomMargin: 0, expectedHeight: 116 },
  ])(
    'includes document bottom margins through $wrappers framework wrappers with body margin $bodyMargin',
    async ({ wrappers, bodyMargin, bottomMargin, expectedHeight }) => {
      document.body.style.margin = `${bodyMargin}px`;
      vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(
        new globalThis.DOMRect(bodyMargin, bodyMargin, 800, 100)
      );
      const element = mark(
        'rendered-first',
        new globalThis.DOMRect(bodyMargin, bodyMargin, 200, 100)
      );
      element.style.marginBottom = `${bottomMargin}px`;
      let content = element;
      for (let i = 0; i < wrappers; i++) {
        const wrapper = document.createElement('div');
        vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(
          new globalThis.DOMRect(bodyMargin, bodyMargin, 200, 100)
        );
        wrapper.append(content);
        content = wrapper;
      }
      document.body.append(content);

      observe();
      await frame();
      expect(snapshot().size.height).toBe(expectedHeight);
    }
  );

  it('cancels pending debounce, animation, observer, load, and font work without a clearing snapshot', async () => {
    let fontsReady!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          fontsReady = resolve;
        }),
      },
    });
    const element = mark('rendered-first');
    const stop = observe();
    await frame(16);
    const last = snapshot();
    window.dispatchEvent(new Event('resize'));
    stop();
    fontsReady();
    resize(element);
    document.dispatchEvent(new Event('load'));
    element.remove();
    await frame(1000);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(snapshot()).toBe(last);

    const cancelBeforeFirstFrame = observe();
    cancelBeforeFirstFrame();
    await frame();
    expect(postMessage).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document, 'fonts');
  });
});
