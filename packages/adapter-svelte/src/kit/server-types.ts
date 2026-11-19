import type { RequestEvent } from '@sveltejs/kit';
import type {
  Config as NodeConfig,
  ConsentInput,
  FetchExperienceOptions,
  FetchResolveOptions,
  RequestRuntime,
  PageViewBuilderArgs,
} from '@contentful/experiences-node';
import type { Config as WebConfig } from '@contentful/experiences-web';
import type { Config } from '../registry/types.js';
import type { RequestResult } from './request-result.js';
import type { RawRequestResult } from './request-projection.js';

export type { PreparationInput } from './request-protocol.js';

export interface ServerOperationContext {
  readonly url: URL;
  readonly routeKey: string;
  readonly experience: FetchExperienceOptions;
  readonly eventFree: boolean;
  /** Untrusted caller overrides, available for application authorization. */
  readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
}

export type ServerValue<T> =
  T | ((event: RequestEvent, context: ServerOperationContext) => T | Promise<T>);

export interface ServerBindingOptions extends NodeConfig {
  readonly config: Config;
  readonly endpoint: string;
  readonly cookie?: WebConfig['cookie'];
  readonly consent: {
    readonly server: ServerValue<ConsentInput>;
    readonly clientDefaults?: Pick<
      NonNullable<WebConfig['defaults']>,
      'consent' | 'persistenceConsent'
    >;
  };
  readonly request: {
    /** Selects the mode of an authorized ordinary document preparation. */
    readonly mode: ServerValue<'ssr' | 'hybrid'>;
    readonly authorizeExperience: (
      event: RequestEvent,
      experience: FetchExperienceOptions,
      context: ServerOperationContext
    ) => boolean | Promise<boolean>;
    readonly resolveOptions?: ServerValue<Omit<FetchResolveOptions, 'config'>>;
    readonly initialEvents?: ServerValue<
      NonNullable<FetchExperienceOptions['personalization']>['events']
    >;
    readonly pagePayload?: ServerValue<PageViewBuilderArgs>;
    readonly metadataKeys?: readonly string[];
    /** Runs for preparation only; event-free reads never invoke composition hooks. */
    readonly composeRequest?: (
      request: RequestRuntime,
      primary: RawRequestResult,
      event: RequestEvent,
      context: ServerOperationContext
    ) => void | Promise<void>;
    readonly onResult?: (event: RequestEvent, result: Readonly<RequestResult>) => void;
  };
}

export type SvelteKitServerExperiencesOptions = ServerBindingOptions;
