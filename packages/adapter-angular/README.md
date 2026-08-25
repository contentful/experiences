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

### Resolver

```ts
resolveExperience(payload, config, opts?); // Async; walks payload, runs resolveData, returns a PortableRenderPlan
```

### Renderers

Every renderer is standalone; add it to your own component's `imports`.

```ts
ServerExperienceRenderer; // <cf-server-experience>  SSR-safe; active viewport seeded from initialViewportId
ClientExperienceRenderer; // <cf-experience>         Subscribes to window.matchMedia
MissingComponent; // <cf-missing-component>  Default fallback for unregistered component types
NodesRenderer; // *cfNodes                Renders a slot's raw nodes (see Slot children)
NodeRenderer; // *cfNode                 Renders one node; NodesRenderer loops over it
DebugExperience; // <cf-debug-experience>   Auto-mounted by the renderers when debug is set
injectActiveViewport; // Signal-backed viewport index; you'll rarely need it directly
```

`NodesRenderer` and `NodeRenderer` are **structural directives**, not components, so they add no element of their own — see [Slot children](#slot-children).

Each is also exported under its Angular-suffixed class name (`ServerExperienceRendererComponent`, `NodesRendererDirective`, and so on), and `ExperienceRenderer` is an alias for `ClientExperienceRenderer`.

### Styling + runtime context (helpers)

All four are `inject()`-based: call them from a field initializer or a constructor, like any other Angular injection API.

```ts
injectDesignValues<T>(); // Signal of the resolved design record that auto-fills inputs
toCss(design, options?); // Turns a design record into a plain style object for [ngStyle]
injectExperience(); // Signal<RenderContext>: debug, metadata, viewports, activeViewport
injectContentfulComponent(); // Signal of the raw payload for the enclosing node (or undefined)
injectContentfulExperienceTemplate(); // Same, for an enclosing coded Experience Template node
type ToCssOptions;
```

Resolved design values (viewport-cascaded + token-resolved server-side) are **auto-filled onto your component's inputs** by key, alongside content. Declaring an `@Input()` per key you style with is the recommended path; `injectDesignValues()` returns the same record as a `Signal` for cases inputs don't cover — including keys your component didn't declare, which are **dropped** rather than passed (see [Parity table](#parity-table)). Token resolution is configured with `resolveToken` on your `Config` (`type ResolveToken`).

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
type DesignPropValue, ManualDesignValue, DesignToken, ValuesByViewport,
type ViewportDef, ExperienceContext, ResolveContext,
type ResolverConfig, ResolveExperienceOptions

// From design (if you want to do your own viewport-aware resolution)
getValueForViewport, getViewportIndex, resolveDesignProperties, toCssMediaQuery,
isCssProperty, toCssKey, CSS_PROPERTIES

// From client
createClient, fetchExperience, ContentfulViewDelivery, ContentfulViewDeliveryClient,
NotFoundError, DELIVERY_HOST, PREVIEW_HOST
```

---

## Quick reference

```ts
// button.component.ts — content + resolved design both arrive as inputs
import { Component, Input, signal } from '@angular/core';

@Component({
  selector: 'app-button',
  template: `
    @if (urlValue()) {
      <a [href]="urlValue()" [style.background]="bgValue()" [style.color]="colorValue()">
        {{ labelValue() }}
      </a>
    } @else {
      <button type="button" [style.background]="bgValue()" [style.color]="colorValue()">
        {{ labelValue() }}
      </button>
    }
  `,
})
export class ButtonComponent {
  protected readonly labelValue = signal('Button');
  protected readonly urlValue = signal<string | undefined>(undefined);
  protected readonly bgValue = signal<string | undefined>(undefined);
  protected readonly colorValue = signal<string | undefined>(undefined);

  // Decorator inputs bridged into signals, not signal input(): see the parity
  // table. The input name is what the payload key binds to; the readable signal
  // needs a different name, and must be `protected`, not `private`, to stay
  // template-readable under strictTemplates.
  @Input() set label(value: string | undefined) {
    this.labelValue.set(value ?? 'Button');
  }
  @Input() set url(value: string | undefined) {
    this.urlValue.set(value);
  }
  @Input() set backgroundColor(value: string | undefined) {
    this.bgValue.set(value);
  }
  @Input() set color(value: string | undefined) {
    this.colorValue.set(value);
  }
}
```

```ts
// experience-config.ts
import {
  defineComponent,
  type Components,
  type Config,
  type ResolveToken,
} from '@contentful/experiences-angular';
import { ButtonComponent } from './components/button.component';

interface ButtonProps {
  label?: string;
  url?: string;
  backgroundColor?: string; // resolved design, auto-filled
  color?: string;
}

const components: Components = {
  // Bare component class, or defineComponent({...}) when you need defaults/resolveData.
  Button: defineComponent<ButtonProps>({
    resolveData: ({ content }) => ({ url: ensureScheme(content.url) }),
    component: ButtonComponent,
  }),
};

const resolveToken: ResolveToken = (token) => designTokens[token.value];

export const experienceConfig: Config = { components, resolveToken };
```

```ts
// page.component.ts
import { Component, Input } from '@angular/core';
import { ServerExperienceRenderer, type PortableRenderPlan } from '@contentful/experiences-angular';
import { experienceConfig } from './experience-config';

@Component({
  selector: 'app-page',
  imports: [ServerExperienceRenderer],
  template: `<cf-server-experience [experience]="experience" [config]="config" />`,
})
export class PageComponent {
  @Input() experience!: PortableRenderPlan;
  protected readonly config = experienceConfig;
}
```

### Slot children

Every slot arrives as an input named after the slot, holding an **array of nodes** (`PortableRenderNode[]`, aliased `SlotNodes`) — not renderable children. Hand the array to `*cfNodes` to render it; to wrap, reorder, or drop children individually, loop the array yourself and render each with `*cfNode`.

```ts
// section.component.ts
import { Component, Input, signal } from '@angular/core';
import { NodesRenderer, type SlotNodes } from '@contentful/experiences-angular';

@Component({
  selector: 'app-section',
  imports: [NodesRenderer],
  // Common case — render them all:
  template: `<div><ng-container *cfNodes="nodes()"></ng-container></div>`,
  // Or take control of each child, with NodeRenderer in imports instead:
  //   <div>
  //     @for (child of nodes() ?? []; track $index) {
  //       <div class="cell"><ng-container *cfNode="child"></ng-container></div>
  //     }
  //   </div>
})
export class SectionComponent {
  protected readonly nodes = signal<SlotNodes | undefined>(undefined);

  @Input() set children(value: SlotNodes | undefined) {
    this.nodes.set(value);
  }
}
```

Slot children stay **lazy**: a component that never renders a slot input never instantiates those subtrees.

Both are **structural directives**, so the adapter puts no element of its own between you and your children: they render as direct children of the element you wrapped them in, exactly as in React and Svelte. `display: grid` with `gap` on the `<div>` above lays out **the slot children**; `> .card`, `:nth-child(2)`, `:first-child`, and the `+`/`~` combinators all work. (Each directive leaves a comment anchor, as Svelte does — comments are not elements, so they affect neither layout nor any of those selectors.)

`children` is not special — it is simply the conventional name for the default slot. **Every** slot in the payload becomes a same-named `SlotNodes` input, so a component with a `header` slot just declares `header` and renders it the same way. This applies identically to coded Experience Templates: a template with a `content` slot receives a `content` input.

The same nodes are also on the payload at `injectContentfulComponent()().slots` (a `Record<string, PortableRenderNode[]>`).

---

## Parity table

Everything below is a deliberate divergence from React and Svelte, forced by an Angular primitive. Semantics — merge precedence, the viewport cascade, degradation behaviour, context walk-up — are identical across all three adapters and covered by the same ported test suite.

| Concern                                          | React                                                                                        | Svelte                                                       | Angular                                                                          | Why                                                                                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime accessors                                | `useExperience()`, `useDesignValues()`                                                       | `getExperience()`, `getDesignValues()`                       | `injectExperience()`, `injectDesignValues()`                                     | Angular's DI idiom. Must be called from an injection context.                                                                                                                             |
| Accessor return type                             | plain value (re-renders)                                                                     | plain value (read in `$derived`)                             | `Signal<T>` — call it to read                                                    | Signals are Angular's reactive primitive.                                                                                                                                                 |
| Renderer usage                                   | `<ServerExperienceRenderer …/>`                                                              | `<ServerExperienceRenderer …/>`                              | `<cf-server-experience …/>` after adding `ServerExperienceRenderer` to `imports` | Angular components are referenced by selector, imported by class.                                                                                                                         |
| Slot children                                    | `children: ReactNode` — render directly                                                      | `Snippet[]` — `{@render child()}`                            | `PortableRenderNode[]` — render with `*cfNodes`                                  | Angular has no lazy named-slot primitive; `projectableNodes` is positional and eager.                                                                                                     |
| `NodesRenderer`                                  | not exported                                                                                 | exported (escape hatch)                                      | exported and **load-bearing**                                                    | It is the only way to render a slot.                                                                                                                                                      |
| Undeclared merged keys                           | passed through as props                                                                      | passed through as props                                      | **dropped**                                                                      | Binding an input a component does not declare is an error, so the merged record is filtered via `reflectComponentType`. Still readable through `injectDesignValues()`.                    |
| Reading dropped keys                             | n/a                                                                                          | n/a                                                          | `injectDesignValues()`                                                           | The full resolved design record is always available regardless of declared inputs.                                                                                                        |
| Component inputs                                 | props                                                                                        | `$props()`                                                   | `@Input()` setter → `signal`                                                     | Signal `input()` is AOT-only; a JIT consumer reports zero declared inputs, which would break `reflectComponentType` filtering.                                                            |
| Input naming                                     | any                                                                                          | any                                                          | setter takes the payload key; the readable signal needs a distinct name          | A class cannot declare a field and an accessor under one name, and under `useDefineForClassFields: false` the field initializer would assign straight through the setter.                 |
| `injectActiveViewport` args                      | values                                                                                       | values                                                       | **getters** (`() => viewports`)                                                  | An injection context runs before inputs are bound. Every `Signal` is already a getter, so passing one works unchanged.                                                                    |
| Missing-component warning                        | effect                                                                                       | effect                                                       | `ngOnInit`                                                                       | So the diagnostic also fires during server rendering.                                                                                                                                     |
| Prop-shape types                                 | inferred                                                                                     | separate `*.ts` per component                                | not needed                                                                       | Angular components are `.ts`, so `tsc --noEmit` already resolves them.                                                                                                                    |
| Style helper output                              | `CSSProperties`                                                                              | plain record                                                 | plain record for `[ngStyle]`                                                     | Scalar-only, same as Svelte.                                                                                                                                                              |
| `component-render-error` under SSR               | caught (internal `<Suspense>` degrades gracefully under both legacy and streaming renderers) | **not caught** — `<svelte:boundary>` doesn't run server-side | caught, identically to CSR                                                       | Angular has no separate server renderer — `createComponent` is the same call either way. See the root README's [error-handling section](../../README.md#error-handling--troubleshooting). |
| `component-render-error` after a later re-render | caught (standard class boundary)                                                             | caught (standard `<svelte:boundary>`)                        | **not caught** — creation-time only                                              | A per-node `ErrorHandler` was tried and doesn't get consulted for later change-detection throws; documented gap, not shipped as a partial fix.                                            |

**Not** a divergence: the DOM around slot children. React renders them through a fragment, Svelte through no element, and Angular through structural directives — no adapter element in any of the three. Dispatch deliberately does not use components, because an Angular component always has a host element and no configuration removes it; `display: contents` would hide such a wrapper from layout but not from `> .card`, `:nth-child(n)`, or the sibling combinators.

For the full getting-started walkthrough, the merge-precedence rules, viewport handling, and design rationale, see the [root README](../../README.md) and [`AGENTS.md`](../../AGENTS.md).

---

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
