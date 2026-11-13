import type { Config } from '@contentful/experiences-web';
import type {
  BrowserConfig,
  RequestResult,
} from '@contentful/experiences-nextjs/app-router/client';

export interface BrowserEnvironment {
  readonly web: Pick<Config, 'spaceId' | 'environmentId' | 'locale'> &
    Pick<BrowserConfig, 'delivery' | 'preview'>;
  readonly experienceIds: string[];
  /** Optional Destination routes; absent keeps them unconfigured. Not a credential. */
  readonly destination?: DestinationSettings;
  readonly livePreview?: {
    readonly experienceId: string;
    readonly sessionHost?: string;
    readonly resourceResolution?: string;
  };
}

export type ContentSeed = RequestResult;

/** The by-id descriptor of a diagnostic seed; Destination selectors return undefined. */
export function experienceDescriptor(seed: ContentSeed | undefined) {
  return seed && 'experienceId' in seed.experience ? seed.experience : undefined;
}

export interface DestinationSettings {
  readonly id: string;
  readonly path: string;
  readonly nodeId: string;
  readonly redirectPath: string;
  readonly missingPath: string;
}

function destinationPath(value: string | undefined, fallback: string) {
  const path = value?.trim() || fallback;
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Destination paths must be absolute and start with a single /.');
  return path;
}

/** Fixture defaults from lib/mocks/scripts/seedDestination.ts; unset DESTINATION_ID disables. */
export function destinationSettings(
  env: Record<string, string | undefined>
): DestinationSettings | undefined {
  const id = env.DESTINATION_ID?.trim();
  if (!id) return undefined;
  return {
    id,
    path: destinationPath(env.DESTINATION_PATH, '/getting-started'),
    nodeId: env.DESTINATION_NODE_ID?.trim() || 'spring-offers',
    redirectPath: destinationPath(env.DESTINATION_REDIRECT_PATH, '/quick-start'),
    missingPath: destinationPath(env.DESTINATION_MISSING_PATH, '/retired-page'),
  };
}

export type DestinationRouter = 'app' | 'pages';
// Application routes: `<prefix>/<path>` selects that Destination path, `<node>` the node.
export const destinationRoutes = {
  app: { prefix: '/destination', node: '/destination-node' },
  pages: { prefix: '/pages/destination', node: '/pages/destination-node' },
} as const;

/** The Destination path an application route selects, or undefined for other routes. */
export function destinationPathForRoute(pathname: string, router: DestinationRouter) {
  const { prefix } = destinationRoutes[router];
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return undefined;
  return pathname.slice(prefix.length) || '/';
}

/** The same mode selection as the diagnostic routes: `?mode=server-only` is SSR. */
export function referenceRequestMode(url: URL): 'ssr' | 'hybrid' {
  return url.searchParams.get('mode') === 'server-only' ? 'ssr' : 'hybrid';
}

/** The application route presenting a Destination path in the current rendering mode. */
export function destinationRoute(path: string, router: DestinationRouter, serverOnly = false) {
  const { prefix } = destinationRoutes[router];
  return `${path === '/' ? prefix : `${prefix}${path}`}${serverOnly ? '?mode=server-only' : ''}`;
}

/** Maps a redirect's Destination path to this router's route, keeping the request's mode. */
export function destinationRedirectLocation(router: DestinationRouter) {
  return (path: string, result: Pick<RequestResult, 'routeKey'>) =>
    destinationRoute(
      path,
      router,
      referenceRequestMode(new URL(result.routeKey, 'https://nextjs.invalid')) === 'ssr'
    );
}

/** Exactly one primary per request: the route's Destination path, otherwise the node. */
export function destinationSelector(
  destination: DestinationSettings,
  url: URL,
  router: DestinationRouter
) {
  const path = destinationPathForRoute(url.pathname, router);
  return path === undefined
    ? { destinationId: destination.id, nodeId: destination.nodeId }
    : { destinationId: destination.id, path };
}

export function routeIds(pathname: string, ids: readonly string[]) {
  const display = pathname.endsWith('/page-two') ? ids.slice(-1) : [...ids];
  return [...new Set([...display, ids[0]])];
}

export const consentCookies = {
  events: 'experiences-nextjs-event-consent',
  persistence: 'experiences-nextjs-persistence-consent',
} as const;

export function consentDecision(value: string | undefined) {
  return value === 'granted' ? true : value === 'denied' ? false : undefined;
}

// Only deployment-enabled preview with an actual URL session selects preview policy.
export function previewBinding(environment: BrowserEnvironment, url: URL) {
  const sessionId = url.searchParams.get('preview_session_id')?.trim();
  return environment.livePreview && sessionId
    ? {
        ...environment.livePreview,
        experienceId:
          url.searchParams.get('preview_experience_id')?.trim() ||
          environment.livePreview.experienceId,
        sessionId,
      }
    : undefined;
}

export function primaryExperience(
  environment: BrowserEnvironment,
  url: URL,
  fallbackExperienceId: string
) {
  const preview = previewBinding(environment, url);
  return {
    experienceId: preview?.experienceId || fallbackExperienceId,
    ...(preview ? {} : { extensions: { sourceMap: {} } }),
  };
}

export function previewConfiguration(binding: ReturnType<typeof previewBinding>) {
  return binding
    ? {
        sessionId: binding.sessionId,
        sessionHost: binding.sessionHost,
        resourceResolution: binding.resourceResolution,
      }
    : undefined;
}
