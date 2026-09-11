# @contentful/experiences-live-preview

Optional live preview for Contentful Experiences.

## API

```ts
type PreviewSessionOptions = {
  spaceId: string;
  environmentId: string;
  previewToken?: string;
  sessionId?: string;
  sessionHost?: string;
  debug?: boolean;
};

type LivePreviewClient = {
  getSnapshot(): ExperiencePayload | undefined;
  subscribe(listener: () => void): () => void;
  subscribeStatus(listener: (status: LivePreviewStatus) => void): () => void;
};

createLivePreviewClient(
  previewSessionOptions: PreviewSessionOptions,
  initialPayload?: ExperiencePayload,
): LivePreviewClient;

sendPreviewStatus(status: LivePreviewStatus): void;
```

## Usage

`createLivePreviewClient` returns a data source for a Preview Session. It opens
the socket when the first listener subscribes and publishes each valid `next`
payload as received. If you pass `initialPayload`, `getSnapshot()` returns it
until a valid update arrives. Without `initialPayload`, the snapshot starts as
`undefined`.

`sessionId` and `previewToken` are optional. The package opens a socket only when
both values are provided. The caller supplies the session ID through
`PreviewSessionOptions`.

`sessionHost` is an optional WebSocket URL for the Preview Session service. It
defaults to the production Contentful Session service. The SDK uses the URL as
supplied, appends the subscription route, and sends `previewToken` as the
encoded `access_token` query parameter.

When you use the package directly in a Contentful preview, connect the client's
status subscription to `sendPreviewStatus`:

```ts
import { createLivePreviewClient, sendPreviewStatus } from '@contentful/experiences-live-preview';

const client = createLivePreviewClient(previewSessionOptions);
const unsubscribeStatus = client.subscribeStatus(sendPreviewStatus);
const unsubscribe = client.subscribe(() => {
  const experience = client.getSnapshot();
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
