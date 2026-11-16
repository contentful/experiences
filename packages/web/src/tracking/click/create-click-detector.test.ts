import type { TrackingAttribution } from '../attribution.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, makeElement, setDocumentVisibility } from '../../test/dom.js';
import { TRACKING_SCOPES_ATTRIBUTE } from '../../tracking-attributes.js';
import { EXPERIENCE, FRAGMENT } from '../../test/fixtures/tracking-attribution.js';
import { keyOf, lookup, click, resetDetectorKeys } from '../../test/detectors.js';
import { createClickDetector } from './create-click-detector.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  setDocumentVisibility('visible');
});

afterEach(() => {
  resetDetectorKeys();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('createClickDetector', () => {
  const setup = (entries: [Element, TrackingAttribution][]) => {
    const trackClick = vi.fn().mockResolvedValue(true);
    const detector = createClickDetector(trackClick, lookup(new Map(entries)));
    for (const [element] of entries) {
      element.setAttribute(TRACKING_SCOPES_ATTRIBUTE, keyOf(element));
      detector.onElementAdded(element, keyOf(element));
    }
    detector.start();
    return { trackClick, detector };
  };

  it('sends a click on interactive content inside a Fragment', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0]).toMatchObject({ entityId: 'hero', variantIndex: 1 });
  });

  it('logs rather than throws when trackClick rejects', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick } = setup([[fragment, FRAGMENT]]);
    trackClick.mockRejectedValue(new Error('no profile'));

    click(button);
    await advance(0);

    expect(error).toHaveBeenCalledWith(
      '[@contentful/experiences] Error in click tracking:',
      expect.objectContaining({ message: 'no profile' })
    );
  });

  it("sends only attribution fields, dropping extra properties on the caller's object", () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const withExtras = {
      ...FRAGMENT,
      trackingRoot: true,
      internalNote: 'x',
    } as TrackingAttribution;
    const { trackClick } = setup([[fragment, withExtras]]);

    click(button);

    expect(Object.keys(trackClick.mock.calls[0]![0]).sort()).toEqual(
      [
        'entityId',
        'entityKind',
        'entityKindId',
        'entryIds',
        'optimizationId',
        'parentExperienceId',
        'parentVariantId',
        'variantId',
        'variantIndex',
      ].sort()
    );
  });

  it('ignores clicks on non-interactive content', () => {
    const fragment = makeElement();
    const text = document.createElement('p');
    fragment.append(text);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(text);
    click(fragment);

    expect(trackClick).not.toHaveBeenCalled();
  });

  it('counts opted-in and onclick-handled content as interactive', () => {
    const fragment = makeElement();
    const optedIn = document.createElement('div');
    optedIn.setAttribute('data-ctfl-clickable', 'true');
    const handled = document.createElement('div');
    handled.onclick = () => undefined;
    fragment.append(optedIn, handled);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(optedIn);
    click(handled);

    expect(trackClick).toHaveBeenCalledTimes(2);
  });

  it('resolves a click on a text node to its parent element', () => {
    const fragment = makeElement();
    const link = document.createElement('a');
    link.href = '#';
    const text = document.createTextNode('Read more');
    link.append(text);
    fragment.append(link);
    const { trackClick } = setup([[fragment, FRAGMENT]]);

    click(text);

    expect(trackClick).toHaveBeenCalledTimes(1);
  });

  it('attributes a click to the nearest tracked element only', () => {
    const outer = makeElement();
    const inner = document.createElement('div');
    const button = document.createElement('button');
    inner.append(button);
    outer.append(inner);
    const { trackClick } = setup([
      [outer, { ...FRAGMENT, entityId: 'outer' }],
      [inner, { ...FRAGMENT, entityId: 'inner' }],
    ]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0].entityId).toBe('inner');
  });

  it('attributes a click in a Fragment nested in an Experience to the Fragment', () => {
    const experience = makeElement();
    const fragment = document.createElement('div');
    const button = document.createElement('button');
    fragment.append(button);
    experience.append(fragment);
    const { trackClick } = setup([
      [experience, EXPERIENCE],
      [fragment, FRAGMENT],
    ]);

    click(button);

    expect(trackClick).toHaveBeenCalledTimes(1);
    expect(trackClick.mock.calls[0]![0].entityKind).toBe('ExperienceFragment');
  });

  it('never sends clicks for an Experience', () => {
    const experience = makeElement();
    const button = document.createElement('button');
    experience.append(button);
    const { trackClick } = setup([[experience, EXPERIENCE]]);

    click(button);

    expect(trackClick).not.toHaveBeenCalled();
  });

  it('keeps tracking an element handed over under two keys until both are removed', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    fragment.setAttribute(TRACKING_SCOPES_ATTRIBUTE, 'outer inner');
    const trackClick = vi.fn().mockResolvedValue(true);
    const detector = createClickDetector(trackClick, (key) => ({ ...FRAGMENT, entityId: key }));
    detector.onElementAdded(fragment, 'outer');
    detector.onElementAdded(fragment, 'inner');
    detector.start();

    detector.onElementRemoved(fragment, 'outer');
    click(button);
    expect(trackClick).toHaveBeenCalledTimes(1);

    detector.onElementRemoved(fragment, 'inner');
    click(button);
    expect(trackClick).toHaveBeenCalledTimes(1);
  });

  it('stops attributing removed elements and listening after stop', () => {
    const fragment = makeElement();
    const button = document.createElement('button');
    fragment.append(button);
    const { trackClick, detector } = setup([[fragment, FRAGMENT]]);

    detector.onElementRemoved(fragment, keyOf(fragment));
    click(button);
    detector.onElementAdded(fragment, keyOf(fragment));
    detector.stop();
    click(button);

    expect(trackClick).not.toHaveBeenCalled();
  });
});
