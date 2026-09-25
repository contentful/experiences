declare const __EXPERIENCES_CLIENT_SDK_NAME__: string | undefined;
declare const __EXPERIENCES_CLIENT_SDK_VERSION__: string | undefined;

/**
 * The library identity attached to Events emitted by the client runtime.
 *
 * Build artifacts receive their package metadata through tsup defines. Source
 * execution (including tests) uses stable fallback values instead.
 */
export const eventBuilderLibrary = {
  name:
    typeof __EXPERIENCES_CLIENT_SDK_NAME__ === 'string'
      ? __EXPERIENCES_CLIENT_SDK_NAME__
      : '@contentful/experiences-client',
  version:
    typeof __EXPERIENCES_CLIENT_SDK_VERSION__ === 'string'
      ? __EXPERIENCES_CLIENT_SDK_VERSION__
      : '0.0.0',
};
