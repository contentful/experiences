'use client';

import {
  useBlockedEventStreamState,
  useConsentState,
  useExperiencesActions,
  usePersistenceConsentState,
  useProfileState,
} from '@contentful/experiences-nextjs/client';
import { useState } from 'react';

const panelStyle = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 340,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  maxHeight: 'calc(100dvh - 32px)',
  overflowY: 'auto',
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
export function ConsentPanel() {
  const { setConsent, trackPageView, trackEvent } = useExperiencesActions();
  const eventConsent = useConsentState();
  const persistenceConsent = usePersistenceConsentState();
  const profile = useProfileState();
  const blocked = useBlockedEventStreamState();
  const [lastResult, setLastResult] = useState('');

  async function fire(name: string, send: () => Promise<unknown>) {
    try {
      setLastResult(`${name}: ${JSON.stringify(await send())}`);
    } catch (error) {
      setLastResult(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <aside style={panelStyle} aria-label="Consent demo">
      <strong>Consent demo</strong>
      <p style={{ margin: '8px 0' }}>
        Events: <b>{describe(eventConsent)}</b> · Persistence: <b>{describe(persistenceConsent)}</b>
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => setConsent(true)}>
          Accept all
        </button>
        <button style={buttonStyle} onClick={() => setConsent(false)}>
          Reject all
        </button>
        <button
          style={buttonStyle}
          onClick={() => setConsent({ events: true, persistence: false })}
        >
          Events only
        </button>
      </div>

      <p style={{ margin: '12px 0 4px' }}>
        The managed root handles the initial page. Try an additional event:
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => fire('page', () => trackPageView())}>
          Send another page
        </button>
        <button
          style={buttonStyle}
          onClick={() => fire('track', () => trackEvent({ event: 'demo_clicked' }))}
        >
          Send demo track
        </button>
      </div>
      <p style={{ margin: '8px 0' }}>
        Page events are allowed by default. Track events require event consent. Preview Sessions
        suppress events. Blocked events are dropped.
      </p>

      <p style={{ margin: '12px 0 4px', overflowWrap: 'anywhere' }}>
        Current profile: <code>{profile?.id ?? '(none)'}</code>
      </p>
      <p style={{ margin: '4px 0' }}>
        Persistence consent lets the SDK store the profile and identity cookie. Withdrawing it
        removes stored identity while retaining the current profile in memory. Consent choices
        survive a reload.
      </p>
      {lastResult !== '' && (
        <p style={{ margin: '4px 0', overflowWrap: 'anywhere' }} aria-live="polite">
          Last call: <code>{lastResult}</code> (acceptance does not confirm delivery)
        </p>
      )}

      <p style={{ margin: '12px 0 4px' }} aria-live="polite">
        Last blocked event:{' '}
        {blocked ? (
          <>
            <code>{blocked.method}</code> ({blocked.reason})
          </>
        ) : (
          '(none)'
        )}
      </p>
    </aside>
  );
}
