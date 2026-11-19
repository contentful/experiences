import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
import type { Component, Snippet } from 'svelte';
import type {
  Config as WebConfig,
  ContentfulExperiences,
  ExperiencesSnapshot,
} from '@contentful/experiences-web';
import type { Config } from '../registry/types.js';
import {
  createRuntimeOwner,
  type OnStatesReady,
  type OwnerTarget,
  type OwnedOwnerTarget,
  type RuntimeOwner,
} from '../runtime/owner-controller.svelte.js';
import KitRoot from './KitRoot.svelte';
import KitProvider from './KitProvider.svelte';
import ExperiencePresentation from '../experience/ExperiencePresentation.svelte';
import { getRuntimePresentation } from '../runtime/context.svelte.js';
import {
  usePresentation,
  type PresentationNotifications,
} from '../experience/presentation.svelte.js';
import type { RequestResult } from './request-result.js';
import type { PresentationProps } from '../experience/presentation-types.js';
type RequestExperienceProps = Omit<PresentationProps<RequestResult>, 'config'> &
  PresentationNotifications<RequestResult>;
function useManagedRequestExperience(getOptions?: () => PresentationNotifications<RequestResult>) {
  return usePresentation(getRuntimePresentation<RequestResult>(), getOptions, (result) =>
    result && 'requestId' in result ? result : undefined
  );
}
import { createClientLoader } from './client-loader.js';
import { createRequestController, type RequestController } from './request-controller.svelte.js';
import type { ManagedRequestSource } from './request-source.js';

export type SvelteKitClientExperiencesOptions = (WebConfig | { sdk: ContentfulExperiences }) & {
  config: Config;
  endpoint: string;
  onStatesReady?: OnStatesReady;
};

export interface KitExperiencesRootProps {
  source?: ManagedRequestSource;
  snapshot?: ExperiencesSnapshot;
  routeKey?: string;
  children?: Snippet;
}

export interface KitExperiencesProviderProps extends KitExperiencesRootProps {
  /** Caller-owned SDK captured during initialization for this activation. */
  sdk: ContentfulExperiences;
  onStatesReady?: OnStatesReady;
}

/** @internal Shared only by the bound components and the client startup hook. */
export interface KitClientBinding {
  readonly target: OwnerTarget;
  createController(redirect: (path: string) => void | Promise<unknown>): RequestController;
  selectOwnedOwner(
    target: OwnedOwnerTarget,
    snapshot?: ExperiencesSnapshot
  ): RuntimeOwner | undefined;
  getOwner(target?: OwnerTarget, snapshot?: ExperiencesSnapshot): RuntimeOwner | undefined;
}

/** Bind once in a browser-safe module. Binding itself never constructs a Web SDK. */
export function bindSvelteKitClientExperiences(options: SvelteKitClientExperiencesOptions) {
  const { config: _config, endpoint: _endpoint, onStatesReady, ...runtimeOptions } = options;
  let owner: RuntimeOwner | undefined;
  let initializedBeforeLoad = false;
  let controller: RequestController | undefined;
  let target: OwnerTarget =
    'sdk' in runtimeOptions
      ? { sdk: runtimeOptions.sdk, onStatesReady }
      : { config: runtimeOptions, onStatesReady };
  const session = () =>
    typeof window !== 'undefined' && 'config' in target && target.config.preview
      ? resolvePreviewSessionId(new URLSearchParams(window.location.search))
      : undefined;
  const binding: KitClientBinding = {
    createController(redirect) {
      const next = createRequestController(redirect);
      if (typeof window !== 'undefined') controller = next;
      return next;
    },
    get target() {
      return target;
    },
    selectOwnedOwner(nextTarget, snapshot) {
      if (owner?.owned && owner.sessionId !== session()) {
        owner.dispose();
        snapshot = snapshot ? { ...snapshot, data: undefined } : undefined;
      }
      return binding.getOwner(nextTarget, snapshot);
    },
    getOwner(nextTarget = target, snapshot) {
      if (typeof window === 'undefined') return undefined;
      if (owner && owner.owned !== 'config' in nextTarget) {
        throw new Error('The bound Experiences ownership mode cannot change after startup.');
      }
      if (!owner || owner.current.status === 'disposed') {
        target = nextTarget;
        owner = createRuntimeOwner(target, snapshot);
      }
      return owner;
    },
  };

  const ExperiencesRoot: Component<KitExperiencesRootProps> = (internals, props) =>
    KitRoot(internals, withBinding(props, binding));
  const ExperiencesProvider: Component<KitExperiencesProviderProps> = (internals, props) =>
    KitProvider(internals, withBinding(props, binding));

  const Experience: Component<RequestExperienceProps> = (internals, props) => {
    const current = useManagedRequestExperience(() => props);
    return ExperiencePresentation(
      internals,
      new Proxy(props as RequestExperienceProps & { config: Config; current: typeof current }, {
        get(target, key, receiver) {
          return key === 'config'
            ? _config
            : key === 'current'
              ? current
              : Reflect.get(target, key, receiver);
        },
      })
    );
  };
  const loadExperience = createClientLoader({
    endpoint: _endpoint,
    getOwner: () => binding.getOwner(),
    getCommittedSource: () => controller?.source,
    getCommittedSelection: () => controller?.selection,
    initializedBeforeLoad: () => initializedBeforeLoad,
  });
  return {
    request: {
      loadExperience,
      Experience,
      useManagedExperience: useManagedRequestExperience,
      /** Kit's client init hook: recoverable owner failure is stored for presentation. */
      async init(): Promise<void> {
        initializedBeforeLoad = typeof window !== 'undefined';
        const shared = binding.getOwner();
        // Activation records construction/setup failures; it starts no content operation.
        shared?.activate();
      },
      ExperiencesRoot,
      ExperiencesProvider,
    },
  };
}

function withBinding<T extends object>(
  props: T,
  binding: KitClientBinding
): T & { binding: KitClientBinding } {
  return new Proxy(props as T & { binding: KitClientBinding }, {
    get(target, key, receiver) {
      return key === 'binding' ? binding : Reflect.get(target, key, receiver);
    },
    has(target, key) {
      return key === 'binding' || Reflect.has(target, key);
    },
  });
}
