---
name: implement-framework-adapter
description: Build a renderer for Contentful Experiences (Experience Orchestration, ExO) in a framework with no first-party adapter, such as Vue, Nuxt, Solid, Lit, or Qwik. Use when asked to render Experiences in an unsupported framework, write or port an Experiences SDK adapter, or render a PortableRenderPlan by hand.
---

# Implement an Experiences SDK adapter for a new framework

An adapter turns a resolved Experience (a `PortableRenderPlan`) into your framework's UI. Fetching and resolving are already framework-neutral; the adapter is the thin render layer on top. This skill walks you through building one, in the order an adapter needs its parts.

## 1. Check that you need an adapter

Use an existing package when one fits:

| The app uses                                                                     | Use                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React, Next.js, React Router / Remix, TanStack Start, Vite + React               | `@contentful/experiences-react` and its `ServerExperienceRenderer` / `ClientExperienceRenderer`                                                              |
| A React-based framework that needs its own render walk, such as Astro islands    | `@contentful/experiences-react/custom-renderer` (`resolveNodeProps`, `ExperienceNode`, `createExperienceNode`). See [`examples/astro`](../../examples/astro) |
| Svelte or SvelteKit                                                              | `@contentful/experiences-svelte`                                                                                                                             |
| Angular                                                                          | `@contentful/experiences-angular`                                                                                                                            |
| Anything else (Vue, Nuxt, Solid, Lit, Qwik, Preact without `preact/compat`, ...) | This skill                                                                                                                                                   |

## 2. Know the two layers

```
fetch + resolve (provided)                      render (you write this)
@contentful/experiences-node  (server)   ─┐
@contentful/experiences-web   (browser)  ─┴─▶  PortableRenderPlan  ─▶  your adapter  ─▶  framework UI
```

**Depend on `@contentful/experiences-node` and `@contentful/experiences-web` only.** They are the public, framework-neutral SDKs. Do not import `@contentful/experiences-sdk-core`, `-client`, or `-runtime` directly: they are internal packages that `-node` and `-web` build on.

Both SDKs produce the same plan. `resolveExperience` has already:

- looked each node's id up in your registry and run its `resolveData` (results land on `node.props.resolved`),
- resolved design tokens with your `resolveToken` (results land on `node.props.design`),
- nested slot children as node arrays, in payload order.

What is left for the adapter is rendering. The plan's shape (only `PortableRenderPlan` is exported; derive the other types from it by indexing):

```ts
import type { PortableRenderPlan } from '@contentful/experiences-node'; // or -web

type PortableRenderNode = PortableRenderPlan['nodes'][number];
type NodeAttribution = NonNullable<PortableRenderNode['attribution']>;
type DesignPropValue = PortableRenderNode['props']['designRaw'][string];
type DeliveryDiagnostic = NonNullable<PortableRenderPlan['deliveryDiagnostics']>[number];

// plan:  { nodes, metadata, debug, diagnostics: Error[], deliveryDiagnostics?, sourceMap?, attribution? }
// node:  { nodeId?, registration: { kind: 'component' | 'experienceTemplate', id },
//          props: { content, design, resolved?, designRaw }, slots: Record<string, node[]>, attribution? }
```

## 3. Set up fetching

Pick by where the app renders. Both take the same `{ config }`.

**Server rendering** (Nuxt, Vite SSR, Express, ...): create one `ContentfulExperiences` per process and call `forRequest()` per request, so locale and metadata never leak between concurrent requests.

```ts
import { ContentfulExperiences, NotFoundError } from '@contentful/experiences-node';

const experiences = new ContentfulExperiences({
  spaceId,
  environmentId,
  delivery: { accessToken: cdaToken },
  preview: cpaToken ? { accessToken: cpaToken } : undefined,
  locale: 'en-US',
});

// per request
const plan = await experiences
  .forRequest({ locale })
  .fetchExperience({ experienceId, preview }, { config: experienceConfig });
```

**Browser only** (SPA): `@contentful/experiences-web` is a singleton. Construct it once in client-side code, call `destroy()` before constructing a replacement (hot reload, teardown), and never construct it on the server. Its tokens are visible to the browser.

