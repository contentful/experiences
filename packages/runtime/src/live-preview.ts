import { NotFoundError, type ContentfulViewDeliveryClient } from '@contentful/experiences-client';
import type { DeliveryClientOptions } from './create-runtime-delivery-client.js';
import type { ExperiencePayload } from '@contentful/experiences-sdk-core';
import type {
  Config,
  FetchExperienceOptions,
  FetchResolveOptions,
} from './contentful-experiences.js';

export type RuntimePreviewStatus = 'live' | 'static';
export interface RuntimePreviewClient {
  getResult(): { readonly data: ExperiencePayload | undefined; readonly error: Error | undefined };
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: RuntimePreviewStatus) => void): () => void;
}
export interface RuntimePreviewSessionIdentity {
  spaceId: string;
  environmentId: string;
  sessionId: string;
  resourceResolution?: string;
}
/** The synchronous createLivePreviewClient factory exported by the Preview package. */
export type RuntimePreviewClientOptions = RuntimePreviewSessionIdentity & {
  previewToken: string;
  sessionHost?: string;
  debug?: boolean;
};
export type RuntimePreviewClientFactory = (
  options: RuntimePreviewClientOptions
) => RuntimePreviewClient;
export type RuntimePreviewSessionOptions = Pick<
  RuntimePreviewSessionIdentity,
  'sessionId' | 'resourceResolution'
> & { sessionHost?: string };
export type RuntimePreviewConfig = DeliveryClientOptions & {
  /** Web defaults to preview_session_id in the URL; an explicit blank disables inference. */
  sessionId?: string;
  sessionHost?: string;
  resourceResolution?: string;
  /** Pass createLivePreviewClient from @contentful/experiences-live-preview. */
  createClient?: RuntimePreviewClientFactory;
};
export type RuntimeLivePreviewOwnerConfig = Pick<
  Config,
  'spaceId' | 'environmentId' | 'preview' | 'resolveDefaults'
>;

/** Call only after selecting the matching session, before ordinary-source enrichment. */
export function assertRuntimePreviewRequest(options: FetchExperienceOptions): void {
  for (const key of ['locale', 'parameters', 'extensions'] as const) {
    if (options[key] !== undefined) {
      throw new TypeError(`Preview Session ${key} is server-owned and cannot be overridden`);
    }
  }
}

export function mergeRuntimePreviewResolveOptions(
  config: RuntimeLivePreviewOwnerConfig,
  resolve: FetchResolveOptions
): FetchResolveOptions {
  return {
    config: resolve.config,
    metadata: { ...config.resolveDefaults?.metadata, ...resolve.metadata },
    debug: resolve.debug ?? config.resolveDefaults?.debug,
  };
}

/** @internal Fetch raw content so owners can match its actual Experience identity before resolution. */
export async function fetchRuntimePreviewSessionPayload(
  session: RuntimePreviewSessionIdentity,
  client: Pick<ContentfulViewDeliveryClient, 'fetch'>
): Promise<ExperiencePayload> {
  const { spaceId, environmentId, sessionId, resourceResolution } = session;
  const path =
    `/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environmentId)}` +
    `/preview_sessions/${encodeURIComponent(sessionId)}/experience`;
  const query =
    resourceResolution === undefined
      ? ''
      : `?${new URLSearchParams({ resource_resolution: resourceResolution })}`;
  try {
    const response = await client.fetch(path + query);
    if (response.status === 404) throw new NotFoundError();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as ExperiencePayload;
    if (!payload || !Array.isArray(payload.nodes) || payload.sys?.type !== 'Experience') {
      throw new Error('Response was not a valid Experience payload');
    }
    return payload;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    const failure = new Error(
      `Failed to fetch Preview Session "${sessionId}" (space "${spaceId}", environment "${environmentId}"): ${reason}`,
      { cause: error }
    );
    failure.name = 'PreviewSessionFetchError';
    throw failure;
  }
}

export async function createRuntimePreviewClient(
  session: RuntimePreviewSessionOptions,
  config: RuntimeLivePreviewOwnerConfig
): Promise<RuntimePreviewClient | undefined> {
  const createClient = config.preview?.createClient;
  if (!createClient) return undefined;
  const token = config.preview?.accessToken;
  const previewToken = await (typeof token === 'function' ? token() : token);
  if (!previewToken) throw new TypeError('Live Preview requires preview.accessToken');
  return createClient({
    ...session,
    spaceId: config.spaceId,
    environmentId: config.environmentId,
    previewToken,
    debug: config.resolveDefaults?.debug,
  });
}
