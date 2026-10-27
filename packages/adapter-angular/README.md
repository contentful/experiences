# @contentful/experiences-angular

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The Angular adapter for the Contentful Experiences SDK. You bring your own standalone Angular components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-angular
```

Supports Angular **20, 21, and 22**. The package ships partial-Ivy output compiled by the lowest supported compiler, so the Angular linker in your app can consume it on any of the three.

This is the **only SDK package you install**. It re-exports everything you need from `@contentful/experiences-sdk-core` and `@contentful/experiences-design`. The other packages are workspace-internal.

The public API mirrors `@contentful/experiences-react` and `@contentful/experiences-svelte` in shape; only the rendering primitives change (standalone `Type<unknown>` components, `PortableRenderNode[]` slot inputs instead of `children: ReactNode`, and `injectDesignValues()` instead of `useDesignValues()`). See [Parity table](#parity-table) for the full mapping.

---

## Public API

### Authoring

```ts
defineComponent<Props>(config); // Type-narrowing identity for component-type configs
defineExperienceTemplate<Props>(config); // Same shape, for coded Experience Template configs
```

### Fetching

```ts
fetchExperience(experienceOptions, clientOptions, resolveOptions); // Async; fetches from XDA and resolves in one call
fetchPreviewSession(previewSessionOptions, clientOptions, resolveOptions); // Async; fetches and resolves a Preview Session Experience
```

Use `fetchPreviewSession` for the initial render when the Contentful app
provides a `preview_session_id`. It fetches the current Preview Session
snapshot and resolves it into a `PortableRenderPlan`. Use `injectLivePreview`
to receive subsequent WebSocket updates:

```ts
const plan = await fetchPreviewSession(
  { spaceId, environmentId, sessionId },
  { previewToken },
  { config: experienceConfig }
);
```

If the Preview Session references resources from other spaces, pass the same
encoded `resourceResolution` value in the `previewSessionOptions` passed to
`fetchPreviewSession` and `injectLivePreview`.

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Live preview

Use `injectLivePreview()` when the app should subscribe to Preview Session
updates, resolve each payload, and render the resulting plan from `data`:

```ts
readonly livePreview = injectLivePreview(() => ({
  previewSessionOptions,
  initialPayload,
  initialPlan,
  resolveOptions: { config: experienceConfig },
}));
```

For separate access to the raw payload and rendered plan, use
`injectLivePreviewExperience()` and `injectExperiencePlan()`. The first returns
the raw Experience payload. The second passes that payload to
`resolveExperience()` and returns the `PortableRenderPlan` consumed by the
renderer. Keeping the values separate lets an app use the raw payload when it
needs it.

Both helpers take a getter. Angular can call an injection helper before it has
assigned component inputs, so the getter reads the current values when Angular
runs the helper. Each helper returns an object with a `data` signal, matching
the other framework adapters.

```ts
// page.component.ts
import { Component } from '@angular/core';
import {
  ClientExperienceRenderer,
  injectLivePreviewExperience,
  injectExperiencePlan,
  type PortableRenderPlan,
} from '@contentful/experiences-angular';
import { experienceConfig } from './experience-config';

@Component({
  selector: 'app-page',
  imports: [ClientExperienceRenderer],
  template: `<cf-experience [experience]="plan.data()" [config]="experienceConfig" />`,
})
export class PageComponent {
  readonly livePreviewOptions = {
    previewSessionOptions: {
      spaceId: 'space-id',
      environmentId: 'environment-id',
      previewToken: 'preview-token',
      sessionId: 'session-id',
    },
  };
  readonly initialPlan: PortableRenderPlan | undefined = undefined;

  readonly livePreview = injectLivePreviewExperience(() => this.livePreviewOptions);
  readonly plan = injectExperiencePlan(() => ({
    payload: this.livePreview.data(),
    initialPlan: this.initialPlan,
    resolveOptions: { config: experienceConfig },
  }));

