<script lang="ts">
  import { ContentfulExperiences, type BlockedEvent } from '@contentful/experiences-web';
  import { onMount } from 'svelte';

  interface Props {
    spaceId: string;
    environmentId: string;
    /** Reaches the browser, so use a read-only delivery token. */
    accessToken: string;
  }

  let { spaceId, environmentId, accessToken }: Props = $props();

  let runtime: ContentfulExperiences | undefined;
  let consent = $state<{ events?: boolean; persistence?: boolean }>({});
  let profileId = $state<string | undefined>();
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

  function refresh() {
    if (runtime === undefined) return;
    consent = { ...runtime.consentState };
    profileId = runtime.profile?.id;
    stored = window.localStorage.getItem('__ctfl_opt_profile__') ?? '(none)';
  }

  async function fire(name: string, send: () => Promise<unknown>) {
    try {
      lastResult = `${name}: ${JSON.stringify(await send())}`;
    } catch (error) {
      lastResult = `${name}: ${error instanceof Error ? error.message : String(error)}`;
    }
    refresh();
  }

  function setChoice(next: boolean | { events?: boolean; persistence?: boolean }) {
    runtime?.consent(next);
    refresh();
  }

  // The Web runtime is browser-only, so it is created on mount, never during SSR.
  onMount(() => {
    const instance = new ContentfulExperiences({
      spaceId,
      environmentId,
      resolverConfig: { components: {} },
      delivery: { accessToken },
      onEventBlocked: (event) => {
        blocked = [event, ...blocked].slice(0, 5);
      },
    });
    runtime = instance;
    refresh();

    // Views, hovers, and clicks on rendered nodes go through the same consent gate.
    const session = instance.startInteractionTracking({ resolveAttribution: () => undefined });
    return () => {
      void session.stop();
      runtime = undefined;
    };
  });
</script>

<aside class="panel" aria-label="Consent demo">
  <strong>Consent demo</strong>
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
    <button onclick={() => fire('page', () => runtime!.page())}>page (allowed)</button>
    <button onclick={() => fire('track', () => runtime!.track({ event: 'demo_clicked' }))}>
      track (gated)
    </button>
  </div>

  <p class="label">Analytics events (need a profile: send page first):</p>
  <div class="row">
    <button
      onclick={() =>
        fire('trackView', () =>
          runtime!.trackView({ ...demoEntity, viewId: 'demo-view', viewDurationMs: 1000 })
        )}
    >
      view
    </button>
    <button onclick={() => fire('trackClick', () => runtime!.trackClick(demoEntity))}>click</button>
    <button
      onclick={() =>
        fire('trackHover', () =>
          runtime!.trackHover({ ...demoEntity, hoverId: 'demo-hover', hoverDurationMs: 1000 })
        )}
    >
      hover
    </button>
    <button onclick={() => fire('trackFlagView', () => runtime!.trackFlagView({ componentId: 'demo-flag' }))}>
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
