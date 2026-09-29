declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__: string | undefined;
declare const __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__: string | undefined;

/** Package identity attached to events built by the Web SDK. */
export const EXPERIENCES_WEB_SDK_NAME =
  typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__ === 'string'
    ? __DEFAULT_EVENT_CONTEXT_LIBRARY_NAME__
    : '@contentful/experiences-web';

/** Package version attached to events built by the Web SDK. */
export const EXPERIENCES_WEB_SDK_VERSION =
  typeof __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__ === 'string'
    ? __DEFAULT_EVENT_CONTEXT_LIBRARY_VERSION__
    : '0.0.0';

/** @internal Stable library metadata supplied to the shared EventBuilder. */
export const DEFAULT_EVENT_CONTEXT_LIBRARY = {
  name: EXPERIENCES_WEB_SDK_NAME,
  version: EXPERIENCES_WEB_SDK_VERSION,
};
