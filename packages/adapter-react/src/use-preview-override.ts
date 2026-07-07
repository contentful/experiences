'use client';

/*
 * usePreviewOverride — React hook that wires a `PreviewClient` to the
 * renderer. Used internally by `ClientExperienceRenderer` when the
 * `enablePreview` prop is set; also exported for advanced customers
 * who want to compose their own renderer flow.
 *
 * When `enabled` is false, when the app is not embedded in a Contentful
 * editor (no matching ancestor origin), or before the handshake completes,
 * the hook returns `undefined` — the renderer falls back to the `experience`
 * prop. Once `init` arrives, the returned view takes precedence and
 * subsequent `viewUpdate` messages replace it.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';

import type {
  PortableRenderNode,
  PortableRenderPlan,
  PreviewCapabilities,
  PreviewSnapshot,
  RenderStatus,
} from '@contentful/experiences-core';
import {
  PreviewClient,
  createPostMessageChannel,
  type CreatePostMessageChannelOptions,
} from '@contentful/experiences-core';

export interface UsePreviewOverrideOptions {
  // Master gate. When false, the hook returns an inert snapshot and
  // installs nothing — same cost as not calling it.
  enabled: boolean;

  // Optional partial capabilities. Defaults to a fully-reactive preview
  // that accepts `viewUpdate` and does not report geometry.
  capabilities?: Partial<PreviewCapabilities>;

  // Optional feature list to negotiate against the editor.
  supportedFeatures?: string[];

  // Origin override — pass when the editor is not on a default allow-listed
  // origin (self-hosted proxies, staging setups, tests).
  targetOrigin?: CreatePostMessageChannelOptions['targetOrigin'];
}

export interface UsePreviewOverrideResult {
  // The view to render, or `undefined` when preview is off / not yet
  // received. Callers fall back to their own `experience` prop.
  view: PortableRenderPlan | undefined;

  handshakeStatus: PreviewSnapshot['handshakeStatus'];
  renderStatus: RenderStatus;
  missingComponents: string[];
  isReactive: boolean;
  sessionId: string | undefined;
}

const DEFAULT_CAPABILITIES: PreviewCapabilities = {
  liveUpdate: true,
  alreadyRendered: false,
  nodeGeometry: false,
};

const DEFAULT_SUPPORTED_FEATURES = ['viewUpdate'];

const INERT_SNAPSHOT: PreviewSnapshot = {
  handshakeStatus: 'idle',
  renderStatus: 'pending',
  sessionId: undefined,
  view: undefined,
  context: undefined,
  missingComponents: [],
  error: undefined,
};

export function usePreviewOverride(
  options: UsePreviewOverrideOptions,
  // Optional set of component-type ids the caller knows how to render.
  // When provided, the hook reports `partial` with the missing ids so the
  // editor can surface them; when omitted, the hook reports `ok`.
  knownComponentTypeIds?: ReadonlySet<string> | null
): UsePreviewOverrideResult {
  const { enabled } = options;

  // Keep option inputs in refs so callers passing inline objects don't
  // tear the client down on every render.
  const capabilitiesRef = useRef<PreviewCapabilities>({
    ...DEFAULT_CAPABILITIES,
    ...(options.capabilities ?? {}),
  });
  const supportedFeaturesRef = useRef<string[]>(
    options.supportedFeatures ?? DEFAULT_SUPPORTED_FEATURES
  );
  const targetOriginRef = useRef(options.targetOrigin);
  targetOriginRef.current = options.targetOrigin;

  const clientRef = useRef<PreviewClient | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const channel = createPostMessageChannel({
      targetOrigin: targetOriginRef.current,
    });
    if (!channel) {
      // Not embedded in a recognised editor. Renderer falls back to prop.
      return;
    }

    const client = new PreviewClient({
      channel,
      supportedFeatures: supportedFeaturesRef.current,
      capabilities: capabilitiesRef.current,
    });
    clientRef.current = client;
    client.start();

    const onError = (event: ErrorEvent) => {
      client.reportError({ message: event.message, stack: event.error?.stack });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason ?? 'unhandledrejection');
      const stack = reason instanceof Error ? reason.stack : undefined;
      client.reportError({ message, stack });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      client.close();
      clientRef.current = null;
    };
  }, [enabled]);

  const snapshot = useSyncExternalStore<PreviewSnapshot>(
    (listener) => {
      if (!clientRef.current) return () => {};
      return clientRef.current.subscribe(listener);
    },
    () => clientRef.current?.getSnapshot() ?? INERT_SNAPSHOT,
    () => INERT_SNAPSHOT
  );

  // After each init/viewUpdate, walk the view and report render status
  // by comparing component-type ids against the known set.
  useEffect(() => {
    if (snapshot.handshakeStatus !== 'initialized') return;
    if (!snapshot.view) return;
    if (snapshot.renderStatus !== 'pending') return;

    if (!knownComponentTypeIds) {
      clientRef.current?.reportRendered({ status: 'ok', missingComponents: [] });
      return;
    }

    const missing = new Set<string>();
    collectMissing(snapshot.view.nodes, knownComponentTypeIds, missing);

    if (missing.size === 0) {
      clientRef.current?.reportRendered({ status: 'ok', missingComponents: [] });
    } else {
      clientRef.current?.reportRendered({
        status: 'partial',
        missingComponents: Array.from(missing),
      });
    }
  }, [
    snapshot.handshakeStatus,
    snapshot.view,
    snapshot.renderStatus,
    knownComponentTypeIds,
  ]);

  return {
    view: snapshot.view,
    handshakeStatus: snapshot.handshakeStatus,
    renderStatus: snapshot.renderStatus,
    missingComponents: snapshot.missingComponents,
    isReactive: capabilitiesRef.current.liveUpdate,
    sessionId: snapshot.sessionId,
  };
}

function collectMissing(
  nodes: PortableRenderNode[] | undefined,
  known: ReadonlySet<string>,
  out: Set<string>
): void {
  if (!nodes) return;
  for (const node of nodes) {
    const id = node.registration.componentTypeId;
    if (!known.has(id)) out.add(id);
    if (node.slots) {
      for (const children of Object.values(node.slots)) {
        collectMissing(children, known, out);
      }
    }
  }
}
