# @contentful/experiences-react

> ⚠️ **Alpha.** Published to npm. APIs are unstable and will change.

The React adapter for the Contentful Experiences SDK. You bring your own React components; it renders Experience payloads from the Experience Delivery API (XDA) with them.

```sh
npm install @contentful/experiences-react
```

This is the only rendering SDK package you install. It re-exports everything you need from `@contentful/experiences-sdk-core`, `@contentful/experiences-design`, and `@contentful/experiences-client`. The optional `@contentful/experiences-live-preview` package is also customer-facing and provides the framework-neutral live-preview client.

## Import entries

| Import                                          | Available APIs                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@contentful/experiences-react` or `/server`    | `ServerExperienceRenderer`, registry/type helpers, free fetching/resolution, design and attribution utilities, `EventBuilder`                                                         |
| `@contentful/experiences-react/client`          | Bound factory, managed root, injected provider, runtime/state/action hooks, supplied-plan renderer, render-context/design hooks, `useExperiencePlan`, shared registry/types/utilities |
| `@contentful/experiences-react/host`            | Explicit shared SDK binding creation/disposal for application-owned lifetime and independent roots                                                                                    |
| `@contentful/experiences-react/custom-renderer` | Existing node rendering and prop-resolution building blocks                                                                                                                           |
| `@contentful/experiences-react/web-sdk`         | Public Web SDK constructor, state, events, tracking and runtime preview types                                                                                                         |

Client APIs previously imported from the root move to `/client`. The root and
`/server` do not load the live Web SDK. The unbundled ESM build preserves each
module's client directive. Next.js is not a React dependency or peer.

The standalone `useLivePreview` and `useLivePreviewExperience` hooks and their
option/result types are no longer exported. Preview Session functions, errors,
client/session types and `PREVIEW_WEBSOCKET_HOST` move to direct imports from
`@contentful/experiences-live-preview`. Install that optional package only when
using it; ordinary adapter imports and declarations do not require it. Its
existing standalone APIs are unchanged. General supplied-plan rendering and
`useExperiencePlan` remain available on `/client`.

Managed runtime ownership and state/action hooks are available on `/client`.
Managed Experience loading, resolved preview-update presentation and route-page
coordination follow in the next integration phase. Supplied-plan rendering and
application-owned fetching remain supported.

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
createClient(options)                       // Functional constructor matching the SDK's option shape
ContentfulViewDeliveryClient                // Re-exported delivery client for advanced use cases
NotFoundError                               // Thrown when the Experience ID doesn't exist
ContentfulViewDelivery                      // Full error namespace from the delivery client
type ExperienceOptions, ClientOptions, ResolveOptions, CreateClientOptions
```

For direct standalone snapshot loading, import `fetchPreviewSession` from the
optional package. It fetches the current Preview Session snapshot and resolves
it into a `PortableRenderPlan`:

```tsx
import { fetchPreviewSession } from '@contentful/experiences-live-preview';

const plan = await fetchPreviewSession(
  { spaceId, environmentId, sessionId },
  { previewToken },
  { config: experienceConfig }
);
```

