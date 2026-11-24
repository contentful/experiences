import type { ExperienceSourceMap } from '@contentful/experiences-sdk-core';
import { isRecord } from './experience-payload.js';

export interface CanvasGeometryMessage {
  source: 'customer-app';
  eventType: 'canvasGeometryUpdated';
  payload: {
    size: { width: number; height: number };
    nodes: Record<string, { coordinates: { x: number; y: number; width: number; height: number } }>;
    sourceMap: ExperienceSourceMap | null;
  };
}

function bodyContentHeight(node: Element): number {
  let height = 0;
  for (const element of Array.from(node.children)) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (
      (rect.width === 0 && rect.height === 0) ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      (['fixed', 'absolute', 'relative', 'sticky'].includes(style.position) &&
        parseFloat(style.bottom) < 0)
    ) {
      continue;
    }
    height = Math.max(
      height,
      rect.bottom + window.scrollY + Math.max(0, parseFloat(style.marginBottom) || 0),
      ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY || style.overflow)
        ? 0
        : bodyContentHeight(element)
    );
  }
  return height;
}

export interface PreviewGeometryOptions {
  sourceMap: ExperienceSourceMap | null | undefined;
}

export function observePreviewGeometry({
  sourceMap: candidate,
}: PreviewGeometryOptions): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  let disposed = false;
  let animationFrame: number | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let trailing = false;
  const markedElements = () => document.querySelectorAll('[data-cf-node-id]');

  const measure = () => {
    animationFrame = undefined;
    if (disposed) return;
    const sourceMap =
      isRecord(candidate?.nodes) && !Array.isArray(candidate.nodes) ? candidate : null;
    const nodes: CanvasGeometryMessage['payload']['nodes'] = Object.create(null);
    const seen = new Set<string>();
    if (sourceMap) {
      for (const element of Array.from(markedElements())) {
        const nodeId = element.getAttribute('data-cf-node-id')!;
        if (!Object.hasOwn(sourceMap.nodes, nodeId)) continue;
        if (seen.has(nodeId)) {
          delete nodes[nodeId];
          continue;
        }
        seen.add(nodeId);
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (
          (rect.width === 0 && rect.height === 0) ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        )
          continue;
        nodes[nodeId] = {
          coordinates: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          },
        };
      }
    }

    const rootRect = document.documentElement.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const height = Math.max(
      document.body.offsetHeight,
      bodyRect.bottom +
        window.scrollY +
        Math.max(0, parseFloat(window.getComputedStyle(document.body).marginBottom) || 0),
      bodyContentHeight(document.body)
    );
    const message: CanvasGeometryMessage = {
      source: 'customer-app',
      eventType: 'canvasGeometryUpdated',
      payload: {
        size: {
          width: Math.ceil(
            Math.max(document.documentElement.offsetWidth, rootRect.width, bodyRect.width)
          ),
          height: Math.ceil(height),
        },
        nodes,
        sourceMap,
      },
    };
    window.parent.postMessage(message, '*');
  };

  const queueFrame = () => {
    if (animationFrame === undefined) animationFrame = requestAnimationFrame(measure);
  };
  const schedule = () => {
    if (disposed) return;
    if (debounceTimer === undefined) queueFrame();
    else trailing = true;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      if (trailing) {
        trailing = false;
        queueFrame();
      }
    }, 100);
  };
  const resizeObserver =
    typeof globalThis.ResizeObserver === 'undefined'
      ? undefined
      : new globalThis.ResizeObserver(schedule);
  const observeElements = () => {
    resizeObserver?.disconnect();
    resizeObserver?.observe(document.documentElement);
    resizeObserver?.observe(document.body);
    for (const element of Array.from(document.querySelectorAll('[data-cf-node-id], img, video')))
      resizeObserver?.observe(element);
  };
  const mutationObserver = new MutationObserver(() => {
    observeElements();
    schedule();
  });
  mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  observeElements();
  window.addEventListener('resize', schedule);
  document.addEventListener('load', schedule, true);
  void document.fonts?.ready.then(schedule);
  schedule();

  return () => {
    disposed = true;
    clearTimeout(debounceTimer);
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('load', schedule, true);
  };
}
