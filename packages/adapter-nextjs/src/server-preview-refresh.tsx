'use client';

import { useRouter } from 'next/navigation.js';
import { useServerPreviewRefresh } from './router-lifetime.js';

/** Server-rendered content observes revisions through the existing browser Preview Session. */
export function ServerPreviewRefresh() {
  const router = useRouter();
  useServerPreviewRefresh(router.refresh);
  return null;
}
