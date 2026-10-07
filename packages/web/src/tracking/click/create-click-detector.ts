import type { ClickBuilderArgs } from '@contentful/experiences-client';

import {
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from '../../tracking-attributes.js';
import {
  type InteractionDetector,
  isFragment,
  type ResolveScopeAttribution,
  toInteractionArgs,
} from '../interaction-detector.js';

/** Elements a visitor can meaningfully click. `TRACKING_CLICKABLE_ATTRIBUTE` opts others in. */
const CLICKABLE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[onclick]',
  `[${TRACKING_CLICKABLE_ATTRIBUTE}="true"]`,
].join(',');

const hasOnclickPropertyHandler = (element: Element): boolean =>
  element instanceof HTMLElement && typeof element.onclick === 'function';

const toEventTargetElement = (event: Event): Element | undefined => {
  if (event.target instanceof Element) return event.target;
  return event.target instanceof Node ? (event.target.parentElement ?? undefined) : undefined;
};

export function createClickDetector(
  trackClick: (args: ClickBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveScopeAttribution
): InteractionDetector {
  /**
   * Each tracked element with how many scope occurrence keys it was handed over
   * under. The keys themselves are read from the element's attribute at click
   * time: re-adding a key after a refresh must not change their outer-to-inner order.
   */
  const trackedElements = new Map<Element, number>();
  let listening = false;

  /** The nearest tracked element on the path, and whether the path is clickable. */
  const resolveClickContext = (
    eventTarget: Element
  ): { trackedElement?: Element; hasClickablePath: boolean } => {
    const hasClickableSelectorPath = eventTarget.closest(CLICKABLE_SELECTOR) !== null;
    let hasOnclickPropertyPath = false;
    let trackedElement: Element | undefined;
    let current: Element | null = eventTarget;

    while (current) {
      if (!trackedElement && trackedElements.has(current)) trackedElement = current;

      if (!hasClickableSelectorPath && !hasOnclickPropertyPath) {
        hasOnclickPropertyPath = hasOnclickPropertyHandler(current);
      }

      if (trackedElement && (hasClickableSelectorPath || hasOnclickPropertyPath)) break;

      current = current.parentElement;
    }

    return { trackedElement, hasClickablePath: hasClickableSelectorPath || hasOnclickPropertyPath };
  };

  const onDocumentClick = (event: MouseEvent): void => {
    const eventTarget = toEventTargetElement(event);
    if (!eventTarget) return;

    const { trackedElement, hasClickablePath } = resolveClickContext(eventTarget);
    if (!trackedElement || !hasClickablePath) return;

    // Clicks go to the innermost Fragment occurrence the nearest tracked element
    // roots; an Experience is view-only.
    let attribution: ReturnType<ResolveScopeAttribution>;
    const keys = trackedElement.getAttribute(TRACKING_SCOPES_ATTRIBUTE) ?? '';
    for (const key of keys.split(/\s+/).filter(Boolean)) {
      const candidate = resolveAttribution(key);
      if (candidate && isFragment(candidate)) attribution = candidate;
    }
    if (!attribution) return;

    // Unlike views and hovers, no observer wraps this send, so catch here.
    trackClick(toInteractionArgs(attribution)).catch((error: unknown) => {
      console.error('[@contentful/experiences] Error in click tracking:', error);
    });
  };

  return {
    start() {
      if (listening || typeof document === 'undefined') return;
      document.addEventListener('click', onDocumentClick, true);
      listening = true;
    },
    stop() {
      if (listening) document.removeEventListener('click', onDocumentClick, true);
      listening = false;
      trackedElements.clear();
    },
    onElementAdded(element) {
      trackedElements.set(element, (trackedElements.get(element) ?? 0) + 1);
    },
    onElementRemoved(element) {
      const count = trackedElements.get(element);
      if (count === undefined) return;
      if (count > 1) trackedElements.set(element, count - 1);
      else trackedElements.delete(element);
    },
  };
}
