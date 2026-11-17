import type { Component } from 'svelte';
import ExperiencesRoot from '../runtime/ExperiencesRoot.svelte';
import ExperiencesProvider from '../runtime/ExperiencesProvider.svelte';
import ExperienceRenderer from '../rendering/ClientExperienceRenderer.svelte';
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
}

/** Bind the registry once. Importing/binding never constructs a browser SDK. */
export function createExperiences({ config }: CreateExperiencesOptions): CreateExperiencesResult {
  const BoundExperienceRenderer: Component<BoundExperienceRendererProps> = (anchor, props) =>
    ExperienceRenderer(
      anchor,
      new Proxy(props as ClientExperienceRendererProps, {
        get(target, key, receiver) {
          return key === 'config' ? config : Reflect.get(target, key, receiver);
        },
      })
    );

  return { ExperiencesRoot, ExperiencesProvider, ExperienceRenderer: BoundExperienceRenderer };
}
