import type { ClickBuilderArgs } from '@contentful/experiences-client';

import {
  type InteractionDetector,
  isFragment,
  type ResolveElementAttribution,
  sendSafely,
  toInteractionArgs,
} from '../interaction-detector.js';

/** Elements a visitor can meaningfully click. `data-ctfl-clickable` opts others in. */
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
  '[data-ctfl-clickable="true"]',
].join(',');

const hasOnclickPropertyHandler = (element: Element): boolean =>
  element instanceof HTMLElement && typeof element.onclick === 'function';

const toEventTargetElement = (event: Event): Element | undefined => {
  if (event.target instanceof Element) return event.target;
  return event.target instanceof Node ? (event.target.parentElement ?? undefined) : undefined;
};

export function createClickDetector(
  trackClick: (args: ClickBuilderArgs) => Promise<unknown>,
  resolveAttribution: ResolveElementAttribution
): InteractionDetector {
  const trackedElements = new Set<Element>();
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

    const attribution = resolveAttribution(trackedElement);
    if (!attribution || !isFragment(attribution)) return;

    void sendSafely('trackClick', attribution, () => trackClick(toInteractionArgs(attribution)));
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
      trackedElements.add(element);
    },
    onElementRemoved(element) {
      trackedElements.delete(element);
    },
  };
}
