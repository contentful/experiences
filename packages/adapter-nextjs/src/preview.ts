import type {
  RuntimePreviewConfig,
  RuntimePreviewSessionOptions,
} from '@contentful/experiences-runtime';
import { resolvePreviewSessionId } from '@contentful/experiences-runtime';

/** Next-only deployment gate layered over the normal Preview transport/context. */
export type NextjsPreviewConfig = Partial<RuntimePreviewConfig> & { readonly enabled?: boolean };
export type NextjsPreviewContext = Pick<
  NextjsPreviewConfig,
  'enabled' | 'sessionId' | 'sessionHost' | 'resourceResolution'
>;

function sessionId(config: NextjsPreviewConfig, url: string): string | undefined {
  return config.enabled === false
    ? undefined
    : resolvePreviewSessionId(
        config.sessionId,
        new URL(url, 'https://nextjs.invalid').searchParams
      );
}

export function resolveNextjsPreview(
  config: NextjsPreviewConfig | undefined,
  url: string
): RuntimePreviewConfig | undefined {
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
export function mergeNextjsPreview(
  configured: NextjsPreviewConfig | undefined,
  supplied: NextjsPreviewConfig | undefined
): NextjsPreviewConfig | undefined {
  return supplied ? { ...configured, ...supplied } : configured;
}

/** Request facades receive only session context; their SDK retains credentials and factory. */
export function resolveNextjsPreviewSession(
  config: NextjsPreviewConfig | undefined,
  url: string
): RuntimePreviewSessionOptions | undefined {
  const selected = config && sessionId(config, url);
  return selected
    ? {
        sessionId: selected,
        sessionHost: config?.sessionHost,
        resourceResolution: config?.resourceResolution,
      }
    : undefined;
}
