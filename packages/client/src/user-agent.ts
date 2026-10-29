import { getUserAgentHeader } from 'contentful-sdk-core';

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

function format({ name, version }: SdkIdentity): string {
  return `${name.replace(/^@contentful\//, '')}/${version}`;
}

/**
 * Builds the `X-Contentful-User-Agent` header for Delivery and Preview
 * requests, e.g. `app my-site/1.0.0; sdk experiences-node/0.6.0; platform node.js/22.17.0; os macOS/v22.17.0;`.
 */
export function createUserAgentHeaders(
  sdk: SdkIdentity,
  app?: SdkIdentity
): Record<string, string> {
  return {
    [USER_AGENT_HEADER]: getUserAgentHeader(format(sdk), app ? format(app) : undefined),
  };
}