```ts
import { ContentfulExperiences } from '@contentful/experiences-web';

const experiences = new ContentfulExperiences({
  spaceId,
  environmentId,
  delivery: { accessToken },
  locale: 'en-US',
});
const plan = await experiences.fetchExperience({ experienceId }, { config: experienceConfig });
```

**Server render + client hydration**: fetch with `-node` on the server and send the plan to the client. Hydrate from the same plan; don't refetch on the client. The plan is plain data except `diagnostics`, which holds `Error` objects that don't survive JSON. Convert them on the way out and back, so a debug panel renders the same on both sides:

```ts
const toWire = (plan: PortableRenderPlan) => ({
  ...plan,
  diagnostics: plan.diagnostics.map((e) => e.message),
});
const fromWire = (wire: ReturnType<typeof toWire>): PortableRenderPlan => ({
  ...wire,
  diagnostics: wire.diagnostics.map((message) => new Error(message)),
});
```

`config` is a `ResolverConfig`: `{ components, experienceTemplates?, resolveToken? }`. Registry values are your framework's components, either bare or as `{ component, defaults?, resolveData? }`. The resolver only reads `resolveData`; your adapter reads `component` and `defaults`. Define a typed `Config` for your framework that extends this shape.

`resolveToken` maps a design token id, such as `color.primary` or `size.md`, to the value your components receive. Without a mapping, the token stays raw and `plan.diagnostics` reports it:

```ts
import type { ResolverConfig } from '@contentful/experiences-node'; // or -web

const designTokens: Record<string, string> = { 'color.primary': '#0f172a', 'size.md': '24px' };

export const experienceConfig: ResolverConfig = {
  components: { card: Card, Section },
  experienceTemplates: { page: Page },
  resolveToken: (token) => designTokens[token.value],
};
```

## 4. Implement the adapter

Every first-party adapter implements these seven concerns. Keep the behavior identical across frameworks, so content renders the same way everywhere.

### 4.1 Registry lookup

- Look a node up by `registration.kind`: `'experienceTemplate'` reads `config.experienceTemplates[id]`, `'component'` reads `config.components[id]`. A component registered under the same id never satisfies a template lookup.
- Normalize the entry. A config object has a `component` field and is not itself a framework component; anything else is a bare component. Write the "is a framework component" check for your framework (React checks `$$typeof`; Vue component definitions are plain objects, so check for `setup`, `render`, or `template`).

### 4.2 Prop merge

Merge in exactly this order, last wins:

```ts
const props = {
  ...defaults,
  ...node.props.design,
  ...node.props.content,
  ...node.props.resolved,
  ...slotProps,
};
```

### 4.3 Recursive walk and slots

- Render `plan.nodes` in order. Key each node by `nodeId`, falling back to its index.
- For each slot, render every child node separately and pass the list to the component under the slot's own name. A slot named `content` becomes `content`. `children` is not special; it is only the conventional default name.
- Two strategies work. Choose the one your framework supports:
  - **Pre-render children** (React passes `ReactNode[]`, Svelte passes `Snippet[]`): render each child into your framework's renderable primitive and pass the array.
  - **Pass nodes plus a renderer** (Angular passes `PortableRenderNode[]` and a `*cfNodes` directive): use this when your framework has no primitive for arbitrary named, lazily rendered children.
- A hand-built plan can contain a slot that isn't an array. Render it as empty and report a diagnostic instead of throwing.
- Pass slots as props, as part of the merge. If your framework also has a native named-slot API (Vue), you can expose the same arrays there under the same names, but keep the props: they are what the merge and the other adapters guarantee.

