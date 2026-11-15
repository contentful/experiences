import type {
  PreviewConfig as SessionPreviewConfig,
  PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';

export type PreviewConfig = Partial<SessionPreviewConfig>;
export type PreviewContext = Pick<PreviewConfig, 'sessionHost' | 'resourceResolution'>;

export function resolvePreview(
  config: PreviewConfig | undefined,
  url: string
): SessionPreviewConfig | undefined {
  if (!config) return undefined;
  if (config.accessToken !== undefined) return { ...config, accessToken: config.accessToken };
  if (config.host !== undefined) return { ...config, accessToken: undefined, host: config.host };
  if (!resolvePreviewSession(config, url)) return undefined;
  throw new TypeError(
    'Preview requires browser or server credentials, or an explicit trusted proxy host.'
  );
}

/** Metadata overrides context only; credentials and factory remain application-owned. */
export function mergePreview(
  configured: PreviewConfig | undefined,
  supplied: PreviewConfig | undefined
): PreviewConfig | undefined {
  return supplied ? { ...configured, ...supplied } : configured;
}

/** Request facades receive only session context; their SDK retains credentials and factory. */
export function resolvePreviewSession(
  config: PreviewConfig | undefined,
  url: string
): PreviewSessionOptions | undefined {
  const selected =
    config && resolvePreviewSessionId(new URL(url, 'https://nextjs.invalid').searchParams);
  return selected
    ? {
        sessionId: selected,
        sessionHost: config?.sessionHost,
        resourceResolution: config?.resourceResolution,
      }
    : undefined;
}
