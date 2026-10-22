// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { getTrackingAttributes, TRACKING_CLICKABLE_ATTRIBUTE } from './tracking-attributes.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tracking attributes with the runtime', () => {
  it('round-trips JSON attribution through DOM and HTML serialization without creating markup', () => {
    const entityId = 'hero"<&\'\n\u2028</section><script>not markup</script>';
    const container = document.createElement('section');
    const attributes = getTrackingAttributes({
      scopes: { hero: { key: 'hero', entityId, entityKind: 'ExperienceFragment' } },
    });
    container.setAttribute('data-ctfl-attribution', attributes['data-ctfl-attribution']!);

    const parsed = new window.DOMParser().parseFromString(container.outerHTML, 'text/html');
    expect(
      JSON.parse(parsed.querySelector('section')!.dataset.ctflAttribution!).scopes.hero
    ).toEqual({ entityId, entityKind: 'ExperienceFragment' });
    expect(parsed.querySelector('script')).toBeNull();
  });

  it('marks elements the runtime discovers, and opts non-interactive content into clicks', () => {
    const fragment = document.createElement('div');
    for (const [name, value] of Object.entries(
      getTrackingAttributes({ roots: [{ key: 'node:hero' }] })
    )) {
      fragment.setAttribute(name, value);
    }
    const card = document.createElement('div');
    card.setAttribute(TRACKING_CLICKABLE_ATTRIBUTE, 'true');
    fragment.append(card);
    const container = document.createElement('section');
    for (const [name, value] of Object.entries(
      getTrackingAttributes({
        scopes: {
          'node:hero': {
            key: 'node:hero',
            entityId: 'hero',
            entityKind: 'ExperienceFragment',
          },
        },
      })
    ))
      container.setAttribute(name, value);
    container.append(fragment);
    document.body.append(container);
    const trackClick = vi.fn().mockResolvedValue(true);

    const tracking = createInteractionTracking(
      { trackView: vi.fn(), trackHover: vi.fn(), trackClick },
      {
        views: false,
      }
    );
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(trackClick).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'hero' }));
    tracking.destroy();
  });
});
