import type { ExperiencesWebConfig } from '@contentful/experiences-web';

/** Literal Delivery configuration; tokenless hosts explicitly designate a trusted proxy. */
type BrowserDeliveryConfig = Pick<
  ExperiencesWebConfig['delivery'],
  'timeoutInSeconds' | 'maxRetries' | 'xContentfulEnableAlphaFeature'
> & {
  readonly headers?: Readonly<Record<string, string>>;
} & (
    | { readonly accessToken: string; readonly host?: string }
    | { readonly accessToken?: never; readonly host: string }
  );

type QueuePolicy = NonNullable<ExperiencesWebConfig['queuePolicy']>;
type FlushPolicy = NonNullable<QueuePolicy['flush']>;

/**
 * Explicit browser-visible data, copied by the server's strict JSON projection.
 * Scope and locale come from the server binding. Functions require a custom client root.
 */
export interface NextjsBrowserConfig {
  readonly delivery: BrowserDeliveryConfig;
  readonly preview?: BrowserDeliveryConfig;
  readonly isPreview?: boolean;
  readonly optimization?: Pick<
    NonNullable<ExperiencesWebConfig['optimization']>,
    'personalizationBaseUrl' | 'analyticsBaseUrl' | 'personalizationEnabledFeatures'
  >;
  readonly autoTrackEntryInteraction?: ExperiencesWebConfig['autoTrackEntryInteraction'];
  readonly allowedEventTypes?: ExperiencesWebConfig['allowedEventTypes'];
  readonly queuePolicy?: {
    readonly offlineMaxEvents?: number;
    readonly flush?: Pick<
      FlushPolicy,
      | 'flushIntervalMs'
      | 'baseBackoffMs'
      | 'maxBackoffMs'
      | 'jitterRatio'
      | 'maxConsecutiveFailures'
      | 'circuitOpenMs'
    >;
  };
}
