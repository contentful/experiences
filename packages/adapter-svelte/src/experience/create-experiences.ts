import type { Component } from 'svelte';
import ExperiencesRoot from '../runtime/ExperiencesRoot.svelte';
import ExperiencesProvider from '../runtime/ExperiencesProvider.svelte';
import ExperienceRenderer from '../rendering/ClientExperienceRenderer.svelte';
import Experience from './Experience.svelte';
import { useBoundManagedExperience } from './use-managed-experience.svelte.js';
import type { ManagedExperience } from './source-types.js';
import type { BoundExperienceProps, UseManagedExperienceOptions } from './presentation-types.js';
import type { ClientExperienceRendererProps } from '../rendering/component-props.js';
import type { Config } from '../registry/types.js';
import type { DestinationRedirectResult } from '@contentful/experiences-client';
import type { ExperiencesRootProps, ExperiencesProviderProps } from '../runtime/types.js';

export interface CreateExperiencesOptions {
  config: Config;
  /** Application redirect policy, used by managed content operations. */
  onRedirect?: (redirect: DestinationRedirectResult['redirect']) => void;
}

export type BoundExperienceRendererProps = Omit<ClientExperienceRendererProps, 'config'>;

export interface CreateExperiencesResult {
  ExperiencesRoot: Component<ExperiencesRootProps>;
  ExperiencesProvider: Component<ExperiencesProviderProps>;
  ExperienceRenderer: Component<BoundExperienceRendererProps>;
  Experience: Component<BoundExperienceProps>;
  useManagedExperience(getOptions?: () => UseManagedExperienceOptions): ManagedExperience;
}

/** Bind the registry once. Importing/binding never constructs a browser SDK. */
export function createExperiences({
  config,
  onRedirect,
}: CreateExperiencesOptions): CreateExperiencesResult {
  const BoundExperienceRenderer: Component<BoundExperienceRendererProps> = (anchor, props) =>
    ExperienceRenderer(
      anchor,
      new Proxy(props as ClientExperienceRendererProps, {
        get(target, key, receiver) {
          return key === 'config' ? config : Reflect.get(target, key, receiver);
        },
      })
    );

  const BoundExperience: Component<BoundExperienceProps> = (anchor, props) =>
    Experience(
      anchor,
      new Proxy(props as import('./presentation-types.js').ExperienceProps, {
        get(target, key, receiver) {
          if (key === 'config') return config;
          if (key === 'onRedirect') return target.onRedirect ?? onRedirect;
          return Reflect.get(target, key, receiver);
        },
      })
    );
  return {
    ExperiencesRoot,
    ExperiencesProvider,
    ExperienceRenderer: BoundExperienceRenderer,
    Experience: BoundExperience,
    useManagedExperience: (getOptions) =>
      useBoundManagedExperience(config, getOptions, () => ({ onRedirect })),
  };
}