  protected readonly experienceConfig = experienceConfig;
}
```

`injectLivePreviewExperience()` starts its subscription after the first browser render.
Set both `previewToken` and `sessionId` to receive Preview Session updates. The
initial payload remains available while updates arrive. The browser SDK sends
the token as the WebSocket URL's `access_token` parameter.

`injectExperiencePlan()` calls `resolveExperience()` for each new raw
payload. It updates `plan.data()` after the resolver returns a complete
plan. The current plan stays in place until the new plan is ready.

The live-preview results also expose an `error` signal when the Preview Session
connection fails. The last valid `data` remains available.

### Renderers

Every renderer is standalone; add it to your own component's `imports`.

```ts
ServerExperienceRenderer; // <cf-server-experience>  SSR-safe renderer
ClientExperienceRenderer; // <cf-experience>         Client renderer
MissingComponent; // <cf-missing-component>  Default fallback for unregistered component types
NodesRenderer; // *cfNodes                Renders a slot's raw nodes (see Slot children)
NodeRenderer; // *cfNode                 Renders one node; NodesRenderer loops over it
DebugExperience; // <cf-debug-experience>   Auto-mounted by the renderers when debug is set
injectLivePreviewExperience; // Signal-backed raw Experience payload
injectExperiencePlan; // Signal-backed PortableRenderPlan
```

`NodesRenderer` and `NodeRenderer` are **structural directives**, not components, so they add no element of their own — see [Register components: Render slots](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/register-components#render-slots).

Each is also exported under its Angular-suffixed class name (`ServerExperienceRendererComponent`, `NodesRendererDirective`, and so on), and `ExperienceRenderer` is an alias for `ClientExperienceRenderer`.

### Styling + runtime context (helpers)

All four are `inject()`-based: call them from a field initializer or a constructor, like any other Angular injection API.

```ts
injectDesignValues<T>(); // Signal of the resolved design record that auto-fills inputs
toCss(design, options?); // Turns a design record into a plain style object for [ngStyle]
injectExperience(); // Signal<RenderContext>: debug, metadata
injectContentfulComponent(); // Signal of the raw payload for the enclosing node (or undefined), including `attribution`
injectContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
getTrackingAttributes(attribution); // Attributes to bind on a node's outermost element for interaction tracking
type ToCssOptions;
```

Resolved design values are **auto-filled onto your component's inputs** by key, alongside content. Declaring an `@Input()` per design key you style with is the one recommended path — and in Angular it is also what makes the key arrive, since binding an undeclared input is an error. `injectDesignValues()` returns the same record as a `Signal`, as an escape hatch and as the way to read keys your component didn't declare, which are **dropped** rather than passed (see [Parity table](#parity-table)). Reach for it only for a nested child that isn't itself a registered component, or for design needed outside the render path (an effect, an imperative measurement) — see [Styling components](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/style-components). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

### Re-exported types and utilities

```ts
// From core
type Config, Components, ExperienceTemplates, Registration, ExperienceTemplateRegistration,
type ComponentConfig, ExperienceTemplateConfig,
type ContentfulComponent, ContentfulExperienceTemplate,
type RenderContext, RenderUnknown, ResolveToken, SlotNodes,
type ExperiencePayload, ExperienceNode, ComponentNode, ExperienceTemplateNode,
type ComponentRef, ExperienceTemplateRef, ExperienceSys,
type PortableRenderPlan, PortableRenderNode, PortableRegistration,
type DesignPropValue, ManualDesignValue, DesignToken, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From live preview and the Angular adapter
type PreviewSessionOptions, LivePreviewClient,
type InjectLivePreviewExperienceOptions, InjectLivePreviewExperienceResult,
type ExperiencePlanResolveOptions, InjectExperiencePlanOptions,
type InjectExperiencePlanResult

// From design
isCssProperty, toCssKey, CSS_PROPERTIES

// From client
createClient, fetchExperience, fetchPreviewSession, ContentfulViewDelivery,
ContentfulViewDeliveryClient, NotFoundError, PreviewSessionFetchError,
LivePreviewConnectionError,
DELIVERY_HOST, PREVIEW_HOST, PREVIEW_WEBSOCKET_HOST

type ExperienceOptions, PreviewSessionExperienceOptions, PreviewSessionClientOptions,
  PreviewSessionResolveOptions, ClientOptions, ResolveOptions, CreateClientOptions
