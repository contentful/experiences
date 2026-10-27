# @contentful/experiences-react

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The React adapter for the Contentful Experiences SDK. You bring your own React components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-react
```

This is the only rendering SDK package you install. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The optional `@contentful/experiences-live-preview` package is also customer-facing and provides the framework-neutral live-preview client.

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for coded Experience Template configs
```

### Fetching

```ts
fetchExperience(experienceOptions, clientOptions, resolveOptions)  // Async; fetches from XDA and resolves in one call
fetchPreviewSession(previewSessionOptions, clientOptions, resolveOptions) // Async; fetches and resolves a Preview Session Experience
createClient(options)                       // Functional constructor matching the SDK's option shape
ContentfulViewDeliveryClient                // Re-exported delivery client for advanced use cases
NotFoundError                               // Thrown when the Experience ID doesn't exist
PreviewSessionFetchError                   // Thrown when fetching a Preview Session fails
LivePreviewConnectionError                 // Reported when the live-preview connection fails
ContentfulViewDelivery                      // Full error namespace from the delivery client
type ExperienceOptions, PreviewSessionExperienceOptions, PreviewSessionClientOptions,
  PreviewSessionResolveOptions, ClientOptions, ResolveOptions, CreateClientOptions
```

Use `fetchPreviewSession` for the initial render when the Contentful app
provides a `preview_session_id`. It fetches the current Preview Session
snapshot and resolves it into a `PortableRenderPlan`. Use `useLivePreview` to
receive subsequent WebSocket updates:

```tsx
const plan = await fetchPreviewSession(
  { spaceId, environmentId, sessionId },
  { previewToken },
  { config: experienceConfig }
);
```

If the Preview Session references resources from other spaces, pass the same
encoded `resourceResolution` value in the `previewSessionOptions` passed to
`fetchPreviewSession` and `useLivePreview`.

### Resolver

```ts
resolveExperience(payload, config, opts?)   // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Live preview

Use `useLivePreview` when the app should subscribe to Preview Session updates,
resolve each payload, and render the resulting plan from `data`:

```tsx
const livePreview = useLivePreview({
  previewSessionOptions,
  initialPayload,
  initialPlan,
  resolveOptions: { config: experienceConfig },
});

<ClientExperienceRenderer experience={livePreview.data} config={experienceConfig} />;
```

For separate access to the raw payload and rendered plan, use
`useLivePreviewExperience` and `useExperiencePlan`:

```tsx
const livePreview = useLivePreviewExperience({
  previewSessionOptions: {
    spaceId,
    environmentId,
    previewToken,
    sessionId,
  },
  initialPayload,
});

const plan = useExperiencePlan({
  payload: livePreview.data,
  initialPlan,
  resolveOptions: { config: experienceConfig },
});

<ClientExperienceRenderer experience={plan.data} config={experienceConfig} />;
```

`useLivePreviewExperience` returns the latest raw Experience payload.
`initialPayload` seeds the first value. `useExperiencePlan` turns that payload
into the `PortableRenderPlan` consumed by the renderer and keeps the current rendered
experience while an update is being resolved.

The live-preview results also expose `error` when the Preview Session connection
fails. The last valid `data` remains available.

### Renderers

```ts
ServerExperienceRenderer; // RSC-friendly renderer
ClientExperienceRenderer; // Client renderer, alias: ExperienceRenderer
MissingComponent; // Default fallback for unregistered component types
```

### Custom renderer (`@contentful/experiences-react/custom-renderer`)

For hosts that render a plan themselves instead of using `ServerExperienceRenderer`. `resolveNodeProps` returns each node's component and merged props, `ExperienceNode` renders it the way the SDK renderers do, and `createExperienceNode` renders a node's serializable `snapshot` where components can't be passed as props. `ServerExperienceRenderer` and `ClientExperienceRenderer` render every node through the same `resolveNodeProps` + `ExperienceNode`.

```ts
resolveNodeProps(node, config); // ResolvedNode: 'resolved' (component, props, design, contentful, snapshot) | 'unregistered'
ExperienceNode; // Renders one resolved node or snapshot exactly as the SDK renderers do
createExperienceNode(components, experienceTemplates?); // ExperienceNode with its registry bound, for snapshots
type ResolvedNode, NodeSnapshot, ExperienceNodeProps;
```

### Styling + runtime context (hooks)

```ts
useDesignValues<T>(); // Escape hatch: the same resolved design record that auto-fills props
toCss(design, options?); // Turns a design record into CSSProperties, keeping only real CSS keys
useExperience(); // RenderContext: debug, metadata
useContentfulComponent(); // Raw payload for the enclosing node (or null), including `attribution`
useContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
getTrackingAttributes(attribution); // Props to spread on a node's outermost element for interaction tracking
type ToCssOptions;
```

Resolved design values are **auto-filled onto your component's props** by key, alongside content. Styling from those props is the one recommended path. `useDesignValues()` exposes the same record as an escape hatch. Reach for it only for a nested child that isn't itself a registered component, or for design needed outside the render path (an effect, an imperative measurement) — see [Styling components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/style-components). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Re-exported types and utilities

```ts
// From core
type Config, Components, ExperienceTemplates, Registration, ExperienceTemplateRegistration,
type ComponentConfig, ExperienceTemplateConfig,
type ContentfulComponent, ContentfulExperienceTemplate,
type RenderContext, ResolveToken,
type ExperiencePayload, ExperienceNode, ComponentNode, ExperienceTemplateNode,
type PortableRenderPlan, PortableRenderNode, PortableRegistration,
type DesignPropValue, ManualDesignValue, DesignToken, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design
isCssProperty, toCssKey, CSS_PROPERTIES
```

---

## Documentation

The Experiences SDK documentation covers the React adapter alongside the other adapters:

| Topic                                                                             | Page                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Install, register, fetch, and render, step by step                                | [Get started](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/get-started)                   |
| Registry keys, `defineComponent`, slots, experience templates, merge order        | [Register components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/register-components)   |
| `fetchExperience` options, preview, runtime parameters, source maps, destinations | [Fetch experiences](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/fetch-experiences)       |
| Server and client renderers, renderer props, render context                       | [Render experiences](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/render-experiences)     |
| Styling from design props, design tokens, the design-values escape hatch          | [Style components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/style-components)         |
| Debug mode, diagnostics, fallbacks, server/client differences                     | [Errors and debugging](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/errors-and-debugging) |
| Live preview                                                                      | [Set up live preview](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/live-preview)          |

The export list above is the reference for this package's API surface.

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
