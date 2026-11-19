<script lang="ts">
  import { getExperiencesActions, getExperiencesState } from '@contentful/experiences-svelte';
  import type { BlockedEvent } from '@contentful/experiences-web';
  import { untrack } from 'svelte';

  const runtime = getExperiencesActions();
  const runtimeState = getExperiencesState();
  const consent = $derived({
    events: runtimeState.consent,
    persistence: runtimeState.persistenceConsent,
  });
  const profileId = $derived(runtimeState.profile?.id);
  let stored = $state('(none)');
  let blocked = $state<BlockedEvent[]>([]);
  let lastResult = $state('');

  // A stand-in entity for the interaction buttons. Real tracked entities come from
  // the plan's attribution once it is rendered; see the note in the README.
  const demoEntity = {
    entityId: 'demo-entity',
    entityKind: 'Experience',
    optimizationId: 'demo-optimization',
    variantId: 'demo-variant',
  } as const;

  function describe(value: boolean | undefined): string {
    if (value === undefined) return 'undecided';
    if (value) return 'granted';
    return 'denied';
  }

  async function fire(name: string, send: () => Promise<unknown>) {
    try {
      lastResult = `${name}: ${JSON.stringify(await send())}`;
    } catch (error) {
      lastResult = `${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function setChoice(next: boolean | { events?: boolean; persistence?: boolean }) {
    runtime.consent(next);
  }

  // Effects observe the root's SDK; this panel never constructs or destroys one.
  $effect(() => {
    const events = runtimeState.consent;
    const persistence = runtimeState.persistenceConsent;
    // Profile changes also update the LocalStorage readout.
    runtimeState.profile;
    if (!runtimeState.ready) return;
    // These application cookies give SSR the same explicit CMP decision.
    // The SDK owns its separate identity cookie and LocalStorage policy.
    for (const [name, value] of [
      ['site-events-consent', events],
      ['site-persistence-consent', persistence],
    ] as const) {
      if (value !== undefined) {
        document.cookie = `${name}=${value ? 'accepted' : 'denied'}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`;
      }
    }
    stored = window.localStorage.getItem('__ctfl_opt_profile__') ?? '(none)';
  });

  $effect(() => {
    const event = runtimeState.blockedEventStream;
    if (event !== undefined) {
      untrack(() => { blocked = [event, ...blocked].slice(0, 5); });
    }
  });
</script>

<aside class="panel" aria-label="Consent demo">
  <strong>Consent demo</strong>
  {#if runtimeState.error}
    <p role="status">Browser runtime unavailable. Check the PUBLIC_* configuration.</p>
  {/if}
  <fieldset disabled={!runtimeState.ready}>
    <p>
      Events: <b>{describe(consent.events)}</b> · Persistence: <b>{describe(consent.persistence)}</b>
    </p>

    <div class="row">
      <button onclick={() => setChoice(true)}>Accept all</button>
      <button onclick={() => setChoice(false)}>Reject all</button>
      <button onclick={() => setChoice({ events: true, persistence: false })}>Events only</button>
    </div>

    <p class="label">Personalization events:</p>
    <div class="row">
      <button onclick={() => fire('page', () => runtime.page())}>page (allowed)</button>
      <button onclick={() => fire('track', () => runtime.track({ event: 'demo_clicked' }))}>
        track (gated)
      </button>
    </div>

    <p class="label">Analytics events (need a profile: send page first):</p>
    <div class="row">
      <button
        onclick={() =>
          fire('trackView', () =>
            runtime.trackView({ ...demoEntity, viewId: 'demo-view', viewDurationMs: 1000 })
          )}
      >
        view
      </button>
      <button onclick={() => fire('trackClick', () => runtime.trackClick(demoEntity))}>click</button>
      <button
        onclick={() =>
          fire('trackHover', () =>
            runtime.trackHover({ ...demoEntity, hoverId: 'demo-hover', hoverDurationMs: 1000 })
          )}
      >
        hover
      </button>
      <button onclick={() => fire('trackFlagView', () => runtime.trackFlagView({ componentId: 'demo-flag' }))}>
        flag view
      </button>
    </div>

    <p class="label">Profile in memory: <code>{profileId ?? '(none)'}</code></p>
    <p>Profile in LocalStorage: <code>{stored}</code></p>
    {#if lastResult !== ''}
      <p class="wrap">Last call: <code>{lastResult}</code></p>
    {/if}

    <p class="label">Blocked events ({blocked.length}):</p>
    <ul>
      {#each blocked as event}
        <li><code>{event.method}</code> ({event.reason})</li>
      {/each}
    </ul>
  </fieldset>
</aside>

<style>
  .panel {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 340px;
    padding: 16px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    font-size: 13px;
    color: #111827;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .label {
    margin: 12px 0 4px;
  }
  .wrap {
    word-break: break-all;
  }
  button {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    cursor: pointer;
    font-size: 13px;
  }
  p {
    margin: 4px 0;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
</style>
