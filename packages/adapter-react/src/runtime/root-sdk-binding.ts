// Adapted from Optimization's presentation/optimizationRootRuntime.ts at
// 59add9d6ebff503b9033a59a2eee0149d4b4e925 (MIT).
import {
  ContentfulExperiences,
  type Config,
  type WebExperiencesRuntime,
} from '@contentful/experiences-web';

export type OnStatesReady = (states: WebExperiencesRuntime['states']) => void | (() => void);

export interface RootSdkBinding<TSdk extends WebExperiencesRuntime = ContentfulExperiences> {
  readonly cleanup?: () => void;
  readonly ownsInstance: boolean;
  readonly sdk: TSdk;
}

export interface CreateInjectedRootSdkBindingOptions<TSdk extends WebExperiencesRuntime> {
  readonly sdk: TSdk;
  readonly onStatesReady?: OnStatesReady;
}

export interface CreateOwnedRootSdkBindingOptions<
  TSdk extends WebExperiencesRuntime = ContentfulExperiences,
> {
  readonly config: Config;
  readonly createSdk?: (config: Config) => TSdk;
  readonly onStatesReady?: OnStatesReady;
}

export function createRootSdkBinding<TSdk extends WebExperiencesRuntime>(
  options:
    | CreateInjectedRootSdkBindingOptions<TSdk>
    | (CreateOwnedRootSdkBindingOptions<TSdk> & {
        readonly createSdk: (config: Config) => TSdk;
      })
): RootSdkBinding<TSdk>;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a runtime redeclaration.
export function createRootSdkBinding(options: CreateOwnedRootSdkBindingOptions): RootSdkBinding;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation.
export function createRootSdkBinding(
  options:
    | CreateInjectedRootSdkBindingOptions<WebExperiencesRuntime>
    | CreateOwnedRootSdkBindingOptions<WebExperiencesRuntime>
): RootSdkBinding<WebExperiencesRuntime> {
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
export function disposeRootSdkBinding(
  binding: RootSdkBinding<WebExperiencesRuntime> | undefined
): void {
  try {
    binding?.cleanup?.();
  } finally {
    if (binding?.ownsInstance) binding.sdk.destroy();
  }
}
