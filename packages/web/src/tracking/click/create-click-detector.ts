import type { ClickBuilderArgs } from '@contentful/experiences-runtime';

import {
  TRACKING_CLICKABLE_ATTRIBUTE,
  TRACKING_SCOPES_ATTRIBUTE,
} from '../../tracking-attributes.js';
import {
  type InteractionDetector,
  type InteractionKey,
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

export function createClickDetector<TKey extends InteractionKey = string>(
  trackClick: (args: ClickBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveScopeAttribution<TKey>
): InteractionDetector<TKey> {
  /**
   * Admitted scope keys for each element, including attribute-free manual data.
   * Automatic keys retain their DOM order so the innermost Fragment wins.
   */
  const trackedElements = new Map<Element, Set<TKey>>();
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
    // roots
    let attribution: ReturnType<ResolveScopeAttribution<TKey>>;
    const admitted = trackedElements.get(trackedElement)!;
    const automaticOrder = (trackedElement.getAttribute(TRACKING_SCOPES_ATTRIBUTE) ?? '').split(
      /\s+/
    );
    const keys = [...admitted]
      .filter((key) => typeof key !== 'string' || automaticOrder.includes(key))
      .sort((left, right) =>
        typeof left === 'string' && typeof right === 'string'
          ? automaticOrder.indexOf(left) - automaticOrder.indexOf(right)
          : 0
      );
    for (const key of keys) {
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
    onElementAdded(element, key) {
      const keys = trackedElements.get(element) ?? new Set<TKey>();
      keys.add(key);
      trackedElements.set(element, keys);
    },
    onElementRemoved(element, key) {
      const keys = trackedElements.get(element);
      keys?.delete(key);
      if (keys?.size === 0) trackedElements.delete(element);
    },
  };
}
