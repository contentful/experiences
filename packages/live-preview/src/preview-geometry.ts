import type { ExperienceSourceMap, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import { isRecord } from './experience-payload.js';

interface CanvasGeometryMessage {
  source: 'customer-app';
  eventType: 'canvasGeometryUpdated';
  payload: {
    size: { width: number; height: number };
    nodes: Record<string, { coordinates: { x: number; y: number; width: number; height: number } }>;
    sourceMap: ExperienceSourceMap | null;
  };
}

// Like Studio, inspect shallow body content to include overflow outside the body box.
function bodyContentHeight(node: Element, depth = 2): number {
  if (depth === 0) return 0;
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
      bodyContentHeight(element, depth - 1)
    );
  }
  return height;
}

/** Observe a committed render plan. Each occurrence marks one root with data-cf-node-id. */
export function observePreviewGeometry(plan: PortableRenderPlan): () => void {
  let disposed = false;
  let animationFrame: number | undefined;
  const markedElements = () => document.querySelectorAll('[data-cf-node-id]');

  const measure = () => {
    animationFrame = undefined;
    if (disposed) return;
    const candidate = plan.sourceMap;
    const sourceMap =
      isRecord(candidate) &&
      !Array.isArray(candidate) &&
      isRecord(candidate.nodes) &&
      !Array.isArray(candidate.nodes)
        ? candidate
        : null;
    const nodes: CanvasGeometryMessage['payload']['nodes'] = Object.create(null);
    const duplicates = new Set<string>();
    if (sourceMap) {
      for (const element of Array.from(markedElements())) {
        const nodeId = element.getAttribute('data-cf-node-id')!;
        if (!Object.hasOwn(sourceMap.nodes, nodeId)) continue;
        if (Object.hasOwn(nodes, nodeId) || duplicates.has(nodeId)) {
          delete nodes[nodeId];
          duplicates.add(nodeId);
          continue;
        }
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
    // The root includes the iframe's viewport floor. Excluding its height lets content shrink.
    const height = Math.max(
      document.body.offsetHeight,
      bodyRect.bottom + window.scrollY,
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

  const schedule = () => {
    if (!disposed && animationFrame === undefined) animationFrame = requestAnimationFrame(measure);
  };
  const resizeObserver =
    typeof globalThis.ResizeObserver === 'undefined'
      ? undefined
      : new globalThis.ResizeObserver(schedule);
  const observeElements = () => {
    resizeObserver?.disconnect();
    resizeObserver?.observe(document.documentElement);
    resizeObserver?.observe(document.body);
    for (const element of Array.from(markedElements())) resizeObserver?.observe(element);
  };
  const mutationObserver = new MutationObserver(() => {
    observeElements();
    schedule();
  });
  mutationObserver.observe(document.body, {
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
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('load', schedule, true);
  };
}
