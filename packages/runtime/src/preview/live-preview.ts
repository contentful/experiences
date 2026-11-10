import { PREVIEW_HOST } from '@contentful/experiences-client';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  Config,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '../runtime/contentful-experiences.js';

export type PreviewStatus = 'live' | 'static';
export interface PreviewClient {
  getResult(): { readonly data: ExperiencePayload | undefined; readonly error: Error | undefined };
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: PreviewStatus) => void): () => void;
}
export interface PreviewSessionIdentity {
  spaceId: string;
  environmentId: string;
  sessionId: string;
  resourceResolution?: string;
}
/** Structural public module contract; no import of the optional package is required. */
export interface LivePreviewModule {
  fetchPreviewSession(
    session: PreviewSessionIdentity,
    client: { previewToken: string; host?: string },
    resolve: FetchResolveOptions
  ): Promise<PortableRenderPlan>;
  createLivePreviewClient(
    session: PreviewSessionIdentity & {
      previewToken: string;
      sessionHost?: string;
      debug?: boolean;
    },
    initialPayload?: ExperiencePayload
  ): PreviewClient;
  sendPreviewStatus(status: PreviewStatus): void;
}
export interface LivePreviewBinding {
  experienceId: string;
  sessionId: string;
  resourceResolution?: string;
  sessionHost?: string;
  implementation: LivePreviewModule;
}
export interface LivePreviewOptions extends Omit<LivePreviewBinding, 'implementation'> {
  loadImplementation(): LivePreviewModule | Promise<LivePreviewModule>;
}
export type LivePreviewConfig = Pick<
  Config,
  'spaceId' | 'environmentId' | 'preview' | 'resolveDefaults'
>;

/** Owners retain the returned promise to share initialization within their own lifetime. */
export async function initializeLivePreview({
  loadImplementation,
  ...binding
}: LivePreviewOptions): Promise<LivePreviewBinding> {
  return { ...binding, implementation: await loadImplementation() };
}

/** Call only after selecting the matching session, before ordinary-source enrichment. */
export function assertPreviewRequest(options: FetchExperienceOptions): void {
  for (const key of ['locale', 'parameters', 'extensions'] as const) {
    if (options[key] !== undefined) {
      throw new TypeError(`Preview Session ${key} is server-owned and cannot be overridden`);
    }
  }
}

export function mergePreviewResolveOptions(
  config: LivePreviewConfig,
  resolve: FetchResolveOptions
): FetchResolveOptions {
  return {
    config: resolve.config,
    metadata: { ...config.resolveDefaults?.metadata, ...resolve.metadata },
    debug: resolve.debug ?? config.resolveDefaults?.debug,
  };
}

/** Resolve options must already include the owner's applicable defaults. */
export async function fetchPreviewSession(
  binding: LivePreviewBinding,
  config: LivePreviewConfig,
  resolve: FetchResolveOptions
): Promise<PortableRenderPlan> {
  // Preview API returns a resolved plan, without a raw payload or AbortSignal.
  // Owners adopt the plan and discard obsolete completions; HTTP work continues.
  const client = await previewClientOptions(config);
  return binding.implementation.fetchPreviewSession(
    sessionIdentity(binding, config),
    client,
    resolve
  );
}

export async function createPreviewClient(
  binding: LivePreviewBinding,
  config: LivePreviewConfig,
  debug?: boolean
): Promise<PreviewClient> {
  const previewToken = await evaluatePreviewToken(config);
  return binding.implementation.createLivePreviewClient({
    ...sessionIdentity(binding, config),
    previewToken,
    sessionHost: binding.sessionHost,
    debug: debug ?? config.resolveDefaults?.debug,
  });
}

function sessionIdentity(
  binding: LivePreviewBinding,
  config: LivePreviewConfig
): PreviewSessionIdentity {
  return {
    spaceId: config.spaceId,
    environmentId: config.environmentId,
    sessionId: binding.sessionId,
    resourceResolution: binding.resourceResolution,
  };
}

async function evaluatePreviewToken(config: LivePreviewConfig): Promise<string> {
  // Preview API accepts a token string: evaluate SDK suppliers at this boundary.
  // Socket reconnects reuse that value; token rotation requires a new client.
  const token = config.preview?.accessToken;
  const previewToken = await (typeof token === 'function' ? token() : token);
  if (!previewToken) throw new TypeError('Live Preview requires preview.accessToken');
  return previewToken;
}

async function previewClientOptions(config: LivePreviewConfig) {
  // The snapshot helper accepts token/host strings and constructs its own HTTP client.
  const previewToken = await evaluatePreviewToken(config);
  const endpoint = config.preview?.host ?? config.preview?.environment ?? PREVIEW_HOST;
  const host = await (typeof endpoint === 'function' ? endpoint() : endpoint);
  return { previewToken, host };
}
