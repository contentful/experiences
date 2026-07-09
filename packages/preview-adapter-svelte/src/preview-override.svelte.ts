/*
 * createPreviewOverride — Svelte 5 rune-based counterpart to the React
 * `usePreviewOverride`. Wires a `PreviewClient` and exposes its snapshot
 * as reactive getters (`view`, `handshakeStatus`, ...).
 *
 * When `enabled` is false, when the app is not embedded in a Contentful
 * editor (no matching ancestor origin), or before the handshake completes,
 * `view` is `undefined` — the renderer falls back to the `experience`
 * prop. Once `init` arrives, `view` takes precedence and subsequent
 * `viewUpdate` messages replace it.
 *
 * The `view` field is the API-generic `HydratedView`. Callers convert
 * to a `PortableRenderPlan` via `createResolvedPreviewPlan` (from
 * `resolved-preview-plan.svelte.ts`) or `resolveExperience` directly.
 */

import type { ExperienceNode } from '@contentful/experiences-core';
import type {
  HydratedView,
  PreviewCapabilities,
  PreviewSnapshot,
  RenderStatus,
} from '@contentful/experiences-preview-core';
import { PreviewClient } from '@contentful/experiences-preview-core';
import {
  createPostMessageChannel,
  type CreatePostMessageChannelOptions,
} from '@contentful/experiences-preview-web';

export interface CreatePreviewOverrideOptions {
  // Master gate. When false, the returned view is always undefined and
  // no listeners are installed.
  enabled: boolean;

  capabilities?: Partial<PreviewCapabilities>;
  supportedFeatures?: string[];
  targetOrigin?: CreatePostMessageChannelOptions['targetOrigin'];
}

export interface PreviewOverride {
  readonly view: HydratedView | undefined;
  readonly handshakeStatus: PreviewSnapshot['handshakeStatus'];
  readonly renderStatus: RenderStatus;
  readonly missingComponents: string[];
  readonly isReactive: boolean;
  readonly sessionId: string | undefined;
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

/**
 * Must be called at the top level of a `.svelte` component (or during
 * component setup) — internally uses `$effect` for lifecycle management.
 *
 * Pass the set of component-type ids the renderer knows about so the
 * hook can report `partial` render status with the missing ids. Pass
 * `null` (or omit) to always report `ok` once render completes.
 */
export function createPreviewOverride(
  options: CreatePreviewOverrideOptions,
  knownComponentTypeIds?: ReadonlySet<string> | null
): PreviewOverride {
  const capabilities: PreviewCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...(options.capabilities ?? {}),
  };
  const supportedFeatures = options.supportedFeatures ?? DEFAULT_SUPPORTED_FEATURES;
  const isReactive = capabilities.liveUpdate;

  let snapshot = $state<PreviewSnapshot>(INERT_SNAPSHOT);
  let client: PreviewClient | null = null;

  $effect(() => {
    if (!options.enabled) return;

    const channel = createPostMessageChannel({ targetOrigin: options.targetOrigin });
    if (!channel) return;

    const c = new PreviewClient({ channel, supportedFeatures, capabilities });
    client = c;

    const unsubscribe = c.subscribe(() => {
      snapshot = c.getSnapshot();
    });
    c.start();

    const onError = (event: ErrorEvent) => {
      c.reportError({ message: event.message, stack: event.error?.stack });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason ?? 'unhandledrejection');
      const stack = reason instanceof Error ? reason.stack : undefined;
      c.reportError({ message, stack });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      unsubscribe();
      c.close();
      client = null;
    };
  });

  // After each init/viewUpdate, walk the incoming view and report render
  // status by extracting component-type ids from URNs and comparing
  // against the known set.
  $effect(() => {
    if (snapshot.handshakeStatus !== 'initialized') return;
    if (!snapshot.view) return;
    if (snapshot.renderStatus !== 'pending') return;

    if (!knownComponentTypeIds) {
      client?.reportRendered({ status: 'ok', missingComponents: [] });
      return;
    }

    const missing = new Set<string>();
    collectMissing(snapshot.view.nodes, knownComponentTypeIds, missing);

    if (missing.size === 0) {
      client?.reportRendered({ status: 'ok', missingComponents: [] });
    } else {
      client?.reportRendered({
        status: 'partial',
        missingComponents: Array.from(missing),
      });
    }
  });

  return {
    get view() {
      return snapshot.view;
    },
    get handshakeStatus() {
      return snapshot.handshakeStatus;
    },
    get renderStatus() {
      return snapshot.renderStatus;
    },
    get missingComponents() {
      return snapshot.missingComponents;
    },
    get isReactive() {
      return isReactive;
    },
    get sessionId() {
      return snapshot.sessionId;
    },
  };
}

// Same URN convention resolveExperience uses: id is the last non-empty
// path segment. Template nodes are skipped (out of v1 renderer scope).
function extractIdFromUrn(urn: string): string {
  const segments = urn.split('/').filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? urn;
}

function collectMissing(
  nodes: ExperienceNode[] | undefined,
  known: ReadonlySet<string>,
  out: Set<string>
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if ('componentType' in node) {
      const id = extractIdFromUrn(node.componentType.sys.urn);
      if (!known.has(id)) out.add(id);
    }
    if (node.slots) {
      for (const children of Object.values(node.slots)) {
        collectMissing(children, known, out);
      }
    }
  }
}
