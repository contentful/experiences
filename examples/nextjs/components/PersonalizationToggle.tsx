/* global URLSearchParams */
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Flips `?personalization=true` on the current URL. The routes read that flag
 * and send an EU page event with the fetch.
 */
export function PersonalizationToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enabled = ['true', '1'].includes(searchParams.get('personalization') ?? '');

  function toggle(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('personalization', 'true');
    else params.delete('personalization');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        color: '#374151',
        fontSize: 14,
      }}
    >
      <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
      Personalization (simulates an EU visitor)
    </label>
  );
}
