import type {
  RuntimeLivePreviewOptions,
  RuntimeLivePreviewModule,
} from '@contentful/experiences-runtime';

/** Contentful Live Preview configuration; unrelated to XPAPI preflight. */
export interface NextjsLivePreviewOptions {
  readonly enabled: boolean;
  /** Request roots infer this from the primary Experience. */
  readonly experienceId?: string;
  readonly sessionHost?: string;
  readonly resourceResolution?: string;
  readonly loadImplementation?: () => RuntimeLivePreviewModule | Promise<RuntimeLivePreviewModule>;
}

export interface NextjsLivePreviewConfig extends NextjsLivePreviewOptions {
  readonly loadImplementation: NonNullable<NextjsLivePreviewOptions['loadImplementation']>;
}

export function nextjsLivePreviewSessionId(config: NextjsLivePreviewOptions, url: string) {
  return config.enabled
    ? new URL(url, 'https://nextjs.invalid').searchParams.get('preview_session_id')?.trim() ||
        undefined
    : undefined;
}

export function resolveNextjsLivePreview(
  config: NextjsLivePreviewOptions,
  url: string,
  experienceId = config.experienceId
): RuntimeLivePreviewOptions | undefined {
  const sessionId = nextjsLivePreviewSessionId(config, url);
  const load = config.loadImplementation;
  if (!sessionId || !load) return undefined;
  if (!experienceId) throw new TypeError('Live Preview requires a primary Experience ID.');
  return {
    experienceId,
    sessionId,
    sessionHost: config.sessionHost,
    resourceResolution: config.resourceResolution,
    loadImplementation: load,
  };
}

/** Server data overrides configuration while the client retains its lazy loader. */
export function mergeNextjsLivePreview(
  configured: RuntimeLivePreviewOptions | NextjsLivePreviewOptions | undefined,
  supplied: RuntimeLivePreviewOptions | NextjsLivePreviewOptions | undefined
) {
  return configured && supplied && 'enabled' in configured && 'enabled' in supplied
    ? { ...configured, ...supplied }
    : (supplied ?? configured);
}
