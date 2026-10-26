// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInteractionTracking } from './interaction-tracking.js';
import { getTrackingAttributes, TRACKING_CLICKABLE_ATTRIBUTE } from './tracking-attributes.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tracking attributes with the runtime', () => {
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
