declare const __EXPERIENCES_CLIENT_NAME__: string | undefined;
declare const __EXPERIENCES_CLIENT_VERSION__: string | undefined;

/** Header the Contentful JS SDKs use to report SDK identity, platform, and OS. */
export const USER_AGENT_HEADER = 'X-Contentful-User-Agent';

/** Package identity reported in the user-agent header. */
export type SdkIdentity = { name: string; version: string };

/**
 * Identity of this package. Build artifacts receive package metadata through
 * tsup defines; source execution (including tests) uses stable fallbacks.
 */
export const EXPERIENCES_CLIENT_SDK: SdkIdentity = {
  name:
    typeof __EXPERIENCES_CLIENT_NAME__ === 'string'
      ? __EXPERIENCES_CLIENT_NAME__
      : '@contentful/experiences-client',
  version:
    typeof __EXPERIENCES_CLIENT_VERSION__ === 'string' ? __EXPERIENCES_CLIENT_VERSION__ : '0.0.0',
};

// Ported from contentful-sdk-core `src/get-user-agent.ts` and `src/utils.ts` so
// the header matches contentful.js. `process` is read from `globalThis` instead
// of importing the `process` polyfill.

type NodeProcess = {
  browser?: boolean;
  platform?: string;
  version?: string;
  versions?: { node?: string };
};

function getProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

function isNode(): boolean {
  // Polyfills of `process` might set `process.browser === true`.
  const process = getProcess();
  return typeof process !== 'undefined' && !process.browser;
}

function isReactNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    'navigator' in window &&
    'product' in window.navigator &&
    window.navigator.product === 'ReactNative'
  );
}

function getNodeVersion(): string | undefined {
  const process = getProcess();
  return process?.versions?.node ? `v${process.versions.node}` : process?.version;
}

function getBrowserOS(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const userAgent = window.navigator.userAgent;
  // `platform` is deprecated but still the most reliable signal here.
  const platform = window.navigator.platform;
  const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
  const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
  const iosPlatforms = ['iPhone', 'iPad', 'iPod'];

  if (macosPlatforms.indexOf(platform) !== -1) {
    return 'macOS';
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    return 'iOS';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    return 'Windows';
  } else if (/Android/.test(userAgent)) {
    return 'Android';
  } else if (/Linux/.test(platform)) {
    return 'Linux';
  }

  return null;
}

type PlatformMap = Record<string, 'Android' | 'Linux' | 'Windows' | 'macOS'>;

function getNodeOS(): string | null {
  const process = getProcess();
  const platform = process?.platform || 'linux';
  const version = process?.version || '0.0.0';
  const platformMap: PlatformMap = {
    android: 'Android',
    aix: 'Linux',
    darwin: 'macOS',
    freebsd: 'Linux',
    linux: 'Linux',
    openbsd: 'Linux',
    sunos: 'Linux',
    win32: 'Windows',
  };
  if (platform in platformMap) {
    return `${platformMap[platform] || 'Linux'}/${version}`;
  }
  return null;
}

export function getUserAgentHeader(
  sdk: string,
  application?: string,
  integration?: string,
  feature?: string
): string {
  const headerParts = [];

  if (application) {
    headerParts.push(`app ${application}`);
  }

  if (integration) {
    headerParts.push(`integration ${integration}`);
  }

  if (feature) {
    headerParts.push('feature ' + feature);
  }

  headerParts.push(`sdk ${sdk}`);

  let platform: string | null;
  try {
    if (isReactNative()) {
      platform = getBrowserOS();
      headerParts.push('platform ReactNative');
    } else if (isNode()) {
      platform = getNodeOS();
      headerParts.push(`platform node.js/${getNodeVersion()}`);
    } else {
      platform = getBrowserOS();
      headerParts.push('platform browser');
    }
  } catch {
    platform = null;
  }

  if (platform) {
    headerParts.push(`os ${platform}`);
  }

  return `${headerParts.filter((item) => item !== '').join('; ')};`;
}

function format({ name, version }: SdkIdentity): string {
  return `${name.replace(/^@contentful\//, '')}/${version}`;
}

/**
 * Builds the `X-Contentful-User-Agent` header for Delivery and Preview
 * requests, e.g. `app my-site/1.0.0; sdk experiences-node/0.6.0; platform node.js/v22.17.0; os macOS/v22.17.0;`.
 */
export function createUserAgentHeaders(
  sdk: SdkIdentity,
  app?: SdkIdentity
): Record<string, string> {
  return {
    [USER_AGENT_HEADER]: getUserAgentHeader(format(sdk), app ? format(app) : undefined),
  };
}
