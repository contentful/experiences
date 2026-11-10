import type { Config } from '@contentful/experiences-web';

/** Literal Delivery configuration; tokenless hosts explicitly designate a trusted proxy. */
type BrowserDeliveryConfig = Pick<
  Config['delivery'],
  'timeoutInSeconds' | 'maxRetries' | 'xContentfulEnableAlphaFeature'
> & {
  readonly headers?: Readonly<Record<string, string>>;
} & (
    | { readonly accessToken: string; readonly host?: string }
    | { readonly accessToken?: never; readonly host: string }
  );

type QueuePolicy = NonNullable<Config['queuePolicy']>;
type FlushPolicy = NonNullable<QueuePolicy['flush']>;

/**
 * Explicit browser-visible data, copied by the server's strict JSON projection.
 * Scope and locale come from the server binding. Functions require a custom client root.
 */
export interface BrowserConfig {
  readonly delivery: BrowserDeliveryConfig;
  readonly preview?: BrowserDeliveryConfig;
  readonly isPreview?: boolean;
  readonly optimization?: Pick<
    NonNullable<Config['optimization']>,
    'personalizationBaseUrl' | 'analyticsBaseUrl' | 'personalizationEnabledFeatures'
  >;
  readonly autoTrackEntryInteraction?: Config['autoTrackEntryInteraction'];
  readonly allowedEventTypes?: Config['allowedEventTypes'];
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
