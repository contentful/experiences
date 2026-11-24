# @contentful/experiences-live-preview

Optional live preview for Contentful Experiences.

## Runtime parameters and Session updates

Direct by-ID `fetchExperience` accepts per-call `parameters`; see the
[runtime parameters guide](../../README.md#runtime-experience-parameters).
Preview Sessions retain their existing unprefixed `context.parameters` map
(for example `{ productId: 'foo123' }`), with values supported by the Session
contract. The Contentful editor owns Session context changes. Use
`fetchPreviewSession` for an initial Experience snapshot, such as server rendering.
`createLivePreviewClient` receives the current Experience and later updates.
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

For browser-only preview, use `createLivePreviewClient`.
Use `fetchPreviewSession` when you need an initial server-rendered snapshot. It
returns a `PortableRenderPlan`:

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
subscription is required for this integration. Keep both unsubscribe functions
and call them when the preview no longer uses the client.

A valid `next` message replaces the current data atomically. The client keeps
the last valid data when it receives malformed messages, server errors, or
transport interruptions. Unknown message types are ignored. The `next` payload
contains an `Experience`.

## Inspection geometry

To include source maps in Preview Session updates, set `sourceMap: true` when
creating the client. Source maps are not requested by default:

```ts
const client = createLivePreviewClient({ ...previewSessionOptions, sourceMap: true });
```

After rendering an Experience, pass its matching source map to
`observePreviewGeometry` to send component bounds to the embedding editor:

```ts
import { observePreviewGeometry } from '@contentful/experiences-live-preview';

const stopObserving = observePreviewGeometry({ sourceMap });
```

Supply the map matching the rendered DOM. Call `stopObserving()` before replacing
the DOM or its map, or when removing the preview. Start observation again after
rendering the new content.

Mark one existing root per rendered component with `data-cf-node-id`. Use the
node's runtime ID, matching its key in `sourceMap.nodes`, rather than the
component definition ID. Duplicate marked roots for the same runtime ID cannot
be inspected.

The embedding editor receives `canvasGeometryUpdated` messages containing the
full source map unchanged:

```ts
{
  source: 'customer-app',
  eventType: 'canvasGeometryUpdated',
  payload: {
    size: { width, height },
    nodes: { [runtimeNodeId]: { coordinates: { x, y, width, height } } },
    sourceMap,
  },
}
```

Coordinates and document size use document CSS pixels. A missing or unusable map
produces `nodes: {}` and `sourceMap: null`, clearing the editor's targets.

Continuous animation and scrolling do not refresh bounds. Inspection does not
support independent scroll containers or slot targets. Viewport-based minimum
heights can prevent the document from shrinking.

Calling `stopObserving()` stops updates without sending a final empty snapshot.
