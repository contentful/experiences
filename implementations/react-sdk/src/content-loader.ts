'use client';

import { useEffect, useState } from 'react';
import {
  useExperiencesContext,
  type ManagedExperienceResult,
} from '@contentful/experiences-react/client';
import { experienceConfig } from './experience-config';

export type ContentResult = Pick<ManagedExperienceResult, 'data' | 'error'>;

// Only later comparison IDs fetch here, without visitor events. React owns this
// loop's cancellation; the SDK owns the primary request and preview updates.
export function useComparisonContent(ids: readonly string[], ready: boolean) {
  const { sdk, isLive } = useExperiencesContext();
  const [content, setContent] = useState<Record<string, ContentResult>>({});
  useEffect(() => {
    if (!isLive || !ready || !ids.length) return;
    const client = sdk;
    let active = true;
    async function load() {
      const next: Record<string, ContentResult> = {};
      for (const experienceId of ids) {
        if (!active) break;
        try {
          next[experienceId] = {
            data: await client.fetchExperience({ experienceId }, { config: experienceConfig }),
            error: undefined,
          };
        } catch (error) {
          next[experienceId] = {
            data: undefined,
            error: error instanceof Error ? error : new Error('The Experience request failed.'),
          };
        }
      }
      if (active) setContent(next);
    }
    void load();
    return () => {
      active = false;
    };
  }, [sdk, isLive, ready, ids]);
  return content;
}
