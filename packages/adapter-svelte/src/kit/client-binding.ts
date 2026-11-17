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
  type InjectedOwnerTarget,
  type OnStatesReady,
  type OwnerTarget,
  type OwnedOwnerTarget,
  type RuntimeOwner,
} from '../runtime/owner-controller.svelte.js';
import KitRoot from './KitRoot.svelte';
import KitProvider from './KitProvider.svelte';

export type SvelteKitClientExperiencesOptions = WebConfig & {
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
  sdk: ContentfulExperiences;
  onStatesReady?: OnStatesReady;
}

/** @internal Shared only by the bound components and the client startup hook. */
export interface KitClientBinding {
  readonly target: OwnedOwnerTarget;
  selectOwnedOwner(
    target: OwnedOwnerTarget,
    snapshot?: ExperiencesSnapshot
  ): RuntimeOwner | undefined;
  getOwner(target: OwnerTarget, snapshot?: ExperiencesSnapshot): RuntimeOwner | undefined;
  rebindInjected(target: InjectedOwnerTarget): void;
}

/** Bind once in a browser-safe module. Binding itself never constructs a Web SDK. */
export function bindSvelteKitClientExperiences(options: SvelteKitClientExperiencesOptions) {
  const { config: _config, endpoint: _endpoint, onStatesReady, ...browserConfig } = options;
  let owner: RuntimeOwner | undefined;
  let activeTarget: OwnerTarget | undefined;
  let activeSession: string | undefined;
  const session = () =>
    typeof window !== 'undefined' && browserConfig.preview
      ? resolvePreviewSessionId(new URLSearchParams(window.location.search))
      : undefined;
  const target: OwnedOwnerTarget = { config: browserConfig, onStatesReady };
  const binding: KitClientBinding = {
    target,
    selectOwnedOwner(nextTarget, snapshot) {
      if (owner && activeTarget && 'config' in activeTarget && activeSession !== session()) {
        owner.dispose();
        snapshot = snapshot ? { ...snapshot, data: undefined } : undefined;
      }
      return binding.getOwner(nextTarget, snapshot);
    },
    getOwner(nextTarget, snapshot) {
      if (typeof window === 'undefined') return undefined;
      if (owner?.current.status === 'disposed') {
        owner = undefined;
        activeTarget = undefined;
      }
      if (owner && activeTarget && 'sdk' in activeTarget !== 'sdk' in nextTarget) {
        throw new Error(
          'The bound Experiences owner cannot be replaced by a different injected SDK.'
        );
      }
      if (!owner) {
        owner = createRuntimeOwner(snapshot);
        activeTarget = nextTarget;
        activeSession = session();
      }
      return owner;
    },
    rebindInjected(nextTarget) {
      activeTarget = nextTarget;
      owner?.rebindInjected(nextTarget);
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
        const shared = binding.getOwner(activeTarget ?? target);
        // Activation records construction/setup failures; it starts no content operation.
        shared?.activate(activeTarget ?? target);
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
