import type {
  LivePreviewOptions as SessionPreviewOptions,
  LivePreviewModule,
} from '@contentful/experiences-runtime';

/** Contentful Live Preview configuration; unrelated to Personalization API preflight. */
export interface LivePreviewOptions {
  readonly enabled: boolean;
  /** Request roots infer this from the primary Experience. */
  readonly experienceId?: string;
  readonly sessionHost?: string;
  readonly resourceResolution?: string;
  readonly loadImplementation?: () => LivePreviewModule | Promise<LivePreviewModule>;
}

export interface LivePreviewConfig extends LivePreviewOptions {
  readonly loadImplementation: NonNullable<LivePreviewOptions['loadImplementation']>;
}

export function livePreviewSessionId(config: LivePreviewOptions, url: string) {
  return config.enabled
    ? new URL(url, 'https://nextjs.invalid').searchParams.get('preview_session_id')?.trim() ||
        undefined
    : undefined;
}

export function resolveLivePreview(
  config: LivePreviewOptions,
  url: string,
  experienceId = config.experienceId
): SessionPreviewOptions | undefined {
  const sessionId = livePreviewSessionId(config, url);
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
export function mergeLivePreview(
  configured: SessionPreviewOptions | LivePreviewOptions | undefined,
  supplied: SessionPreviewOptions | LivePreviewOptions | undefined
) {
  return configured && supplied && 'enabled' in configured && 'enabled' in supplied
    ? { ...configured, ...supplied }
    : (supplied ?? configured);
}
