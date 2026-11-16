'use client';

import {
  useConsentState,
  usePersistenceConsentState,
  useExperiencesActions,
  useExperiencesContext,
  usePreviewState,
  useProfileState,
  type ManagedExperienceResult,
} from '@contentful/experiences-nextjs/client';
import type { FetchExperienceOptions } from '@contentful/experiences-web';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useReference } from './BrowserRoot';

export type Personalization = FetchExperienceOptions['personalization'];
export function Utilities({
  result,
  identifyIntent,
  onIntent,
  onServerUpdate,
  onClearContent,
  onResume,
}: {
  result?: ManagedExperienceResult;
  identifyIntent?: boolean;
  onIntent?: (personalization: Personalization) => void;
  onServerUpdate?: (personalization?: Personalization, routeKey?: string) => Promise<void>;
  onClearContent: () => void;
  onResume: (routeKey: string) => void | Promise<void>;
}) {
  const events = useConsentState();
  const persistence = usePersistenceConsentState();
  const { setConsent, resetUser } = useExperiencesActions();
  const { error, isLive, sdk } = useExperiencesContext();
  const preview = usePreviewState();
  const isPreview = isLive && sdk.isPreview;
  const { routeKey, navigate, serverOnly } = useReference();
  const [actionError, setActionError] = useState<string>();
  const [identifiedAction, setIdentifiedAction] = useState(false);
  const url = new URL(routeKey, 'https://nextjs.invalid');
  const identified =
    identifyIntent || identifiedAction || url.searchParams.get('userId') === 'charles';
  const profile = useProfileState();
  const [pending, setPending] = useState(false);
  const loading = pending || result?.status === 'loading';
  async function serverAction(work: () => Promise<void>) {
    setActionError(undefined);
    setPending(true);
    try {
      await work();
      return true;
    } catch {
      setActionError('The server content request failed.');
      return false;
    } finally {
      setPending(false);
    }
  }
  function act(personalization: Personalization) {
    if (serverOnly)
      void serverAction(() => onServerUpdate!(personalization, url.pathname + url.search)).then(
        (updated) => {
          if (updated && personalization?.events?.[0]?.type === 'identify')
            setIdentifiedAction(true);
        }
      );
    else onIntent?.(personalization);
  }
  function reset() {
    flushSync(onClearContent);
    resetUser();
    setIdentifiedAction(false);
    url.searchParams.delete('userId');
    navigate(url.pathname + url.search, true, true);
    const resume = () => Promise.resolve(onResume(url.pathname + url.search));
    if (serverOnly) void serverAction(resume);
    else void resume();
  }
  function identify() {
    act({ events: [{ type: 'identify', userId: 'charles', traits: { identified: true } }] });
  }
  return (
    <section className="control-panel" aria-label="Utilities">
      <h2 className="control-panel__title">Utilities</h2>
      <div className="control-panel__fields">
        <span className="control-panel__row-label">SDK status</span>
        <span className="control-panel__row-value" role="status">
          {isLive ? 'Active' : error ? 'Unavailable' : 'Initializing'}
        </span>
        <span className="control-panel__row-actions" />
        <span className="control-panel__row-label">SDK profile</span>
        <span className="control-panel__row-value">
          <code>{profile?.id ?? 'None'}</code>
        </span>
        <span className="control-panel__row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="reset-button"
            disabled={!isLive || pending}
            onClick={reset}
          >
            Reset
          </button>
        </span>
        {[
          { name: 'events', label: 'Event consent', value: events, testId: 'consent' },
          {
            name: 'persistence',
            label: 'Persistence consent',
            value: persistence,
            testId: 'persistence-consent',
          },
        ].map(({ name, label, value, testId }) => (
          <Fragment key={name}>
            <span className="control-panel__row-label">{label}</span>
            <span className="control-panel__row-value" data-testid={`${testId}-status`}>
              {value === undefined ? 'Undecided' : value ? 'Granted' : 'Denied'}
            </span>
            <span className="control-panel__row-actions">
              <button
                type="button"
                className={`btn btn--sm ${value ? 'btn--danger' : 'btn--secondary'}`}
                disabled={!isLive}
                data-testid={
                  value
                    ? name === 'events'
                      ? 'unconsent-button'
                      : 'persistence-unconsent-button'
                    : `${testId}-button`
                }
                onClick={() => setConsent({ [name]: value !== true })}
              >
                {value ? 'Revoke' : 'Grant'}
              </button>
            </span>
          </Fragment>
        ))}
        <span className="control-panel__row-label">Identify intent</span>
        <span className="control-panel__row-value" data-testid="identified-status">
          {identified ? 'Yes' : 'No'}
        </span>
        <span className="control-panel__row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="identify-button"
            disabled={!isLive || isPreview || identified || loading}
            onClick={identify}
          >
            Identify
          </button>
        </span>
        <span className="control-panel__row-label">Content</span>
        <span className="control-panel__row-value">
          {loading
            ? 'Loading'
            : actionError || result?.error
              ? 'Error'
              : serverOnly
                ? 'Server-rendered'
                : (result?.status ?? 'Waiting')}
        </span>
        <span className="control-panel__row-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            data-testid="retry-content-button"
            disabled={!isLive || loading}
            onClick={() =>
              serverOnly ? void serverAction(() => onServerUpdate!()) : void result?.retry()
            }
          >
            Retry content
          </button>
        </span>
        {url.pathname.endsWith('/page-two') && (
          <>
            <span className="control-panel__row-label">Custom action</span>
            <span className="control-panel__row-value">
              {!isLive || isPreview ? 'Unavailable' : loading ? 'Pending' : 'Ready'}
            </span>
            <span className="control-panel__row-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                data-testid="track-conversion-button"
                disabled={!isLive || isPreview || loading}
                onClick={() =>
                  act({ events: [{ type: 'track', event: 'reference_custom_action' }] })
                }
              >
                CUSTOM TRACK
              </button>
            </span>
          </>
        )}
        <span className="control-panel__row-label">Live Preview</span>
        <span className="control-panel__row-value" role="status">
          {isPreview ? (preview?.status ?? 'Initializing') : 'Off'}
        </span>
        <span className="control-panel__row-actions" />
        {[
          { label: 'Live Preview error', message: preview?.error?.message },
          { label: 'SDK error', message: error?.message },
          { label: 'Content error', message: actionError },
        ].map(
          ({ label, message }) =>
            message && (
              <Fragment key={label}>
                <span className="control-panel__row-label">{label}</span>
                <span className="control-panel__row-value" role="alert">
                  {message}
                </span>
                <span className="control-panel__row-actions" />
              </Fragment>
            )
        )}
      </div>
      <p className="control-panel__note">
        The SDK owns consent, identity and tracking. Identify and custom actions carry fresh XDA
        intent; Retry carries no events. XDA preflight currently evaluates without committing.
        Browser notifications count attempts, not confirmed delivery
        {serverOnly ? '; server events do not appear in this sidebar' : ''}.
      </p>
    </section>
  );
}

// App Actions return server JSX; Pages applies the new GSSP props through its router.
export function ServerUtilities({
  children,
  update,
}: {
  children: ReactNode;
  update: (routeKey: string, personalization?: Personalization) => Promise<ReactNode | void>;
}) {
  const { routeKey } = useReference();
  const [hidden, setHidden] = useState(false);
  const [replacement, setReplacement] = useState<ReactNode>();
  useEffect(() => setReplacement(undefined), [children]);
  async function refresh(personalization?: Personalization, targetRoute = routeKey) {
    const content = await update(targetRoute, personalization);
    if (content !== undefined) setReplacement(content);
    setHidden(false);
  }
  return (
    <>
      <Utilities
        onServerUpdate={refresh}
        onClearContent={() => setHidden(true)}
        onResume={(route) => refresh(undefined, route)}
      />
      {!hidden && (replacement ?? children)}
    </>
  );
}
