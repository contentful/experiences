# @contentful/experiences-live-preview

Optional live preview for Contentful Experiences.

## Runtime parameters and Session updates

Direct by-ID `fetchExperience` accepts per-call `parameters`; see the
[runtime parameters guide](../../README.md#runtime-experience-parameters).
Preview Sessions retain their existing unprefixed `context.parameters` map
(for example `{ productId: 'foo123' }`), with values supported by the Session
contract. The Contentful editor owns Session context changes. `fetchPreviewSession`
optionally loads a hydrated snapshot for server rendering; `createLivePreviewClient`
receives the current snapshot on connection and subsequent WebSocket updates. Replace the rendered plan from each update as usual.
These APIs do not mutate Session parameters or encode `parameter.*` query keys.

## API

```ts
type PreviewSessionOptions = {
  spaceId: string;
  environmentId: string;
  previewToken?: string;
  sessionId?: string;
  resourceResolution?: string;
  sourceMap?: boolean;
  sessionHost?: string;
  debug?: boolean;
};

type PreviewSessionExperienceOptions = {
  spaceId: string;
  environmentId: string;
  sessionId: string;
  resourceResolution?: string;
};

type PreviewSessionClientOptions = {
  previewToken: string;
  host?: string;
};

type PreviewSessionResolveOptions = {
  config: ResolverConfig;
  metadata?: Record<string, unknown>;
  debug?: boolean;
};

fetchPreviewSession(
  previewSessionOptions: PreviewSessionExperienceOptions,
  clientOptions: PreviewSessionClientOptions,
  resolveOptions: PreviewSessionResolveOptions,
): Promise<PortableRenderPlan>;

PreviewSessionFetchError;
LivePreviewConnectionError;
NotFoundError;
PREVIEW_WEBSOCKET_HOST;

type LivePreviewResult = {
  data: ExperiencePayload | undefined;
  error: Error | undefined;
};

type LivePreviewClient = {
  getResult(): LivePreviewResult;
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: LivePreviewStatus) => void): () => void;
};

createLivePreviewClient(
  previewSessionOptions: PreviewSessionOptions,
  initialPayload?: ExperiencePayload,
): LivePreviewClient;

sendPreviewStatus(status: LivePreviewStatus): void;
```

The WebSocket subscription delivers the current hydrated Experience as its first
`next` message, then sends later updates. Browser-only preview can use
`createLivePreviewClient` or the adapter hook without a separate HTTP fetch.

Optionally use `fetchPreviewSession` to render an initial snapshot on the server.
It resolves the response into a `PortableRenderPlan`; it is not required for
client-side live preview or inspection.

```ts
import { fetchPreviewSession } from '@contentful/experiences-live-preview';

const plan = await fetchPreviewSession(
  { spaceId, environmentId, sessionId },
  { previewToken },
  { config: experienceConfig }
);
```

The request sends `previewToken` as a Bearer token in the `Authorization`
header. `host` selects a compatible Preview Session API host and defaults to
the production host. Pass the same encoded `resourceResolution` value in the
`previewSessionOptions` passed to `fetchPreviewSession` and
`createLivePreviewClient` when the session references resources from other
spaces. A missing session throws `NotFoundError`. Other request and response
failures throw `PreviewSessionFetchError`.

## Usage

`createLivePreviewClient` returns a data source for a Preview Session. It opens
the socket when the first listener subscribes and publishes each valid `next`
payload as received. If you pass `initialPayload`, `getResult().data` returns
it until a valid update arrives. Without `initialPayload`, the data starts as
`undefined`.

`getResult().error` is set when the live-preview connection fails. The last
valid data remains available in `getResult().data`.

`sessionId` and `previewToken` are optional. The package opens a socket only when
both values are provided. The caller supplies the session ID through
`PreviewSessionOptions`.

`sessionHost` is an optional WebSocket URL for the Preview Session service. It
defaults to the production Contentful Session service. The SDK uses the URL as
supplied, appends the subscription route, and sends `previewToken` as the
encoded `access_token` query parameter. When provided, `resourceResolution` is
sent as the encoded `resource_resolution` query parameter.

When you use the package directly in a Contentful preview, connect the client's
status subscription to `sendPreviewStatus`:

```ts
import { createLivePreviewClient, sendPreviewStatus } from '@contentful/experiences-live-preview';

const client = createLivePreviewClient(previewSessionOptions);
const unsubscribeStatus = client.subscribeStatus(sendPreviewStatus);
const unsubscribe = client.subscribe(() => {
  const experience = client.getResult().data;
  if (experience) updatePreview(experience);
});
```

This tells the Contentful app how to coordinate updates with the SDK. The
subscription is required for this integration. Framework adapters set it up for
you. Keep both unsubscribe functions and call them when the preview no longer
uses the client.

A valid `next` message replaces the current data atomically. The client keeps
the last valid data when it receives malformed messages, server errors, or
transport interruptions. Unknown message types are ignored. The `next` payload
contains an `Experience`. Adapters can build on this source and reuse its socket
and message handling. Other frameworks can use the same framework-neutral
client.

## Inspector geometry

React applications enable inspection with `useLivePreview({ ..., inspector: true })`.
See the [component integration instructions](../adapter-react/README.md#inspector-geometry).
Inspection is disabled by default.

For other browser integrations, set `sourceMap: true` in `PreviewSessionOptions`
and call `observePreviewGeometry(plan)` after the accepted plan has rendered.
Call its returned cleanup function before replacing that plan or removing the preview.
Importing the package is safe on the server; geometry observation requires a browser
and a rendered document.

```ts
const stopObserving = observePreviewGeometry(plan);
// Before replacing the rendered plan or removing the preview:
stopObserving();
```

`sourceMap: true` adds `source_map=true` to the WebSocket subscription. The
backend must support this opt-in and return its public map on the first and
subsequent `next` responses. The SDK forwards the map unchanged, including
`sources` and node `path` indexes; the editor interprets those paths. No extra
HTTP fetch is required. An optional server-rendered plan can display before
source maps arrive over the socket.

The observer posts complete snapshots to `window.parent` with target origin
`"*"`, matching preview-status messaging. Enable inspection only in a preview
page whose embedding parent should receive its geometry and full source map.
The message shape is:

```ts
{
  source: 'customer-app',
  eventType: 'canvasGeometryUpdated',
  payload: {
    size: { width, height },
    nodes: { [nodeId]: { coordinates: { x, y, width, height } } },
    sourceMap,
  },
}
```

Coordinates and size use document CSS pixels. Each runtime node ID must mark
one existing component root with `data-cf-node-id`. Duplicate IDs and unmarked
nodes have no geometry entry. A missing or unusable map produces `sourceMap: null`
and an empty node table so the editor can clear its targets.

Measurements are coalesced to animation frames after layout changes, including
DOM mutations, resize, media load, and font readiness. Cleanup disconnects the
observers and cancels pending measurements. The editor owns preview sizing and
scrolling. This initial integration covers ordinary document flow at scale one;
viewport-relative minimum heights, fixed or sticky positioning, independently
scrolling containers, multiple roots
per runtime ID, and slot targets are not supported inspection contracts.
