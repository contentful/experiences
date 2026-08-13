/*
 * Reactive viewport matcher. Port of adapter-svelte/src/use-active-viewport.svelte.ts.
 *
 * "Active viewport" = the last-matching media query in the ordered viewports
 * list. With desktop-first ordering (`*`, `<992px`, `<576px`), the narrowest
 * matching query wins. With mobile-first ordering, the widest wins. Either
 * way: the last `findLastIndex` of `mediaQueryMatches[i] === true`.
 *
 * Pass `initialViewportId` (typically derived from User-Agent on the server) to
 * seed the first render so SSR and the client agree on viewport before
 * `window.matchMedia` takes over.
 *
 * Why `afterNextRender` rather than `effect()`: it is browser-only by contract,
 * so nothing here touches `window` during server rendering, and it fires after
 * the first render has already committed. That preserves the seed-then-correct
 * ordering hydration needs — the first paint uses `initialViewportId`, matching
 * the server's HTML, and the real media-query state lands immediately after.
 */

import { DestroyRef, type Signal, afterNextRender, computed, inject, signal } from '@angular/core';

import { createMediaQueryMatchers, getViewportIndex } from '@contentful/experiences-design';
import type { ViewportDef } from '@contentful/experiences-sdk-core';

export interface InjectActiveViewportResult {
  readonly activeViewportIndex: Signal<number>;
}

/**
 * Returns a signal that tracks which viewport's media query currently matches.
 * Listeners mount after the first browser render and tear down with the calling
 * component.
 *
 * Must be called from an injection context — a field initializer or a
 * constructor — like any other `inject()`-based API. Both arguments are getters
 * rather than values, which is the Angular divergence from the React and Svelte
 * signatures: an injection context runs *before* inputs are bound, so a
 * component passing its own `@Input()` viewports has nothing to hand over yet.
 * Deferring the read to first render fixes that, and since every `Signal` is
 * already a getter, `injectActiveViewport(this.viewports)` works unchanged.
 *
 *   readonly experience = injectExperience();
 *   private readonly tracker = injectActiveViewport(() => this.experience().viewports);
 */
export function injectActiveViewport(
  viewports: () => ViewportDef[],
  initialViewportId?: () => string | undefined
): InjectActiveViewportResult {
  const destroyRef = inject(DestroyRef);

  // `null` means the browser has not taken over yet: on the server, and on the
  // client up to the first `afterNextRender`. Readers fall back to the seed.
  const matches = signal<boolean[] | null>(null);

  const activeViewportIndex = computed(() => {
    const seedIndex = getViewportIndex(viewports(), initialViewportId?.());
    const current = matches();
    if (!current) return seedIndex;
    const found = current.findLastIndex((isMatch) => isMatch);
    return found === -1 ? seedIndex : found;
  });

  afterNextRender(() => {
    const [matchers, seeded] = createMediaQueryMatchers(viewports());

    // Sync once on mount, in case the initial index came from the server.
    matches.set(
      matchers.reduce<boolean[]>(
        (acc, { index, signal: mediaQuery }) => {
          acc[index] = mediaQuery.matches;
          return acc;
        },
        [...seeded]
      )
    );

    const listeners = matchers.map(({ index, signal: mediaQuery }) => {
      const onChange = (): void => {
        const next = [...(matches() ?? seeded)];
        next[index] = mediaQuery.matches;
        matches.set(next);
      };
      mediaQuery.addEventListener('change', onChange);
      return onChange;
    });

    destroyRef.onDestroy(() => {
      listeners.forEach((listener, i) => {
        matchers[i]?.signal.removeEventListener('change', listener);
      });
    });
  });

  return { activeViewportIndex };
}
