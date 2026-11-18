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

export type SvelteKitClientExperiencesOptions = (WebConfig | { sdk: ContentfulExperiences }) & {
  config: Config;
  endpoint: string;
  onStatesReady?: OnStatesReady;
};

export interface KitExperiencesRootProps {
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
  let target: OwnerTarget =
    'sdk' in runtimeOptions
      ? { sdk: runtimeOptions.sdk, onStatesReady }
      : { config: runtimeOptions, onStatesReady };
  const session = () =>
    typeof window !== 'undefined' && 'config' in target && target.config.preview
      ? resolvePreviewSessionId(new URLSearchParams(window.location.search))
      : undefined;
  const binding: KitClientBinding = {
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

  return {
    request: {
      /** Kit's client init hook: recoverable owner failure is stored for presentation. */
      async init(): Promise<void> {
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
