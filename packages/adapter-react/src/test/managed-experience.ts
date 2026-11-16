import { vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type States,
  type Observable,
  type PreviewState,
  type PreviewUpdate,
  type FetchExperienceOptions,
  type FetchResolveOptions,
} from '@contentful/experiences-web';

export function plan(title = 'content'): PortableRenderPlan {
  return {
    nodes: [
      {
        nodeId: 'hero',
        registration: { kind: 'component', id: 'hero' },
        props: { content: { title }, design: {}, designRaw: {} },
        slots: {},
      },
    ],
    metadata: {},
    debug: false,
    diagnostics: [],
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  const state: Observable<T> = {
    get current() {
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(value);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
    subscribeOnce(listener) {
      const subscription = state.subscribe((next) => {
        if (next != null) listener(next);
      });
      return subscription;
    },
  };
  return {
    state,
    listeners,
    emit(next: T) {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

export function sourceSdk() {
  const preview = observable<PreviewState | undefined>(undefined);
  const consent = observable<boolean | undefined>(true);
  const locale = observable<string | undefined>('en-US');
  const profile = observable<States['profile']['current']>(undefined);
  const snapshot = createWebSnapshotRuntime();
  const bindings: {
    listener: (update: PreviewUpdate) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }[] = [];
  const fetchExperience = vi
    .fn<
      (request: FetchExperienceOptions, resolve: FetchResolveOptions) => Promise<PortableRenderPlan>
    >()
    .mockResolvedValue(plan());
  const subscribeToPreview = vi.fn<ContentfulExperiences['subscribeToPreview']>(
    (_id, _resolve, listener) => {
      let active = true;
      const deliver = (update: PreviewUpdate) => {
        if (active) listener(update);
      };
      // Web owns error delivery and suppresses callbacks after unsubscribe.
      let previousError: Error | undefined;
      const subscription = preview.state.subscribe((state) => {
        const error = state?.data?.sys?.id === _id ? state.error : undefined;
        if (error !== previousError) deliver({ error });
        previousError = error;
      });
      const unsubscribe = vi.fn(() => {
        active = false;
        subscription.unsubscribe();
      });
      bindings.push({ listener: deliver, unsubscribe });
      return { unsubscribe };
    }
  );
  const sdk = {
    ...snapshot,
    config: {},
    get isPreview() {
      return Boolean(preview.state.current?.sessionId);
    },
    states: {
      ...snapshot.states,
      preview: preview.state,
      consent: consent.state,
      locale: locale.state,
      profile: profile.state,
    },
    fetchExperience,
    subscribeToPreview,
  } as unknown as ContentfulExperiences;
  return { sdk, preview, consent, locale, profile, fetchExperience, subscribeToPreview, bindings };
}

export function previewState(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    sessionId: 'session-a',
    revision: 1,
    data: { sys: { id: 'home', type: 'Experience' }, nodes: [] },
    error: undefined,
    status: 'live',
    ...overrides,
  };
}
