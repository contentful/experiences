import type {
  PreviewConfig as SessionPreviewConfig,
  PreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';

/** Next-only deployment gate layered over the normal Preview transport/context. */
export type PreviewConfig = Partial<SessionPreviewConfig> & { readonly enabled?: boolean };
export type PreviewContext = Pick<
  PreviewConfig,
  'enabled' | 'sessionId' | 'sessionHost' | 'resourceResolution'
>;

function sessionId(config: PreviewConfig, url: string): string | undefined {
  return config.enabled === false
    ? undefined
    : resolvePreviewSessionId(
        config.sessionId,
        new URL(url, 'https://nextjs.invalid').searchParams
      );
}

export function resolvePreview(
  config: PreviewConfig | undefined,
  url: string
): SessionPreviewConfig | undefined {
  if (!config) return undefined;
  const { enabled: _enabled, ...preview } = config;
  const context = { ...preview, sessionId: config.enabled === false ? '' : sessionId(config, url) };
  if (preview.accessToken !== undefined) return { ...context, accessToken: preview.accessToken };
  if (preview.host !== undefined) return { ...context, accessToken: undefined, host: preview.host };
  if (!context.sessionId) return undefined;
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
  const selected = config && sessionId(config, url);
  return selected
    ? {
        sessionId: selected,
        sessionHost: config?.sessionHost,
        resourceResolution: config?.resourceResolution,
      }
    : undefined;
}
