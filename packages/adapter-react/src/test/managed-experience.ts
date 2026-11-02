import { vi } from 'vitest';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import {
  createWebSnapshotRuntime,
  type ContentfulExperiences,
  type CoreStates,
  type Observable,
  type PreviewState,
  type PreviewUpdate,
  type RuntimeFetchExperienceOptions,
  type RuntimeFetchResolveOptions,
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
  const profile = observable<CoreStates['profile']['current']>(undefined);
  const snapshot = createWebSnapshotRuntime();
  const bindings: {
    listener: (update: PreviewUpdate) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }[] = [];
  const fetchExperience = vi
    .fn<
      (
        request: RuntimeFetchExperienceOptions,
        resolve: RuntimeFetchResolveOptions
      ) => Promise<PortableRenderPlan>
    >()
    .mockResolvedValue(plan());
  const subscribeToPreview = vi.fn<ContentfulExperiences['subscribeToPreview']>(
    (_id, _resolve, listener) => {
      const unsubscribe = vi.fn();
      bindings.push({ listener, unsubscribe });
      return { unsubscribe };
    }
  );
  const sdk = {
    ...snapshot,
    config: {},
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
    experienceId: 'home',
    sessionId: 'session-a',
    revision: 1,
    data: undefined,
    error: undefined,
    status: 'live',
    ...overrides,
  };
}
