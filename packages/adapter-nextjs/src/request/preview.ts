import type {
  PreviewConfig as SessionPreviewConfig,
  PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';

/**
 * Partial overrides are merged: defined values win, while omitted or explicitly
 * undefined values inherit the configured value. Undefined cannot clear a field.
 * Active browser Preview still requires accessToken or a trusted proxy host;
 * sessionHost alone does not provide API authentication.
 */
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
    'Browser Preview requires preview.accessToken or an explicit trusted proxy preview.host. ' +
      'preview.sessionHost does not supply API authentication. Server credentials are not copied to browser roots.'
  );
}

/** Defined overrides win; omitted or undefined values retain the configured value. */
export function mergePreview(
  configured: PreviewConfig | undefined,
  supplied: PreviewConfig | undefined
): PreviewConfig | undefined {
  return supplied
    ? {
        ...configured,
        ...Object.fromEntries(Object.entries(supplied).filter(([, value]) => value !== undefined)),
      }
    : configured;
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
