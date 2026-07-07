/*
 * postMessage transport for the preview side (inside the iframe).
 *
 * Origin resolution follows `@contentful/live-preview` conventions:
 *   1. Resolve editor origin from window.location.ancestorOrigins
 *      (fallback: document.referrer for Firefox).
 *   2. Match against a hardcoded allow-list — production + localhost.
 *   3. Nothing matches and no `targetOrigin` override supplied → return
 *      `undefined` from the factory; the caller decides whether to throw
 *      (dev) or silently skip (production without editor).
 *
 * Receive-side filtering is by payload `source` token, not by
 * `event.origin` — matches Live Preview's convention and lets a browser
 * extension or test harness inject messages without spoofing the origin.
 */

import type { MessageHandler, PreviewChannel } from './channel';
import { SOURCE, isEnvelope, type AnyMessage, type MessageType } from './protocol';

const LOCALHOST_PREFIX = 'http://localhost:';

// Default allow-list: production + a localhost wildcard so dev servers on
// any port work without an explicit override. Staging is excluded on
// purpose — apps embedding against staging must supply `targetOrigin`.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://app.contentful.com',
  'https://app.eu.contentful.com',
  `${LOCALHOST_PREFIX}*`,
] as const;

export interface CreatePostMessageChannelOptions {
  // Override the default editor-origin allow-list. Accepts one or many.
  // Useful for tests, self-hosted proxies, or unusual embedding setups.
  targetOrigin?: string | string[];
}

export function createPostMessageChannel(
  options: CreatePostMessageChannelOptions = {}
): PreviewChannel | undefined {
  if (typeof window === 'undefined') return undefined;

  const allowedOrigins = normalizeOrigins(options.targetOrigin);
  const resolvedTargetOrigin = resolveTargetOrigin(allowedOrigins);
  if (!resolvedTargetOrigin) return undefined;

  const parentWindow = window.parent;
  if (!parentWindow || parentWindow === window) return undefined;

  const handlers = new Map<MessageType, Set<MessageHandler>>();

  const listener = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isEnvelope(data)) return;
    // We are the preview app; only accept editor-source messages.
    if (data.source !== SOURCE.editor) return;

    const forType = handlers.get(data.type as MessageType);
    if (!forType) return;

    for (const handler of forType) {
      try {
        handler(data as AnyMessage);
      } catch (err) {
        // A misbehaving handler must not tear down the transport.
        console.error('[experiences preview] handler threw:', err);
      }
    }
  };

  window.addEventListener('message', listener);

  return {
    send(msg) {
      parentWindow.postMessage(msg, resolvedTargetOrigin);
    },
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
      return () => {
        set!.delete(handler);
        if (set!.size === 0) handlers.delete(type);
      };
    },
    close() {
      window.removeEventListener('message', listener);
      handlers.clear();
    },
  };
}

function normalizeOrigins(override: string | string[] | undefined): string[] {
  if (override) return Array.isArray(override) ? override : [override];
  return [...DEFAULT_ALLOWED_ORIGINS];
}

function resolveTargetOrigin(allowedOrigins: string[]): string | undefined {
  const ancestorOrigins: readonly string[] | undefined =
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined' &&
    'ancestorOrigins' in window.location
      ? Array.from(window.location.ancestorOrigins)
      : undefined;

  if (ancestorOrigins) {
    for (const origin of ancestorOrigins) {
      if (isAllowed(origin, allowedOrigins)) return origin;
    }
  }

  // Firefox fallback: derive an origin from document.referrer.
  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  if (referrer) {
    try {
      const referrerOrigin = new URL(referrer).origin;
      if (isAllowed(referrerOrigin, allowedOrigins)) return referrerOrigin;
    } catch {
      // fall through
    }
  }

  return undefined;
}

function isAllowed(origin: string, allowedOrigins: string[]): boolean {
  for (const allowed of allowedOrigins) {
    if (allowed === origin) return true;
    if (
      (allowed === `${LOCALHOST_PREFIX}*` || allowed === 'http://localhost') &&
      origin.startsWith(LOCALHOST_PREFIX)
    ) {
      return true;
    }
  }
  return false;
}
