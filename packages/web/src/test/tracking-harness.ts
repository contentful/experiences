import { vi } from 'vitest';
import { createInteractionTracking } from '../tracking/interaction-tracking.js';
import { ElementHoverObserver } from '../tracking/hover/element-hover-observer.js';
import type { ElementHoverCallbackInfo } from '../tracking/hover/element-hover-observer.js';
import { ElementViewObserver } from '../tracking/view/element-view-observer.js';
import type { ElementViewCallbackInfo } from '../tracking/view/element-view-observer-support.js';
import { makeElement } from './dom.js';

export function createTrackingEvents() {
  return {
    trackView: vi.fn().mockResolvedValue(true),
    trackHover: vi.fn().mockResolvedValue(true),
    trackClick: vi.fn().mockResolvedValue(true),
  };
}

/** Constructs the coordinator after the caller has arranged its DOM and attribution. */
export function createInteractionHarness() {
  const events = createTrackingEvents();
  return { events, tracking: createInteractionTracking(events) };
}

export function observeHover(...elements: Element[]) {
  const members = elements.length ? elements : [makeElement()];
  const cb = vi
    .fn<(info: ElementHoverCallbackInfo) => Promise<void>>()
    .mockResolvedValue(undefined);
  const observer = new ElementHoverObserver(cb);
  for (const element of members) observer.observe(element);
  return { cb, observer, element: members[0]! };
}

export function observeView(...elements: Element[]) {
  const members = elements.length ? elements : [makeElement()];
  const cb = vi.fn<(info: ElementViewCallbackInfo) => Promise<void>>().mockResolvedValue(undefined);
  const observer = new ElementViewObserver(cb);
  for (const element of members) observer.observe(element);
  return { cb, observer, element: members[0]! };
}

export function click(target: Node): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

export function enter(element: Element, pointerType = 'mouse'): void {
  element.dispatchEvent(new PointerEvent('pointerenter', { pointerType }));
}

export function leave(element: Element, pointerType = 'mouse'): void {
  element.dispatchEvent(new PointerEvent('pointerleave', { pointerType }));
}
