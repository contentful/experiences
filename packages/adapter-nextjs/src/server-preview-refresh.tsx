'use client';

import { useRouter } from 'next/navigation.js';
import { useServerPreviewRefresh } from './router-lifetime.js';

/** Server-rendered content observes revisions through the existing browser Preview Session. */
export function ServerPreviewRefresh({ experienceId }: { experienceId: string | undefined }) {
  const router = useRouter();
  useServerPreviewRefresh(experienceId, router.refresh);
  return null;
}
