declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: string | undefined;
declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: string | undefined;

/**
 * Default library metadata attached to the context of built Events.
 *
 * Build artifacts receive their package metadata through tsup defines. Source
 * execution (including tests) uses stable fallback values instead.
 */
export const DEFAULT_EVENT_CONTEXT_LIBRARY = {
  name:
    typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__ === 'string'
      ? __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__
      : '@contentful/experiences-client',
  version:
    typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__ === 'string'
      ? __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__
      : '0.0.0',
};
