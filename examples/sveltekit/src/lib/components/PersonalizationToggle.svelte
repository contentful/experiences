<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  // Flips `?personalization=true` on the current URL. The routes read that flag
  // and send an EU page event with the fetch.
  const enabled = $derived(['true', '1'].includes(page.url.searchParams.get('personalization') ?? ''));

  function toggle(next: boolean) {
    const url = new URL(page.url);
    if (next) url.searchParams.set('personalization', 'true');
    else url.searchParams.delete('personalization');
    goto(url, { invalidateAll: true });
  }
</script>

<label
  style="position: fixed; top: 12px; right: 12px; z-index: 10; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; font-size: 14px;"
>
  <input
    type="checkbox"
    checked={enabled}
    onchange={(e) => toggle(e.currentTarget.checked)}
  />
  Personalization (simulates an EU visitor)
</label>
