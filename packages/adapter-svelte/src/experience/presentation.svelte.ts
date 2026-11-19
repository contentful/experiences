import { onDestroy, untrack } from 'svelte';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type { DestinationRedirectResult } from '@contentful/experiences-web';
import type {
  ManagedExperienceAcquireOptions,
  ManagedExperienceOperationResult,
} from './source-types.js';

export interface PresentationSnapshot<T> {
  readonly status: 'idle' | 'loading' | 'success' | 'error' | 'redirect';
  readonly data: PortableRenderPlan | undefined;
  readonly error: Error | undefined;
  readonly redirect?: DestinationRedirectResult['redirect'];
  readonly result?: T;
}
export type PresentedExperience<T> = PresentationSnapshot<T> & {
  acquire(
    options: ManagedExperienceAcquireOptions
  ): Promise<ManagedExperienceOperationResult | undefined>;
  refresh(): Promise<void>;
  retry(): Promise<void>;
};
export interface PresentationNotifications<T> {
  onExperienceResolved?: (
    current: PresentedExperience<T> & { readonly data: PortableRenderPlan }
  ) => void;
  onExperienceError?: (error: Error, current: PresentedExperience<T>) => void;
  onRedirect?: (
    redirect: NonNullable<PresentationSnapshot<T>['redirect']>,
    current: PresentedExperience<T>
  ) => void;
}
interface Publication<T> {
  snapshot: PresentationSnapshot<T>;
  isCurrent(): boolean;
  redirectClaimed?: boolean;
}
const idle = () => ({ status: 'idle' as const, data: undefined, error: undefined });
type Acquire = PresentedExperience<unknown>['acquire'];
const unavailable: Acquire = async () => undefined;
/** Display ownership shared by portable and native acquisition. Results remain intact. */
export function createPresentation<T>(refresh: () => Promise<void>) {
  let refreshSelection = refresh;
  let acquireSelection: Acquire = unavailable;
  let publication = $state.raw<Publication<T>>({ snapshot: idle(), isCurrent: () => false });
  let completed = untrack(() => publication);
  let selection: unknown;
  let pending: object | undefined;
  function publish(snapshot: PresentationSnapshot<T>, isCurrent: () => boolean, settled = true) {
    publication = { snapshot, isCurrent };
    if (settled) {
      completed = publication;
      pending = undefined;
    }
  }
  const view: PresentedExperience<T> = {
    get data() {
      return publication.snapshot.data;
    },
    get error() {
      return publication.snapshot.error;
    },
    get status() {
      return publication.snapshot.status;
    },
    get redirect() {
      return publication.snapshot.redirect;
    },
    get result() {
      return publication.snapshot.result;
    },
    acquire: (options) => untrack(() => acquireSelection(options)),
    refresh: () => refreshSelection(),
    retry: () => refreshSelection(),
  };
  return {
    view,
    get current() {
      return publication.snapshot;
    },
    complete(
      result: T | undefined,
      outcome: {
        plan?: PortableRenderPlan;
        error?: Error;
        redirect?: DestinationRedirectResult['redirect'];
        invalidatesData?: boolean;
      },
      isCurrent: () => boolean,
      settled = true
    ) {
      const data =
        outcome.plan ??
        (outcome.invalidatesData || outcome.redirect ? undefined : publication.snapshot.data);
      publish(
        {
          result,
          data,
          error: outcome.error,
          redirect: outcome.redirect,
          status: outcome.redirect
            ? 'redirect'
            : outcome.error
              ? 'error'
              : data || result
                ? 'success'
                : 'idle',
        },
        isCurrent,
        settled
      );
    },
    isSelected(key: unknown) {
      return selection === key;
    },
    select(key: unknown, retry = refresh, acquire: Acquire = unavailable) {
      refreshSelection = retry;
      acquireSelection = acquire;
      if (selection === key) return;
      selection = key;
      publish(idle(), () => false);
    },
    begin(isCurrent: () => boolean) {
      if (!pending) completed = publication;
      const attempt = (pending = {});
      publish({ ...publication.snapshot, status: 'loading', error: undefined }, isCurrent, false);
      return () => {
        if (pending !== attempt) return;
        publication = completed;
        pending = undefined;
      };
    },
    invalidateData() {
      publication = { ...publication, snapshot: { ...publication.snapshot, data: undefined } };
      completed = pending
        ? { ...completed, snapshot: { ...completed.snapshot, data: undefined } }
        : publication;
    },
    isCurrentSnapshot(snapshot: PresentationSnapshot<T>) {
      return publication.snapshot === snapshot && publication.isCurrent();
    },
    claimRedirect(snapshot: PresentationSnapshot<T>) {
      if (
        publication.snapshot !== snapshot ||
        !snapshot.redirect ||
        !publication.isCurrent() ||
        publication.redirectClaimed
      )
        return false;
      publication.redirectClaimed = true;
      return true;
    },
    rejectRedirect(value: unknown) {
      const error = value instanceof Error ? value : new Error(String(value));
      publish(
        { ...publication.snapshot, status: 'error', redirect: undefined, error },
        publication.isCurrent
      );
    },
    reset() {
      if (pending) publication = completed;
      pending = undefined;
      publication = { ...publication, isCurrent: () => false };
      completed = publication;
    },
    clear() {
      selection = undefined;
      refreshSelection = refresh;
      acquireSelection = unavailable;
      publish(idle(), () => false);
    },
  };
}
export type Presentation<T> = ReturnType<typeof createPresentation<T>>;
/** One callback implementation; every callback may revoke remaining publication authority. */
export function usePresentation<T>(
  model: Presentation<T>,
  getOptions: () => PresentationNotifications<T> = () => ({}),
  getResult?: (result: T | undefined) => T | undefined,
  isActionCurrent: () => boolean = () => true
): PresentedExperience<T> {
  let active = true;
  onDestroy(() => {
    active = false;
  });
  const canAct = () => untrack(() => active && isActionCurrent());
  const acquire: Acquire = (options) =>
    canAct() ? model.view.acquire(options) : unavailable(options);
  const refresh = () => (canAct() ? model.view.refresh() : Promise.resolve());
  const current = new Proxy(model.view, {
    get(target, key, receiver) {
      if (key === 'acquire') return acquire;
      if (key === 'refresh' || key === 'retry') return refresh;
      return key === 'result' && getResult
        ? getResult(target.result)
        : Reflect.get(target, key, receiver);
    },
  });
  let reported: Pick<PresentationSnapshot<T>, 'data' | 'error' | 'redirect'> = {
    data: undefined,
    error: undefined,
  };
  $effect(() => {
    const snapshot = model.current;
    const { data, error, redirect } = snapshot;
    untrack(() => {
      const isCurrent = () => active && model.isCurrentSnapshot(snapshot);
      if (!isCurrent()) return;
      const previous = reported;
      reported = { data, error, redirect };
      const callbacks = getOptions();
      if (
        redirect &&
        redirect !== previous.redirect &&
        callbacks.onRedirect &&
        model.claimRedirect(snapshot)
      ) {
        try {
          callbacks.onRedirect(redirect, current);
        } catch (error) {
          if (isCurrent()) model.rejectRedirect(error);
          return;
        }
      }
      if (!isCurrent()) return;
      if (data && data !== previous.data) callbacks.onExperienceResolved?.({ ...current, data });
      if (isCurrent() && error && error !== previous.error)
        callbacks.onExperienceError?.(error, current);
    });
  });
  return current;
}
