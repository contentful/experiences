'use client';

import { ContentfulExperiences, type BlockedEvent } from '@contentful/experiences-web';
import { useEffect, useRef, useState } from 'react';

type Consent = { events?: boolean; persistence?: boolean };

const panelStyle = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 340,
  padding: 16,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
  fontSize: 13,
  color: '#111827',
} as const;

const buttonStyle = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  cursor: 'pointer',
  fontSize: 13,
} as const;

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

interface ConsentPanelProps {
  spaceId: string;
  environmentId: string;
  /**
   * The runtime needs a delivery token, but this panel never fetches an
   * Experience. The server layout passes the example's existing `CDA_TOKEN`; it
   * reaches the browser, so use a read-only delivery token.
   */
  accessToken: string;
}

/**
 * Demonstrates consent gating in the Web SDK. Event consent decides which events
 * are sent; persistence consent decides whether the profile is written to
 * LocalStorage. Both choices are stored in LocalStorage, so they survive a reload.
 */
export function ConsentPanel({ spaceId, environmentId, accessToken }: ConsentPanelProps) {
  const runtime = useRef<ContentfulExperiences | undefined>(undefined);
  const [consent, setConsent] = useState<Consent>({});
  const [profileId, setProfileId] = useState<string | undefined>();
  const [stored, setStored] = useState<string>('(none)');
  const [blocked, setBlocked] = useState<BlockedEvent[]>([]);
  const [lastResult, setLastResult] = useState<string>('');

  function refresh() {
    const current = runtime.current;
    if (current === undefined) return;
    setConsent({ ...current.consentState });
    setProfileId(current.profile?.id);
    setStored(window.localStorage.getItem('__ctfl_opt_profile__') ?? '(none)');
  }

  useEffect(() => {
    const instance = new ContentfulExperiences({
      spaceId,
      environmentId,
      resolverConfig: { components: {} },
      delivery: { accessToken },
      onEventBlocked: (event) => setBlocked((previous) => [event, ...previous].slice(0, 5)),
    });
    runtime.current = instance;
    refresh();

    // Views, hovers, and clicks on rendered nodes go through the same consent gate.
    const session = instance.startInteractionTracking({ resolveAttribution: () => undefined });
    return () => {
      void session.stop();
      runtime.current = undefined;
    };
  }, []);

  async function fire(name: string, send: () => Promise<unknown>) {
    try {
      setLastResult(`${name}: ${JSON.stringify(await send())}`);
    } catch (error) {
      setLastResult(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    refresh();
  }

  function setChoice(next: boolean | Consent) {
    runtime.current?.consent(next);
    refresh();
  }

  return (
    <aside style={panelStyle} aria-label="Consent demo">
      <strong>Consent demo</strong>
      <p style={{ margin: '8px 0' }}>
        Events: <b>{describe(consent.events)}</b> · Persistence:{' '}
        <b>{describe(consent.persistence)}</b>
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => setChoice(true)}>
          Accept all
        </button>
        <button style={buttonStyle} onClick={() => setChoice(false)}>
          Reject all
        </button>
        <button style={buttonStyle} onClick={() => setChoice({ events: true, persistence: false })}>
          Events only
        </button>
      </div>

      <p style={{ margin: '12px 0 4px' }}>Personalization events:</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => fire('page', () => runtime.current!.page())}>
          page (allowed)
        </button>
        <button
          style={buttonStyle}
          onClick={() => fire('track', () => runtime.current!.track({ event: 'demo_clicked' }))}
        >
          track (gated)
        </button>
      </div>

      <p style={{ margin: '12px 0 4px' }}>Analytics events (need a profile: send page first):</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          style={buttonStyle}
          onClick={() =>
            fire('trackView', () =>
              runtime.current!.trackView({
                ...demoEntity,
                viewId: 'demo-view',
                viewDurationMs: 1000,
              })
            )
          }
        >
          view
        </button>
        <button
          style={buttonStyle}
          onClick={() => fire('trackClick', () => runtime.current!.trackClick(demoEntity))}
        >
          click
        </button>
        <button
          style={buttonStyle}
          onClick={() =>
            fire('trackHover', () =>
              runtime.current!.trackHover({
                ...demoEntity,
                hoverId: 'demo-hover',
                hoverDurationMs: 1000,
              })
            )
          }
        >
          hover
        </button>
        <button
          style={buttonStyle}
          onClick={() =>
            fire('trackFlagView', () =>
              runtime.current!.trackFlagView({ componentId: 'demo-flag' })
            )
          }
        >
          flag view
        </button>
      </div>

      <p style={{ margin: '12px 0 4px' }}>
        Profile in memory: <code>{profileId ?? '(none)'}</code>
      </p>
      <p style={{ margin: '4px 0' }}>
        Profile in LocalStorage: <code>{stored}</code>
      </p>
      {lastResult !== '' && (
        <p style={{ margin: '4px 0', wordBreak: 'break-all' }}>
          Last call: <code>{lastResult}</code>
        </p>
      )}

      <p style={{ margin: '12px 0 4px' }}>Blocked events ({blocked.length}):</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {blocked.map((event, index) => (
          <li key={index}>
            <code>{event.method}</code> ({event.reason})
          </li>
        ))}
      </ul>
    </aside>
  );
}
