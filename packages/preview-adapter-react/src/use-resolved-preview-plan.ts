'use client';

/*
 * useResolvedPreviewPlan — bridges the API-generic `HydratedView` coming
 * over the preview wire into the internal `PortableRenderPlan` that the
 * renderer consumes.
 *
 * `resolveExperience` is async because customer components can declare a
 * `resolveData` hook. The hook re-resolves whenever the view changes,
 * discarding results from a superseded resolve so late completions can't
 * clobber a newer plan.
 *
 * Returns `undefined` while resolution is in flight for the very first
 * view; on subsequent updates it retains the previous plan until the new
 * one finishes, avoiding a flash of empty content between updates.
 */

import { useEffect, useState } from 'react';

import type { PortableRenderPlan, ResolverConfig } from '@contentful/experiences-core';
import { resolveExperience } from '@contentful/experiences-core';
import type { HydratedView } from '@contentful/experiences-preview-core';

export function useResolvedPreviewPlan(
  view: HydratedView | undefined,
  config: ResolverConfig
): PortableRenderPlan | undefined {
  const [plan, setPlan] = useState<PortableRenderPlan | undefined>(undefined);

  useEffect(() => {
    if (!view) {
      setPlan(undefined);
      return;
    }
    let cancelled = false;
    resolveExperience(view, config).then((resolved) => {
      if (cancelled) return;
      setPlan(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [view, config]);

  return plan;
}
