import { PREVIEW_HOST } from '@contentful/experiences-client';
import type { ExperiencePayload, PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  ContentfulExperiencesConfig,
  RuntimeFetchExperienceOptions,
  RuntimeFetchResolveOptions,
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
/** Structural public module contract; no import of the optional package is required. */
export interface RuntimeLivePreviewModule {
  fetchPreviewSession(
    session: RuntimePreviewSessionIdentity,
    client: { previewToken: string; host?: string },
    resolve: RuntimeFetchResolveOptions
  ): Promise<PortableRenderPlan>;
  createLivePreviewClient(
    session: RuntimePreviewSessionIdentity & {
      previewToken: string;
      sessionHost?: string;
      debug?: boolean;
    },
    initialPayload?: ExperiencePayload
  ): RuntimePreviewClient;
  sendPreviewStatus(status: RuntimePreviewStatus): void;
}
export interface RuntimeLivePreviewBinding {
  experienceId: string;
  sessionId: string;
  resourceResolution?: string;
  sessionHost?: string;
  implementation: RuntimeLivePreviewModule;
}
export type RuntimeLivePreviewInitializer = () =>
  RuntimeLivePreviewBinding | Promise<RuntimeLivePreviewBinding>;
export type RuntimeLivePreviewConfig = Pick<
  ContentfulExperiencesConfig,
  'spaceId' | 'environmentId' | 'preview' | 'resolveDefaults'
>;

/** Owners retain the returned promise to share initialization within their own lifetime. */
export async function initializeRuntimeLivePreview(
  initializer: RuntimeLivePreviewInitializer
): Promise<RuntimeLivePreviewBinding> {
  return { ...(await initializer()) };
}

/** Call only after selecting the matching session, before ordinary-source enrichment. */
export function assertRuntimePreviewRequest(options: RuntimeFetchExperienceOptions): void {
  for (const key of ['locale', 'parameters', 'extensions'] as const) {
    if (options[key] !== undefined) {
      throw new TypeError(`Preview Session ${key} is server-owned and cannot be overridden`);
    }
  }
}

export function mergeRuntimePreviewResolveOptions(
  config: RuntimeLivePreviewConfig,
  resolve: RuntimeFetchResolveOptions
): RuntimeFetchResolveOptions {
  return {
    config: resolve.config,
    metadata: { ...config.resolveDefaults?.metadata, ...resolve.metadata },
    debug: resolve.debug ?? config.resolveDefaults?.debug,
  };
}

export async function fetchRuntimePreviewSession(
  binding: RuntimeLivePreviewBinding,
  config: RuntimeLivePreviewConfig,
  resolve: RuntimeFetchResolveOptions
): Promise<PortableRenderPlan> {
  // Preview API returns a resolved plan, without a raw payload or AbortSignal.
  // Owners adopt the plan and discard obsolete completions; HTTP work continues.
  const merged = mergeRuntimePreviewResolveOptions(config, resolve);
  const client = await previewClientOptions(config);
  return binding.implementation.fetchPreviewSession(
    sessionIdentity(binding, config),
    client,
    merged
  );
}

export async function createRuntimePreviewClient(
  binding: RuntimeLivePreviewBinding,
  config: RuntimeLivePreviewConfig,
  debug?: boolean
): Promise<RuntimePreviewClient> {
  const previewToken = await evaluatePreviewToken(config);
  return binding.implementation.createLivePreviewClient({
    ...sessionIdentity(binding, config),
    previewToken,
    sessionHost: binding.sessionHost,
    debug: debug ?? config.resolveDefaults?.debug,
  });
}

function sessionIdentity(
  binding: RuntimeLivePreviewBinding,
  config: RuntimeLivePreviewConfig
): RuntimePreviewSessionIdentity {
  return {
    spaceId: config.spaceId,
    environmentId: config.environmentId,
    sessionId: binding.sessionId,
    resourceResolution: binding.resourceResolution,
  };
}

async function evaluatePreviewToken(config: RuntimeLivePreviewConfig): Promise<string> {
  // Preview API accepts a token string: evaluate SDK suppliers at this boundary.
  // Socket reconnects reuse that value; token rotation requires a new client.
  const token = config.preview?.accessToken;
  const previewToken = await (typeof token === 'function' ? token() : token);
  if (!previewToken) throw new TypeError('Live Preview requires preview.accessToken');
  return previewToken;
}

async function previewClientOptions(config: RuntimeLivePreviewConfig) {
  // The snapshot helper accepts token/host strings and constructs its own HTTP client.
  const previewToken = await evaluatePreviewToken(config);
  const endpoint = config.preview?.host ?? config.preview?.environment ?? PREVIEW_HOST;
  const host = await (typeof endpoint === 'function' ? endpoint() : endpoint);
  return { previewToken, host };
}
