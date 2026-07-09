/*
 * createResolvedPreviewPlan — Svelte 5 rune-based counterpart to the
 * React `useResolvedPreviewPlan`. Bridges the API-generic `HydratedView`
 * coming over the preview wire into the internal `PortableRenderPlan`
 * that the renderer consumes.
 *
 * `resolveExperience` is async because customer components can declare a
 * `resolveData` hook. The rune re-resolves whenever the passed view
 * changes, discarding results from a superseded resolve so late
 * completions can't clobber a newer plan.
 *
 * On subsequent updates the previous plan is retained until the new one
 * finishes, avoiding a flash of empty content between updates.
 */

import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';
import type { HydratedView } from '@contentful/experiences-preview-core';

export interface ResolvedPreviewPlan {
  readonly plan: PortableRenderPlan | undefined;
}

/**
 * Must be called at the top level of a `.svelte` component. Pass a getter
 * for the view so the rune can react when it changes — the caller
 * typically reads `previewOverride.view`, so the getter is a natural
 * shape.
 */
export function createResolvedPreviewPlan(
  getView: () => HydratedView | undefined,
  config: ResolverConfig
): ResolvedPreviewPlan {
  let plan = $state<PortableRenderPlan | undefined>(undefined);

  $effect(() => {
    const view = getView();
    if (!view) {
      plan = undefined;
      return;
    }
    let cancelled = false;
    resolveExperience(view, config).then((resolved) => {
      if (cancelled) return;
      plan = resolved;
    });
    return () => {
      cancelled = true;
    };
  });

  return {
    get plan() {
      return plan;
    },
  };
}
