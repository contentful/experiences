<script lang="ts">
  import { onMount } from 'svelte';
  import { attemptLog } from '#lib/attempt-log.svelte.js';
  let now = $state(0);
  onMount(() => {
    now = Date.now();
    const timer = window.setInterval(() => { now = Date.now(); }, 1000);
    return () => window.clearInterval(timer);
  });
</script>
<section class="tracking-log" data-testid="analytics-events-container">
  <div class="tracking-log__header"><h2>Tracking</h2><span class="tracking-log__badge"><span data-testid="raw-events-count">{attemptLog.current.count}</span> attempts</span></div>
  <p class="tracking-log__empty">SDK notifications report attempts, not delivery or service commitment. Measured views/hovers/clicks require attribution, consent and a complete profile. Blocked notifications: {attemptLog.current.blocked}.</p>
  {#if !attemptLog.current.rows.length}
    <p class="tracking-log__empty" data-testid="no-events-message">No event attempts observed.</p>
  {:else}
    <table class="tracking-log__table">
      <thead class="tracking-log__thead"><tr><th>Type</th><th>Value</th><th>Dur</th><th>Age</th><th>Count</th></tr></thead>
      <tbody>{#each attemptLog.current.rows as row (row.id)}
        <tr data-testid={`event-attempt-${row.id}`}>
          <td><span class={`tracking-log__type tracking-log__type--${row.type}`}>{row.type}</span></td>
          <td class="tracking-log__label">{row.value}</td>
          <td class="tracking-log__duration">{row.durationMs === undefined ? '' : `${(row.durationMs / 1000).toFixed(1)}s`}</td>
          <td class="tracking-log__time">{Math.max(0, Math.floor((now - row.observedAt) / 1000))}s</td>
          <td class="tracking-log__count">{row.count > 1 ? `×${row.count}` : ''}</td>
        </tr>
      {/each}</tbody>
    </table>
  {/if}
</section>