Components receive every merged key as a prop, including design values and slot arrays. In frameworks that copy undeclared props onto the root element as HTML attributes (Vue's attribute fallthrough), components must declare the props they read, or set `inheritAttrs: false`. Otherwise design values and slot arrays end up stringified in the markup.

### 4.4 Context

Publish three things so components can read them without prop drilling:

| Context                            | Value                                                                                                                 | First-party accessor                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Render context (once, at the root) | `{ debug, metadata }`. Renderer options override the plan: `debug ?? plan.debug`; `{ ...plan.metadata, ...metadata }` | `useExperience()`                                                |
| Node payload (per node)            | `{ componentId \| experienceTemplateId, nodeId, content, design: node.props.designRaw, resolved, attribution }`       | `useContentfulComponent()` / `useContentfulExperienceTemplate()` |
| Resolved design (per node)         | `node.props.design`                                                                                                   | `useDesignValues()`                                              |

Name the accessors in your framework's idiom (Svelte uses `getExperience()`, Angular uses `injectExperience()`). They take no arguments:

- The render-context accessor returns `{ debug, metadata }` and throws outside a renderer.
- The node-payload accessors return the payload, or `null`/`undefined` outside a node of that kind.
- The design accessor returns the resolved design record, or `{}` outside a node.

Svelte's component payload also carries the node's `slots`; React's doesn't. Either is fine. Publish a node's payload before you look up its component, so a fallback rendered in its place can still read it.

### 4.5 Fallbacks

| Case                             | Render                                                                                     | Also                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Unregistered component           | Nothing when `debug` is off; a visible placeholder when `debug` is on                      | Report `No component registered for id "<id>" (nodeId: <nodeId>).` |
| Unregistered experience template | Its slot children, unwrapped. Replacing a template with a placeholder would blank the page | Warn, and report the diagnostic                                    |
| Malformed slot                   | Nothing for that slot                                                                      | Report the diagnostic                                              |

Let the app override the unregistered-component and error fallbacks, as `renderUnknown` and `renderError` do in the first-party adapters.

### 4.6 Per-node error isolation

Wrap each node in your framework's error boundary, so a component that throws renders the error fallback and its siblings keep rendering. Report a diagnostic that names the component, kind, and node, with the original error as `cause`. Check your framework's server behavior. Svelte's `<svelte:boundary>` and React's class error boundaries don't catch during server rendering. Vue's `onErrorCaptured` does fire during `renderToString`, so a boundary can render the fallback on the server too: render the child, then a sibling that reads an error flag set by `onErrorCaptured`. Document the gap if your framework can't close it.

### 4.7 Diagnostics and debugging

- Start from `plan.diagnostics` (resolve-time problems: failing `resolveData`, unresolved tokens, malformed nodes) and keep every entry, including repeated messages: two nodes can legitimately report the same problem.
- Add render-time diagnostics (unregistered ids, malformed slots, components that threw). Skip a render-time report whose message you have already collected: re-renders call your node renderer again.
- Report diagnostics through an `onDiagnostic(error)` callback on your root renderer, so apps can log them and tests can assert on them.
- Report diagnostics synchronously during render, not in an effect. Effects don't run during server rendering, so an effect-deferred report vanishes on the server.
- `plan.deliveryDiagnostics` lists upstream field-resolution errors, such as a content binding that failed to resolve. Its messages can contain private data: show a count or generic warning by default and keep the details out of logs and client payloads.
- When `debug` is on, render a panel with the resolved plan and the collected diagnostics after the tree.

### Optional

- **Tracking attributes**: spread `getTrackingAttributes(node.attribution)` from `@contentful/experiences-web/tracking-attributes` onto a component's outermost element for interaction tracking. Attribution is present only when the fetch requests `extensions: { sourceMap: {} }`.
- **Live preview**: Preview Session updates are owned by `@contentful/experiences-live-preview` (`createLivePreviewClient`), not by `-node` or `-web`. Treat it as a follow-up once the adapter renders a fetched plan.

## 5. Handle the server/client split

- Keep the render chain free of client-only APIs if your framework renders on the server. React's renderer is hook-free for this reason, so it can run inside a Server Component.
- Render the same plan on the server and on the client. A plan resolved differently on either side causes hydration mismatches.
- Context doesn't cross serialization boundaries. If your framework hydrates parts of a page separately (islands, client components inside server components), re-create the render context and the node payload inside each one. Pass plain data across the boundary, never component references or `config`.
- `metadata` must be plain serializable data; it travels with the plan.

## 6. Map the concepts to your framework

| Concern                     | React                             | Svelte 5                    | Angular                                             | Vue 3                                                      | Solid                                    |
| --------------------------- | --------------------------------- | --------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| Render a registry component | `createElement(component, props)` | `<Cmp {...props} />`        | `ViewContainerRef.createComponent` + input bindings | `h(component, props, slots)` or `<component :is>`          | `<Dynamic component={...} {...props} />` |
| Context                     | `createContext` + provider        | `setContext` / `getContext` | Per-node `Injector.create` + `inject()`             | `provide` / `inject`                                       | `createContext` / `useContext`           |
| Slot children               | `ReactNode[]` props               | `Snippet[]` props           | `PortableRenderNode[]` inputs + `*cfNodes`          | `VNode[]` props (optionally also named slots)              | `JSX.Element[]` props                    |
| Error isolation             | Class error boundary              | `<svelte:boundary>`         | `try`/`catch` around `createComponent`              | `onErrorCaptured` in a wrapper (catches on the server too) | `<ErrorBoundary>`                        |
| Plan updates                | State                             | `$state`                    | Signals                                             | `shallowRef`                                               | Signals                                  |

## 7. Verify the adapter

Build a hand-built plan (a supported input) and test against it. Cover at least:

1. **Registered component**: renders with merged props, and each layer overrides the one below (defaults < design < content < resolved < slots).
2. **Registry kinds**: a template id resolves from `experienceTemplates`, never from `components`.
3. **Slots**: a named slot (`content`) and `children` arrive under their names, in order, and nested nodes render recursively.
4. **Unregistered component**: renders the fallback, shows the placeholder only with `debug`, and reports the diagnostic.
5. **Unregistered template**: renders its slot children unwrapped.
6. **Error isolation**: a component that throws renders the error fallback and its siblings still render.
7. **Context**: a component reads `debug` and `metadata` from the render context, and its own node payload and design values.
8. **Server rendering** (if supported): the server output hydrates without a mismatch.

Then render a real Experience fetched with `-node` or `-web`. To compare with a first-party adapter, render the same Experience with one of the [examples](../../examples) and check that both produce the same components in the same order, with the same text and slot nesting. Markup differs between frameworks, so compare structure and content rather than HTML.

```ts
const plan: PortableRenderPlan = {
  metadata: {},
  debug: false,
  diagnostics: [],
  nodes: [
    {
      nodeId: 'tpl',
      registration: { kind: 'experienceTemplate', id: 'page' },
      props: { content: {}, design: {}, designRaw: {} },
      slots: {
        content: [
          {
            nodeId: 'card',
            registration: { kind: 'component', id: 'card' },
            props: { content: { title: 'Hi' }, design: { color: 'red' }, designRaw: {} },
            slots: {},
          },
          {
            nodeId: 'missing',
            registration: { kind: 'component', id: 'not-registered' },
            props: { content: {}, design: {}, designRaw: {} },
            slots: {},
          },
        ],
      },
    },
  ],
};
```

## 8. Translate from the reference adapters

Read these in this order. Svelte and Angular are the closest models for a non-React framework.

| File                                                                                                                               | Shows                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`packages/adapter-svelte/src/NodeRenderer.svelte`](../../packages/adapter-svelte/src/NodeRenderer.svelte)                         | One node: lookup, payload context, merge, fallbacks, error boundary, deduplicated diagnostics   |
| [`packages/adapter-svelte/src/NodesRenderer.svelte`](../../packages/adapter-svelte/src/NodesRenderer.svelte)                       | The recursive walk and slot pre-rendering                                                       |
| [`packages/adapter-svelte/src/context.ts`](../../packages/adapter-svelte/src/context.ts)                                           | Context keys and accessors                                                                      |
| [`packages/adapter-svelte/src/ServerExperienceRenderer.svelte`](../../packages/adapter-svelte/src/ServerExperienceRenderer.svelte) | Root render context, diagnostics collection, debug panel                                        |
| [`packages/adapter-angular/src/node-render-engine.ts`](../../packages/adapter-angular/src/node-render-engine.ts)                   | Slots as nodes plus a renderer, per-node DI scopes, error handling without a boundary component |
| [`packages/adapter-react/src/resolve-node-props.ts`](../../packages/adapter-react/src/resolve-node-props.ts)                       | The canonical lookup and merge                                                                  |
| [`packages/adapter-react/src/experience-node.tsx`](../../packages/adapter-react/src/experience-node.tsx)                           | Providers and error boundary around one node                                                    |

The first-party examples in [`examples/`](../../examples) register the same components against the same demo Experience. Port one of them to check your adapter renders identically.
