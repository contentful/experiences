# @contentful/experiences-live-preview

Optional live preview for Contentful Experiences.

## API

```ts
type LivePreviewOptions = {
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
};

createLivePreviewClient(
  options: LivePreviewOptions,
  initialData?: ExperiencePayload,
): LivePreviewClient;
```

`createLivePreviewClient` returns a data source for a Preview Session. It opens
the socket when the first listener subscribes and publishes each valid `next`
payload as received. Callers can pass the payload to `resolveExperience` or
build a render plan when they need one. If you pass `initialData`,
`getSnapshot()` returns it until a valid update arrives. Omitting
`initialData` starts the snapshot at `undefined`. Each `subscribe` call returns
an unsubscriber. When the last subscriber leaves, the client closes its socket
and cancels pending retries.

`sessionId` and `previewToken` are optional. The package opens a socket when
both values are provided. The caller supplies the session ID through
`LivePreviewOptions`. `getSnapshot()` exposes the latest Preview Session data to
the application.

`sessionHost` is an optional WebSocket URL for the Preview Session service. It
defaults to the production Contentful Session service. The SDK uses the URL as
supplied, appends the subscription route, and sends `previewToken` as the
encoded `access_token` query parameter.

Transform the snapshot before rendering if needed:

```ts
const client = createLivePreviewClient(previewOptions);
const unsubscribe = client.subscribe(() => {
  const experience = client.getSnapshot();
  if (experience) updatePreview(experience);
});
```

A valid `next` message replaces the current data atomically. The client keeps
the last valid data when it receives malformed messages, server errors, or
transport interruptions. Unknown message types are ignored. The `next` payload
may contain an `Experience` or `ExperienceFragment`. Adapters can build on this
source and reuse its socket and message handling. Other frameworks can use the
same framework-neutral client.
