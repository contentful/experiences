import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ContentfulExperiences, type BlockedEvent } from '@contentful/experiences-web';

import { ConsentStore } from '../consent-store.js';

type Consent = { events?: boolean; persistence?: boolean };
type EventName = 'page' | 'track' | 'trackView' | 'trackClick' | 'trackHover' | 'trackFlagView';

// A stand-in entity for the interaction buttons. Real tracked entities come from
// the plan's attribution once it is rendered; see the note in the README.
const DEMO_ENTITY = {
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

/**
 * Demonstrates consent gating in the Web SDK. Event consent decides which events
 * are sent; persistence consent decides whether the profile is written to
 * LocalStorage. Both choices are stored in LocalStorage, so they survive a reload.
 */
@Component({
  selector: 'app-consent-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    aside {
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
  `,
  template: `
    @if (ready()) {
      <aside aria-label="Consent demo">
        <strong>Consent demo</strong>
        <p>
          Events: <b>{{ describe(consent().events) }}</b> · Persistence:
          <b>{{ describe(consent().persistence) }}</b>
        </p>

        <div class="row">
          <button (click)="setChoice(true)">Accept all</button>
          <button (click)="setChoice(false)">Reject all</button>
          <button (click)="setChoice({ events: true, persistence: false })">Events only</button>
        </div>

        <p class="label">Personalization events:</p>
        <div class="row">
          <button (click)="send('page')">page (allowed)</button>
          <button (click)="send('track')">track (gated)</button>
        </div>

        <p class="label">Analytics events (need a profile: send page first):</p>
        <div class="row">
          <button (click)="send('trackView')">view</button>
          <button (click)="send('trackClick')">click</button>
          <button (click)="send('trackHover')">hover</button>
          <button (click)="send('trackFlagView')">flag view</button>
        </div>

        <p class="label">
          Profile in memory: <code>{{ profileId() ?? '(none)' }}</code>
        </p>
        <p>
          Profile in LocalStorage: <code>{{ stored() }}</code>
        </p>
        @if (lastResult() !== '') {
          <p class="wrap">
            Last call: <code>{{ lastResult() }}</code>
          </p>
        }

        <p class="label">Blocked events ({{ blocked().length }}):</p>
        <ul>
          @for (event of blocked(); track $index) {
            <li>
              <code>{{ event.method }}</code> ({{ event.reason }})
            </li>
          }
        </ul>
      </aside>
    }
  `,
})
export class ConsentPanelComponent {
  protected readonly describe = describe;
  private runtime: ContentfulExperiences | undefined;

  protected readonly ready = signal(false);
  protected readonly consent = signal<Consent>({});
  protected readonly profileId = signal<string | undefined>(undefined);
  protected readonly stored = signal('(none)');
  protected readonly blocked = signal<BlockedEvent[]>([]);
  protected readonly lastResult = signal('');

  constructor() {
    const config = inject(ConsentStore).config;
    const destroyRef = inject(DestroyRef);
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    if (!isBrowser || config === null) return;

    // The Web runtime is browser-only, so it is created after the first render,
    // never during SSR.
    afterNextRender(() => {
      const instance = new ContentfulExperiences({
        spaceId: config.spaceId,
        environmentId: config.environmentId,
        resolverConfig: { components: {} },
        delivery: { accessToken: config.accessToken },
        onEventBlocked: (event) =>
          this.blocked.update((previous) => [event, ...previous].slice(0, 5)),
      });
      this.runtime = instance;
      this.ready.set(true);
      this.refresh();

      // Views, hovers, and clicks on rendered nodes go through the same consent gate.
      const session = instance.startInteractionTracking({ resolveAttribution: () => undefined });
      destroyRef.onDestroy(() => {
        void session.stop();
        this.runtime = undefined;
      });
    });
  }

  protected refresh(): void {
    const runtime = this.runtime;
    if (runtime === undefined) return;
    this.consent.set({ ...runtime.consentState });
    this.profileId.set(runtime.profile?.id);
    this.stored.set(window.localStorage.getItem('__ctfl_opt_profile__') ?? '(none)');
  }

  protected async send(name: EventName): Promise<void> {
    const runtime = this.runtime;
    if (runtime === undefined) return;

    const calls: Record<EventName, () => Promise<unknown>> = {
      page: () => runtime.page(),
      track: () => runtime.track({ event: 'demo_clicked' }),
      trackView: () =>
        runtime.trackView({ ...DEMO_ENTITY, viewId: 'demo-view', viewDurationMs: 1000 }),
      trackClick: () => runtime.trackClick(DEMO_ENTITY),
      trackHover: () =>
        runtime.trackHover({ ...DEMO_ENTITY, hoverId: 'demo-hover', hoverDurationMs: 1000 }),
      trackFlagView: () => runtime.trackFlagView({ componentId: 'demo-flag' }),
    };

    try {
      this.lastResult.set(`${name}: ${JSON.stringify(await calls[name]())}`);
    } catch (error) {
      this.lastResult.set(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.refresh();
  }

  protected setChoice(next: boolean | Consent): void {
    this.runtime?.consent(next);
    this.refresh();
  }
}