```

---

## Documentation

The Experiences SDK documentation covers the Angular adapter alongside the other adapters:

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

## Parity table

Everything below is a deliberate divergence from React and Svelte, forced by an Angular primitive. Semantics — merge precedence, degradation behaviour, and context walk-up — are identical across all three adapters and covered by the same ported test suite.

| Concern                                          | React                                                                                        | Svelte                                                       | Angular                                                                          | Why                                                                                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime accessors                                | `useExperience()`, `useDesignValues()`                                                       | `getExperience()`, `getDesignValues()`                       | `injectExperience()`, `injectDesignValues()`                                     | Angular's DI idiom. Must be called from an injection context.                                                                                                                                                                                      |
| Accessor return type                             | plain value (re-renders)                                                                     | plain value (read in `$derived`)                             | `Signal<T>` — call it to read                                                    | Signals are Angular's reactive primitive.                                                                                                                                                                                                          |
| Renderer usage                                   | `<ServerExperienceRenderer …/>`                                                              | `<ServerExperienceRenderer …/>`                              | `<cf-server-experience …/>` after adding `ServerExperienceRenderer` to `imports` | Angular components are referenced by selector, imported by class.                                                                                                                                                                                  |
| Slot children                                    | `children: ReactNode[]` — render directly                                                    | `Snippet[]` — `{@render child()}`                            | `PortableRenderNode[]` — render with `*cfNodes`                                  | Angular has no lazy named-slot primitive; `projectableNodes` is positional and eager.                                                                                                                                                              |
| `NodesRenderer`                                  | not exported                                                                                 | exported (escape hatch)                                      | exported and **load-bearing**                                                    | It is the only way to render a slot.                                                                                                                                                                                                               |
| Undeclared merged keys                           | passed through as props                                                                      | passed through as props                                      | **dropped**                                                                      | Binding an input a component does not declare is an error, so the merged record is filtered via `reflectComponentType`. Still readable through `injectDesignValues()`.                                                                             |
| Reading dropped keys                             | n/a                                                                                          | n/a                                                          | `injectDesignValues()`                                                           | The full resolved design record is always available regardless of declared inputs.                                                                                                                                                                 |
| Component inputs                                 | props                                                                                        | `$props()`                                                   | `@Input()` setter → `signal`                                                     | Signal `input()` is AOT-only; a JIT consumer reports zero declared inputs, which would break `reflectComponentType` filtering.                                                                                                                     |
| Input naming                                     | any                                                                                          | any                                                          | setter takes the payload key; the readable signal needs a distinct name          | A class cannot declare a field and an accessor under one name, and under `useDefineForClassFields: false` the field initializer would assign straight through the setter.                                                                          |
| Missing-component warning                        | effect                                                                                       | effect                                                       | `ngOnInit`                                                                       | So the diagnostic also fires during server rendering.                                                                                                                                                                                              |
| Prop-shape types                                 | inferred                                                                                     | separate `*.ts` per component                                | not needed                                                                       | Angular components are `.ts`, so `tsc --noEmit` already resolves them.                                                                                                                                                                             |
| Style helper output                              | `CSSProperties`                                                                              | plain record                                                 | plain record for `[ngStyle]`                                                     | Scalar-only, same as Svelte.                                                                                                                                                                                                                       |
| `component-render-error` under SSR               | caught (internal `<Suspense>` degrades gracefully under both legacy and streaming renderers) | **not caught** — `<svelte:boundary>` doesn't run server-side | caught, identically to CSR                                                       | Angular has no separate server renderer — `createComponent` is the same call either way. See the root README's [error-handling section](https://www.contentful.com/developers/docs/experience-orchestration/experiences-sdk/errors-and-debugging). |
| `component-render-error` after a later re-render | caught (standard class boundary)                                                             | caught (standard `<svelte:boundary>`)                        | **not caught** — creation-time only                                              | `ApplicationRef` resolves `ErrorHandler` once from the root injector, so a per-node override can't catch a later change-detection throw. Documented gap; see the root README.                                                                      |

**Not** a divergence: the DOM around slot children. React renders them through a fragment, Svelte through no element, and Angular through structural directives — no adapter element in any of the three. Dispatch deliberately does not use components, because an Angular component always has a host element and no configuration removes it; `display: contents` would hide such a wrapper from layout but not from `> .card`, `:nth-child(n)`, or the sibling combinators.

For the full getting-started walkthrough, merge-precedence rules, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
