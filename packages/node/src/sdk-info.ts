declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: string | undefined;
declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: string | undefined;

/**
 * Library metadata attached to events built by the Node SDK.
 *
 * Build artifacts receive package metadata through tsup defines. Source
 * execution (including tests) deliberately uses stable fallback values.
 */
export const EXPERIENCES_NODE_SDK_NAME =
  typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__ === 'string'
    ? __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__
    : '@contentful/experiences-node';

export const EXPERIENCES_NODE_SDK_VERSION =
  typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__ === 'string'
    ? __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__
    : '0.0.0';

export const DEFAULT_EVENT_CONTEXT_LIBRARY = {
  name: EXPERIENCES_NODE_SDK_NAME,
  version: EXPERIENCES_NODE_SDK_VERSION,
};