If the Preview Session references resources from other spaces, pass the same
encoded `resourceResolution` value in the options passed to standalone snapshot
and subscription APIs. Runtime preview applies the supported configuration mapping
described in the [Runtime limits](../runtime/README.md#optional-runtime-live-preview).

### Resolver

```ts
resolveExperience(payload, config, opts?)   // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Runtime ownership, state and actions

Bind the registry once, then mount a managed root around supplied-plan rendering:

```tsx
import {
  createReactExperiences,
  useConsentState,
  useExperiencesActions,
  type PortableRenderPlan,
} from '@contentful/experiences-react/client';

const { ExperiencesRoot, ExperiencesProvider, ExperienceRenderer } = createReactExperiences({
  config: experienceConfig,
});

function ConsentControls() {
  const consent = useConsentState();
  const { setConsent } = useExperiencesActions();
  return (
    <button onClick={() => setConsent(true)} disabled={consent === true}>
      Grant consent
    </button>
  );
}

function App({ plan }: { plan: PortableRenderPlan }) {
  return (
    <ExperiencesRoot {...browserConfig}>
      <ConsentControls />
      <ExperienceRenderer experience={plan} />
    </ExperiencesRoot>
  );
}
```

The factory is pure and safe at module scope. The managed root constructs Web
after browser commit and destroys it during cleanup, including Strict Mode
effect replay. Conflicting owners surface the Web singleton error through context.
Structural configuration is captured for the mounted owner; use a deliberate
React `key` replacement to change credentials, endpoints, preview policy or the
initializer. Locale props use `setLocale`; consent and other mutable commands use
actions. Within fixed preview mode, explicit `sdk.replaceLivePreview()` remains
available on an application-owned concrete Web instance.

`useExperiences()` returns the current `WebExperiencesRuntime` for SDK actions and
tracking. It is distinct from singular `useExperience()`, the render context.
`useExperiencesContext()` returns `{ sdk, error, isLive, isContentReady }`. Managed
SSR and initial hydration use a cached inert snapshot; setup failure retains that
snapshot and supplied content with `error`. `isLive` means a concrete SDK is bound.
`isContentReady` means activation/state hydration has settled, including failure;
it does not assert content, visitor identity or preview connection success.
Supplied-plan rendering preserves content while either flag is false.
Locale prop failures remain visible when hydration settles. Correcting or removing
the locale prop clears its failure while preserving any activation/hydration error.

Provide `snapshot` for stable server/browser state. Optional
`initialization={{ handoff, routeKey }}` applies state through Web's
`hydrateHandoffState` after activation. It emits no page or prepared replay.
Handoff cache safety and receiving scope are asserted before SSR children render;
unsafe public/static handoffs and mismatched space/environment IDs throw before
their profile state can reach presentation. Scope follows the captured managed
configuration or the actual injected SDK.
Hydration rejection retains the live binding and exposes its error. Snapshot and
handoff state never become startup `defaults`, which have separate persistence
and consent semantics. `onStatesReady(states)` runs after commit, before this
hydration and passive child effects, and may return subscription cleanup.
Its callback is captured for the binding; use a replacement owner/provider when
changing application subscription setup.

Inject an application-owned SDK through `<ExperiencesProvider sdk={sdk}>`.
Without snapshot/initialization it is immediately available; replacement rebinds
subscriptions and manual refs. The provider never destroys an injected SDK.
Independent React roots can share one explicit `/host` binding and each use an
injected provider. Activate the host outside React render with
`createExperiencesRootSdkBinding({ config, onStatesReady })`, then unmount its
React roots before `disposeExperiencesRootSdkBinding(binding)` during deliberate
host replacement or teardown within a live document.
`{ sdk }` creates a borrowed binding whose disposal leaves SDK destruction to the
application. During document exit, keep the owner and attributed roots alive for
Web's interaction completion and final hide flush; browser teardown releases that
document. Persisted BFCache `pagehide` retains ownership for resumption.

The state hooks are `useProfileState`, `useLocaleState`, `useConsentState`,
`usePersistenceConsentState`, `useExperienceRequestState`, `useEventStreamState`,
`useBlockedEventStreamState`, and `usePreviewState`. They preserve SDK value types,
including `undefined` and `false`, and cache observable emissions for React.
Event state reads the last attempt; it is not a new attempt notification. For an
attempt log, subscribe early with `onStatesReady` and omit the subscription's
immediate historical value when counting new attempts.

`useExperiencesActions()` exposes receiver-safe `setConsent`, `flushEvents`,
`identifyUser`, `trackPageView`, `resetUser`, `trackEvent`, `setLocale`, `trackView`,
`trackClick`, `trackHover`, and `trackFlagView`. These preserve the underlying
arguments, results, errors and runtime policy. Direct identify/page actions do not
refresh content or coordinate navigation. Destruction remains an owner operation.

Pass the optional `livePreview` initializer directly to the managed root's Web
configuration. It is invoked by SDK setup after commit, and `usePreviewState`
observes the shared source. Pending initialization, source errors, static preview
and session replacement do not change root readiness. Preview errors remain in
`states.preview.error`; undefined means disabled or initializing. No initial
fetch or per-view resolved update binding is introduced by a provider.

### Live preview

Use runtime-owned preview through the public Web SDK. A conditional initializer
binds one Experience ID to a session, while ordinary requests for other IDs keep
their Delivery source. The application owns the SDK lifetime when using it
directly, constructs it after browser commit, and disposes its subscriptions
before destruction:

```ts
import { ContentfulExperiences } from '@contentful/experiences-react/web-sdk';

const sdk = new ContentfulExperiences({
  ...browserConfig,
  livePreview:
    previewEnabled && sessionId
      ? async () => ({
          experienceId,
          sessionId,
          implementation: await import('@contentful/experiences-live-preview'),
        })
      : undefined,
});

const plan = await sdk.fetchExperience({ experienceId }, { config: experienceConfig });
presentPlan(plan);
const subscription = sdk.subscribeToPreview(
  experienceId,
  { config: experienceConfig },
  ({ data, error }) => {
    if (data) presentPlan(data);
    showError(error);
  }
);
// On explicit replacement/teardown within a live document:
// subscription.unsubscribe(); sdk.destroy();
```

Render supplied initial plans before subscribing, without another startup
snapshot fetch. The update binding does not fetch snapshots or own presentation
state. `states.preview` carries status, payload, revision and errors; updates can
contain both a usable plan and an error. Runtime policy suppresses preview
visitor events. Preview setup, credential/endpoint mapping and transport limits
are documented in [Web](../web/README.md#shared-source-and-optional-live-preview) and
[Runtime](../runtime/README.md#optional-runtime-live-preview).

For application-supplied payloads, `useExperiencePlan` remains a general helper:

```tsx
import { ClientExperienceRenderer, useExperiencePlan } from '@contentful/experiences-react/client';

const plan = useExperiencePlan({
  payload,
  initialPlan,
  resolveOptions: { config: experienceConfig },
});

<ClientExperienceRenderer experience={plan.data} config={experienceConfig} />;
```

It keeps the current rendered plan while resolving an update. It does not create
a runtime or a preview connection.

### Renderers

```ts
ServerExperienceRenderer; // /server (also root): RSC-friendly renderer
ClientExperienceRenderer; // /client: client renderer, alias: ExperienceRenderer
MissingComponent; // Default fallback for unregistered component types
```

### Attributed rendering and DOM roots

Both renderers now add one Experience boundary, a `div` with `display: contents`
by default, and inject Core scope attributes into registered component/template
props. Components must forward those attributes to their actual outermost HTML
element. Existing registration lookup, prop precedence, named slots, context,
unknown/error fallbacks and the `experience` prop retain their behavior. Rendering
supplied plans performs no fetch and works identically for preview-derived plans.

```tsx
import type { HTMLAttributes } from 'react';

function Card({ title, ...rootProps }: HTMLAttributes<HTMLElement>) {
  return (
    <article {...rootProps}>
      <h3>{title}</h3>
    </article>
  );
}
```

Use `as="section"` (or another HTML element/custom forwarding component) and
`rootProps` for the single container customization surface. For layout-sensitive
markup, select its semantic root and style through those same props:

```tsx
<table>
  <ServerExperienceRenderer
    experience={tablePlan}
    config={rowRegistry}
    as="tbody"
    rootProps={{ style: { display: 'table-row-group' } }}
  />
</table>
```

A custom `as` component forwards the boundary attributes, children and client ref
to its actual root. Server root props exclude DOM refs. The earlier `renderRoot`
callback is removed.

An empty attribution boundary is still emitted when the plan lacks a usable
source map, so a nested Experience cannot borrow an ancestor's scopes. Obtain
attribution with `extensions: { sourceMap: {} }` when application loading owns
fetching; supplied plans use only the attribution they already carry. Repeated
presentations receive distinct container elements, while each node's roots keep
their shared plan-local scope keys. No per-node DOM wrapper is added.

Ordinary single-root components forward HTML attributes and refs, using React
`forwardRef` for React 18 compatibility. They need no SDK-specific root prop.
For fragments, multiple HTML roots, or explicit ref composition, optionally declare
a named root binding. Spread `getRootProps` onto every actual root, with distinct stable
keys; pass customer attributes and refs as its second argument. SDK scope keys
remain authoritative, and object/callback refs are composed, including React 19
callback cleanup. Specialized HTML roots can use `getRootProps<HTMLTableRowElement>()`.

```tsx
import { defineComponent, type ExperienceRootBinding } from '@contentful/experiences-react/client';

function SplitCard({ experienceRoot }: { experienceRoot: ExperienceRootBinding }) {
  return (
    <>
      <article {...experienceRoot.getRootProps('body', { className: 'card' })}>Body</article>
      <aside {...experienceRoot.getRootProps('aside')}>Related content</aside>
    </>
  );
}

const splitCard = defineComponent({
  component: SplitCard,
  root: { prop: 'experienceRoot' },
});
```

The named prop is reserved for the binding. Keep it distinct from content and
slot props. Text-only roots, dropped root props/refs, SVG roots and portals outside
the enclosing boundary are unsupported. Named bindings report a development
warning when attributed roots are not forwarded. A portal needs its own valid
Experience boundary. Custom `as` implementations must forward the boundary
attributes; client root callbacks require its ref too. For direct injected manual
refs, React 18 components use `forwardRef`; React 19 components may forward a ref
prop. The named binding works with ordinary function components in both versions.

For RSC, default forwarding passes only serializable root attributes. Callable
named bindings are created inside a client composition boundary: register client
component references for that path, or create the bound `createExperienceNode`
component in a client module and pass it serializable snapshots. A server-only
registration should use direct attribute forwarding. Ordinary React SSR supports
both paths. Do not pass server-created DOM refs or registration callbacks across
an RSC boundary.

Tracking controls follow Optimization: `clickable`, `trackViews`, `trackHovers`,
and `trackClicks`. Undefined retains existing root attributes and Web defaults;
false disables that automatic kind, and true opts it in subject to SDK consent.
They apply to each node's real roots, including named-slot descendants. Attribution
and scope attributes remain available even when all automatic kinds are disabled.
The earlier automatic/manual/none `tracking` enum is removed.

```tsx
<ExperienceRenderer
  experience={plan}
  config={registry}
  trackViews={false}
  trackHovers={true}
  trackClicks={true}
  clickable
/>
```

Client `onNodeRoot` remains an optional low-level registration seam. It receives
`{ element, node, attribution, data }` for actual HTML roots and can return cleanup
for removal, effective node-data replacement or callback replacement. `node` is a
`NodeSnapshot`; `data` is the SDK-selected innermost rooted scope, ready for the
Web tracking API. It is undefined if the node roots no scope or attribution is
unavailable. Stable rerenders and per-kind option changes preserve manual root
registration. Disable automatic views while explicitly registering manual views:

```tsx
import { useCallback } from 'react';
import {
  createReactExperiences,
  useExperiences,
  type OnExperienceNodeRoot,
  type PortableRenderPlan,
} from '@contentful/experiences-react/client';

const { ExperienceRenderer } = createReactExperiences({ config: registry });

function ManualContent({ plan }: { plan: PortableRenderPlan }) {
  const sdk = useExperiences();
  const registerView = useCallback<OnExperienceNodeRoot>(
    ({ element, data }) => {
      if (!data) return;
      sdk.tracking.enableElement('views', element, { data });
      return () => sdk.tracking.clearElement('views', element);
    },
    [sdk]
  );
  return <ExperienceRenderer experience={plan} trackViews={false} onNodeRoot={registerView} />;
}
```

Mount `ManualContent` under the managed root or an injected provider. Snapshot-to-live
activation and injected SDK replacement change the memoized callback, cleaning
the old registration before attaching the current SDK. Direct application-owned
SDK registration remains supported. Neither path performs attribution
selection or root collection. Web owns measurement, consent and delivery, and
measures each manual element independently. The reference's single-root components
use ordinary forwarding, with no root-count/readiness panel. Context SDK access
and registry binding are available now; Phase 7 carries the same per-kind and
optional root callback props through managed `Experience` loading. That managed
loading API remains planned. The implementation plan
requires concise consumer examples and checks rather than SDK prop threading,
root maps or consumer fetch/subscription/page orchestration. Ordinary identity
and content flows require no extra root/ref boilerplate.

### Custom renderer (`@contentful/experiences-react/custom-renderer`)

For hosts that render a plan themselves instead of using `ServerExperienceRenderer`. `resolveNodeProps` returns each node's component and merged props, `ExperienceNode` renders it the way the SDK renderers do, and `createExperienceNode` renders a node's serializable `snapshot` where components can't be passed as props. `ServerExperienceRenderer` and `ClientExperienceRenderer` render every node through the same `resolveNodeProps` + `ExperienceNode`.

```ts
resolveNodeProps(node, config); // ResolvedNode: 'resolved' (component, props, design, contentful, snapshot) | 'unregistered'
ExperienceNode; // Renders one resolved node or snapshot exactly as the SDK renderers do
createExperienceNode(components, experienceTemplates?); // ExperienceNode with its registry bound, for snapshots
type ResolvedNode, NodeSnapshot, ExperienceNodeProps;
```

### Styling + render context (hooks)

Import hooks from `/client`; pure `toCss` and `getTrackingAttributes` are also
available from the root and `/server`.

```ts
useDesignValues<T>(); // Escape hatch: the same resolved design record that auto-fills props
toCss(design, options?); // Turns a design record into CSSProperties, keeping only real CSS keys
useExperience(); // RenderContext: debug, metadata
useContentfulComponent(); // Raw payload for the enclosing node (or null), including `attribution`
useContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
getTrackingAttributes(attribution); // Props to spread on a node's outermost element for interaction tracking
type ToCssOptions;
```

Resolved design values are **auto-filled onto your component's props** by key, alongside content. Styling from those props is the one recommended path. `useDesignValues()` exposes the same record as an escape hatch. Reach for it only for a nested child that isn't itself a registered component, or for design needed outside the render path (an effect, an imperative measurement) — see [Styling components](../../README.md#styling-components). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

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

## Quick reference

```tsx
// components/Button.tsx: content + resolved design both arrive as props
'use client';

interface ButtonProps {
  label?: string;
  url?: string;
  backgroundColor?: string; // resolved design, auto-filled
  color?: string;
}

export function Button({ label, url, backgroundColor, color }: ButtonProps) {
  return (
    <a href={url} style={{ background: backgroundColor, color }}>
      {label}
    </a>
  );
}
```

```tsx
// lib/experience-config.tsx
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-react';

import { Button } from './components/Button';

const components: Components = {
  // Bare component, or defineComponent({...}) when you need defaults/resolveData.
  Button: defineComponent({
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: Button,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

```tsx
// app/[slug]/page.tsx: in a server component
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-react';

const experience = await fetchExperience(
  { spaceId: process.env.SPACE_ID!, environmentId: 'master', experienceId: slug },
  { accessToken: process.env.CDA_TOKEN! },
  { config: experienceConfig }
);
return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
```

### Slot children

Every slot arrives as a prop named after the slot, holding an **array of pre-rendered nodes** (`ReactNode[]`) keyed by the renderer — not a single wrapping node. Drop the array straight into JSX for the common "just render them" case (React renders keyed arrays), or `map` / `filter` over it to wrap, reorder, or drop children individually.

```tsx
// components/Section.tsx
import type { ReactNode } from 'react';

export function Section({ children }: { children?: ReactNode[] }) {
  // Common case — render them all:
  return <div>{children}</div>;

  // Or take control of each child:
  // return (
  //   <div>
  //     {children?.map((child, i) => (
  //       <div className="cell" key={i}>{child}</div>
  //     ))}
  //   </div>
  // );
}
```

`children` is not special — it is simply the conventional name for the default slot. **Every** slot is merged into props under its own name, each as its own `ReactNode[]`, so a component with a `header` slot just declares `header?: ReactNode[]` and renders it the same way. This applies identically to coded Experience Templates: a template with a `content` slot receives a `content` prop.

For the full getting-started walkthrough, merge-precedence rules, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## Source organization

Public entry files stay at `src/` so the package's import paths remain explicit.
Implementation and colocated tests are grouped by responsibility:

- `rendering/`: server/client renderers, traversal, Experience boundaries and render context.
- `nodes/`: node composition, snapshots and prop resolution.
- `tracking/`: DOM-root bindings, refs and attribution types.
- `diagnostics/`: error boundaries, fallbacks and the debug panel.
- `hooks/`: supplied-plan, design, observable state and bound event/command hooks.
- `provider/`: owned/injected activation, SDK binding and pure registry factory.
- `context/`: SDK access and activation/readiness state.
- `design/`: CSS conversion utilities.
- `registry/`: registration definitions, normalization and types.
- `preview/legacy/`: retained standalone preview hooks/tests, excluded from publication.
- `test/`: shared test utilities and fixture data, excluded from publication.

The build remains unbundled and preserves nested module paths and client directives.
Package entry checks cover the full source tree and its emitted declarations.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.

## Runtime Experience parameters

By-ID `fetchExperience` accepts `parameters`, for example
`{ featuredPosts: { limit: 6, order: '-fields.title' } }`. Scalars are strings or
numbers; Record leaves have one level. Order is one signed `fields.<apiName>` or
`sys.<id>` path. Refetch with changed values, then replace the renderer's plan.
Exports include `ExperienceParameters`, `ExperienceParameterValue`,
`ExperienceParameterRecord`, and `ExperienceParameterOrder`.
See the [collection/refetch example](../../README.md#runtime-experience-parameters).
