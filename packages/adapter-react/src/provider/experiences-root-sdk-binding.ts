// Adapted from Optimization's presentation/optimizationRootRuntime.ts at
// 59add9d6ebff503b9033a59a2eee0149d4b4e925 (MIT).
import {
  ContentfulExperiences,
  type ExperiencesWebConfig,
  type WebExperiencesRuntime,
} from '@contentful/experiences-web';

export type OnStatesReady = (states: WebExperiencesRuntime['states']) => void | (() => void);

export interface ExperiencesRootSdkBinding<
  TSdk extends WebExperiencesRuntime = ContentfulExperiences,
> {
  readonly cleanup?: () => void;
  readonly ownsInstance: boolean;
  readonly sdk: TSdk;
}

export interface CreateInjectedExperiencesRootSdkBindingOptions<
  TSdk extends WebExperiencesRuntime,
> {
  readonly sdk: TSdk;
  readonly onStatesReady?: OnStatesReady;
}

export interface CreateOwnedExperiencesRootSdkBindingOptions<
  TSdk extends WebExperiencesRuntime = ContentfulExperiences,
> {
  readonly config: ExperiencesWebConfig;
  readonly createSdk?: (config: ExperiencesWebConfig) => TSdk;
  readonly onStatesReady?: OnStatesReady;
}

export function createExperiencesRootSdkBinding<TSdk extends WebExperiencesRuntime>(
  options:
    | CreateInjectedExperiencesRootSdkBindingOptions<TSdk>
    | (CreateOwnedExperiencesRootSdkBindingOptions<TSdk> & {
        readonly createSdk: (config: ExperiencesWebConfig) => TSdk;
      })
): ExperiencesRootSdkBinding<TSdk>;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a runtime redeclaration.
export function createExperiencesRootSdkBinding(
  options: CreateOwnedExperiencesRootSdkBindingOptions
): ExperiencesRootSdkBinding;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation.
export function createExperiencesRootSdkBinding(
  options:
    | CreateInjectedExperiencesRootSdkBindingOptions<WebExperiencesRuntime>
    | CreateOwnedExperiencesRootSdkBindingOptions<WebExperiencesRuntime>
): ExperiencesRootSdkBinding<WebExperiencesRuntime> {
  const ownsInstance = !('sdk' in options);
  const sdk =
    'sdk' in options
      ? options.sdk
      : (options.createSdk ?? ((config) => new ContentfulExperiences(config)))(options.config);
  try {
    const cleanup = options.onStatesReady?.(sdk.states);
    return { sdk, ownsInstance, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
  } catch (error) {
    if (ownsInstance) sdk.destroy();
    throw error;
  }
}

/** Dispose app subscriptions first, then request the runtime's final lifetime transition. */
export function disposeExperiencesRootSdkBinding(
  binding: ExperiencesRootSdkBinding<WebExperiencesRuntime> | undefined
): void {
  try {
    binding?.cleanup?.();
  } finally {
    if (binding?.ownsInstance) binding.sdk.destroy();
  }
}
