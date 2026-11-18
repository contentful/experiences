import { getContext, onDestroy, setContext, untrack } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import type {
  ContentfulExperiences,
  Observable,
  States,
  WebExperiencesRuntime,
} from '@contentful/experiences-web';
import type { OwnerSnapshot, RuntimeOwner } from './owner-controller.svelte.js';

import { createPrimarySource, type PrimarySource } from '../experience/primary-source.svelte.js';
import { createPresentation, type Presentation } from '../experience/presentation.svelte.js';
import type { ManagedExperienceOperationResult } from '../experience/source-types.js';
import { createPageSequence, type PageSequence } from './page-sequence.svelte.js';

const RUNTIME_KEY = Symbol('@contentful/experiences-svelte::runtime');
type StateKey = Exclude<keyof States, 'flag'>;
type StateValues = { readonly [K in StateKey]: States[K]['current'] };

export interface ExperiencesState extends StateValues {
  readonly status: OwnerSnapshot['status'];
  readonly ready: boolean;
  readonly error: Error | undefined;
  flag(name: string): ReturnType<States['flag']>['current'];
}

export type ExperiencesActions = Pick<
  WebExperiencesRuntime,
  | 'identify'
  | 'page'
  | 'track'
  | 'trackView'
  | 'trackClick'
  | 'trackHover'
  | 'trackFlagView'
  | 'consent'
  | 'reset'
  | 'setLocale'
  | 'flush'
  | 'tracking'
>;

/** One Svelte context per activation, from its initial snapshot through disposal. */
export interface RuntimeScope {
  readonly owner: RuntimeOwner;
  readonly source: PrimarySource;
  readonly presentation: Presentation<ManagedExperienceOperationResult>;
  readonly route: PageSequence;
  readonly runtime: WebExperiencesRuntime;
  readonly state: ExperiencesState;
  dispose(): void;
}

export function setRuntimeScope(
  owner: RuntimeOwner,
  supplied?: Presentation<unknown>
): RuntimeScope {
  const getSdk = () =>
    owner.current.status === 'ready' ? (owner.current.sdk as ContentfulExperiences) : undefined;
  const route = createPageSequence(getSdk);
  let source: PrimarySource | undefined;
  const presentation =
    (supplied as Presentation<ManagedExperienceOperationResult> | undefined) ??
    createPresentation<ManagedExperienceOperationResult>(
      () => source?.refresh() ?? Promise.resolve()
    );
  let active = true;
  const cleanups = new Set<() => void>();
  const cells = new Map<
    StateKey | `flag:${string}`,
    {
      sdk: WebExperiencesRuntime;
      read(): unknown;
    }
  >();

  function read<T>(key: StateKey | `flag:${string}`, select: (states: States) => Observable<T>): T {
    const sdk = owner.current.sdk;
    let cell = cells.get(key);
    if (cell?.sdk !== sdk) {
      const observable = untrack(() => select(sdk.states));
      let value: T;
      let connected = false;
      const subscribe = createSubscriber((update) => {
        if (!active) return;
        let closed = false;
        let subscribing = true;
        connected = true;
        const subscription = observable.subscribe((next) => {
          if (closed || !active) return;
          value = next;
          if (!subscribing) update();
        });
        subscribing = false;
        const stop = () => {
          if (closed) return;
          closed = true;
          connected = false;
          subscription.unsubscribe();
          cleanups.delete(stop);
        };
        if (active) cleanups.add(stop);
        else stop();
        return stop;
      });
      cell = {
        sdk,
        read() {
          subscribe();
          return connected ? value : untrack(() => observable.current);
        },
      };
      cells.set(key, cell);
    }
    return cell.read() as T;
  }

  const state = new Proxy(
    {
      get status() {
        return owner.current.status;
      },
      get ready() {
        return owner.current.status === 'ready';
      },
      get error() {
        return owner.current.error;
      },
      flag(name: string) {
        return read(`flag:${name}`, (states) => states.flag(name));
      },
    } as ExperiencesState,
    {
      get(target, key, receiver) {
        if (key in target) return Reflect.get(target, key, receiver);
        return read<StateValues[StateKey]>(key as StateKey, (states) => states[key as StateKey]);
      },
    }
  );

  const methods = new Map<PropertyKey, unknown>();
  const dispose = () =>
    untrack(() => {
      scope.dispose();
    });
  const tracking = new Proxy({} as WebExperiencesRuntime['tracking'], {
    get(_target, key) {
      if (!methods.has(`tracking:${String(key)}`))
        methods.set(`tracking:${String(key)}`, (...args: unknown[]) =>
          untrack(() => {
            const controls = owner.current.sdk.tracking;
            return Reflect.apply(Reflect.get(controls, key), controls, args);
          })
        );
      return methods.get(`tracking:${String(key)}`);
    },
  });
  const runtime = new Proxy({} as WebExperiencesRuntime, {
    get(_target, key) {
      if (key === 'tracking') return tracking;
      if (key === 'destroy') return dispose;
      if (key === 'reset') {
        if (!methods.has(key))
          methods.set(key, () =>
            untrack(() => {
              if (source) source.reset();
              else presentation.reset();
              route.reset();
              owner.current.sdk.reset();
            })
          );
        return methods.get(key);
      }
      if (key === 'locale') return state.locale;
      const value = untrack(() => {
        const sdk = owner.current.sdk;
        return Reflect.get(sdk, key, sdk);
      });
      if (typeof value !== 'function') {
        const sdk = owner.current.sdk;
        return Reflect.get(sdk, key, sdk);
      }
      if (!methods.has(key))
        methods.set(key, (...args: unknown[]) =>
          untrack(() => {
            const current = owner.current.sdk;
            return Reflect.apply(Reflect.get(current, key, current), current, args);
          })
        );
      return methods.get(key);
    },
  });

  const scope: RuntimeScope = {
    owner,
    get source() {
      return (source ??= createPrimarySource({
        getSdk,
        getLocale: () => state.locale,
        route,
        presentation,
      }));
    },
    presentation,
    route,
    runtime,
    state,
    dispose() {
      if (!active) return;
      active = false;
      try {
        if (source) source.dispose();
        else presentation.reset();
        route.dispose();
        for (const cleanup of cleanups) cleanup();
        cells.clear();
      } finally {
        owner.dispose();
      }
    },
  };
  setContext(RUNTIME_KEY, scope);
  onDestroy(() => scope.dispose());
  return scope;
}

export function hasRuntimeScope(): boolean {
  return getContext(RUNTIME_KEY) !== undefined;
}

export function getRuntimeScope(): RuntimeScope {
  const scope = getContext<RuntimeScope | undefined>(RUNTIME_KEY);
  if (!scope)
    throw new Error('Experiences accessors require an ExperiencesRoot or ExperiencesProvider.');
  return scope;
}

/** Live forwarding facade. Call during component initialization. */
export function getExperiences(): WebExperiencesRuntime {
  return getRuntimeScope().runtime;
}
/** Reactive readonly values; read properties without destructuring to retain reactivity. */
export function getExperiencesState(): ExperiencesState {
  return getRuntimeScope().state;
}
/** Receiver-bound actions always target the current owner. */
export function getExperiencesActions(): ExperiencesActions {
  return getRuntimeScope().runtime;
}

/** Internal result-family boundary; acquisition supplies the original result type. */
export function getRuntimePresentation<T>(): Presentation<T> {
  return getRuntimeScope().presentation as unknown as Presentation<T>;
}
