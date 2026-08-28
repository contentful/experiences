/*
 * Per-node render logic, plus the imperative engine that puts customer
 * components into the DOM. Port of adapter-svelte/src/NodeRenderer.svelte.
 *
 * Why an engine class instead of components: an Angular component selector is
 * always a real DOM element, so a dispatch chain built out of components
 * physically nests wrappers between a customer component and its slot children —
 * where React renders a fragment and Svelte renders nothing. `display: contents`
 * hides those wrappers from layout but not from CSS: `.grid > .card`,
 * `:nth-child(n)`, `+` and `~` still see the plumbing. A structural directive
 * has no host element, so `<ng-container *cfNodes="nodes">` leaves nothing but a
 * comment anchor, and children are created as *siblings of that anchor* —
 * direct children of the customer's own element. `Element.children` excludes
 * comments, so `:nth-child`, `:first-child` and sibling combinators all behave
 * as they do in React and Svelte. Svelte leaves comment anchors too.
 *
 * That is also why the per-node DI scopes are built with `Injector.create`
 * rather than a component `providers` array. `providers` is static per class,
 * which is what previously forced "component node" and "experience template
 * node" to be two different component classes; an injector built per node can
 * decide per node. The `parent` is the anchor's own injector, which is exactly
 * what `NgComponentOutlet` passes by default, so the element-injector walk-up
 * that `injectExperience()` / `injectContentfulExperienceTemplate()` rely on is
 * unchanged.
 *
 * The Svelte adapter's ordering guarantee — an unregistered node still exposes
 * its payload to whatever renders in its place — used to be structural here
 * (the scope-providing wrapper was constructed before the host that performed
 * the registry lookup). It is now statement order in `createUnit`: the scopes
 * are constructed and connected before `createComponent` is ever called. Keep
 * it that way.
 */

import {
  type Binding,
  type ComponentRef,
  Injector,
  type Signal,
  type StaticProvider,
  type Type,
  type ViewContainerRef,
  type WritableSignal,
  computed,
  inputBinding,
  reflectComponentType,
  signal,
} from '@angular/core';

import { selectResolvedDesign } from '@contentful/experiences-design';
import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

import { ExperienceScope } from './experience-scope.js';
import { ComponentScope, DesignScope, ExperienceTemplateScope } from './node-scopes.js';
import {
  type Config,
  type ContentfulComponent,
  type ContentfulExperienceTemplate,
  normalizeComponentRegistration,
  normalizeExperienceTemplateRegistration,
} from './types.js';

/**
 * What a node resolves to. `render` covers both the registered-component case
 * and the missing-component fallback — they differ only in which class and which
 * props, so there is no reason to branch twice.
 *
 * `bindable` is the set of merged keys this node may ever expose, computed from
 * the *raw* payload rather than from `props`. It has to be stable across
 * viewport switches: token resolution can drop a key (see `selectResolvedDesign`
 * and the `resolveToken` warning below), and a bound-key list that shrank on a
 * viewport change would force the view to be rebuilt, destroying whatever state
 * the customer component was holding.
 */
type Resolution =
  | {
      readonly mode: 'render';
      readonly component: Type<unknown>;
      readonly props: Record<string, unknown>;
      readonly bindable: readonly string[];
      readonly diagnostics: readonly Error[];
    }
  | {
      readonly mode: 'orphaned';
      readonly nodes: readonly PortableRenderNode[];
      readonly diagnostics: readonly Error[];
    };

/**
 * One `PortableRenderNode[]` input per slot, keyed by slot name. Angular has no
 * lazy renderable-child primitive that supports arbitrary named slots, so slots
 * arrive as raw node arrays and customers render them with `*cfNodes`. That
 * keeps slot children lazy: an unrendered slot never instantiates.
 *
 * Defensive: `node.slots[x]` is typed as an array, but a hand-built
 * PortableRenderPlan (a supported path — customers can construct one
 * directly instead of going through `resolveExperience`) is not
 * type-checked at runtime. Warn + drop rather than throwing, matching
 * React/Svelte — this used to be this adapter's one remaining throw.
 */
function toSlotInputs(node: PortableRenderNode): {
  slots: Record<string, PortableRenderNode[]>;
  diagnostics: Error[];
} {
  const slots: Record<string, PortableRenderNode[]> = {};
  const diagnostics: Error[] = [];
  for (const [slotName, children] of Object.entries(node.slots)) {
    if (!Array.isArray(children)) {
      const { kind, id } = node.registration;
      const message =
        `Slot "${slotName}" on ${kind} "${id}"${node.nodeId ? ` (node "${node.nodeId}")` : ''} ` +
        `is not an array of nodes; rendering it as empty instead of throwing.`;
      // console.warn is fine inside the `resolution` computed this feeds —
      // Angular's signal-purity rule only forbids *signal writes* there.
      // Reporting into `ExperienceScope.diagnostics` (a signal write) happens
      // imperatively in `collect()` instead, once per fresh computation —
      // see the `lastDiagnostics` reference check there.
      if (typeof console !== 'undefined') {
        console.warn(`[@contentful/experiences-angular] ${message}`);
      }
      diagnostics.push(new Error(message));
      slots[slotName] = [];
      continue;
    }
    slots[slotName] = children;
  }
  return { slots, diagnostics };
}

/**
 * Note `design` reads from `props.designRaw`, not `props.design`: the raw record
 * keeps every viewport's value, so a customer component doing its own cascade
 * math has the full picture. `injectDesignValues()` is the resolved view.
 */
function toContentfulComponent(node: PortableRenderNode): ContentfulComponent {
  return {
    componentId: node.registration.id,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
    slots: node.slots,
  };
}

function toContentfulExperienceTemplate(node: PortableRenderNode): ContentfulExperienceTemplate {
  return {
    experienceTemplateId: node.registration.id,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.designRaw,
    resolved: node.props.resolved,
  };
}

/** Viewport-cascaded, token-resolved design values for one node. */
function resolveDesign(
  node: PortableRenderNode,
  experienceScope: ExperienceScope
): Record<string, unknown> {
  const experience = experienceScope.experience();
  const { props, unresolved } = selectResolvedDesign(
    node.props,
    experience.viewports,
    experience.activeViewportIndex,
    experience.fallbackViewportIndex,
    experienceScope.config().resolveToken
  );
  if (unresolved.length && typeof console !== 'undefined') {
    const { kind, id } = node.registration;
    console.warn(
      `[@contentful/experiences-angular] resolveToken returned undefined for token id(s) on ${kind} "${id}": ${unresolved.join(', ')}. injectDesignValues() will omit those keys.`
    );
  }
  return props;
}

/**
 * Every key the merge could produce, from sources that do not depend on the
 * active viewport. Both `design` (resolved for the fallback viewport) and
 * `designRaw` (every viewport) contribute, because token resolution may omit
 * keys from the former.
 *
 * A key in this set that the merge does not currently produce is bound as
 * `undefined` — a small, deliberate divergence from React and Svelte, where
 * nothing would be passed at all. Setters written as `value ?? fallback` (the
 * shape the README recommends) are unaffected.
 */
function bindableKeys(node: PortableRenderNode, defaults: object | undefined): string[] {
  const keys = new Set<string>();
  const sources: Array<object | undefined> = [
    defaults,
    node.props.design,
    node.props.designRaw,
    node.props.content,
    node.props.resolved,
    node.slots,
  ];
  for (const source of sources) {
    if (source) for (const key of Object.keys(source)) keys.add(key);
  }
  return [...keys];
}

/**
 * Narrow a key list to the inputs the target component actually declares.
 * Angular-only, and not optional: binding an undeclared input is an error, so
 * passing the full merged record would fail on every design key the component
 * never asked for.
 *
 * The visible consequence — dropped keys are not passed as inputs — is the
 * documented Angular divergence in the README's parity table. They stay
 * reachable through `injectDesignValues()` and `injectContentfulComponent()`.
 * A pleasant side effect: the adapter cannot leak framework props onto a
 * customer component, because it never declared them.
 */
function declaredOnly(component: Type<unknown>, keys: readonly string[]): string[] {
  const mirror = reflectComponentType(component);
  if (!mirror) return [];
  const declared = new Set(mirror.inputs.map(({ templateName }) => templateName));
  return keys.filter((key) => declared.has(key));
}

function resolveNode(
  node: PortableRenderNode,
  experienceScope: ExperienceScope,
  design: Record<string, unknown>
): Resolution {
  // Read ahead of the registry lookup: the unregistered-template path renders
  // slot children unwrapped, so a malformed slot has to fail identically for
  // registered and unregistered nodes.
  const { slots, diagnostics } = toSlotInputs(node);

  const { kind, id } = node.registration;
  const isExperienceTemplate = kind === 'experienceTemplate';
  const config = experienceScope.config();
  const entry = isExperienceTemplate ? config.experienceTemplates?.[id] : config.components[id];

  if (entry) {
    const normalized = isExperienceTemplate
      ? normalizeExperienceTemplateRegistration(entry)
      : normalizeComponentRegistration(entry);
    // Merge precedence (last wins): defaults < design < content < resolveData < slots.
    const props = {
      ...normalized.defaults,
      ...design,
      ...node.props.content,
      ...node.props.resolved,
      ...slots,
    };
    return {
      mode: 'render',
      component: normalized.component,
      props,
      bindable: declaredOnly(normalized.component, bindableKeys(node, normalized.defaults)),
      diagnostics,
    };
  }

  // An unregistered Experience Template would blank the page if we swapped it
  // for the missing-component box, so warn and render its slot children
  // unwrapped — the content survives, the diagnostic names what's missing.
  if (isExperienceTemplate) {
    const message = `No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`;
    if (typeof console !== 'undefined') {
      console.warn(`[@contentful/experiences-angular] ${message}`);
    }
    return {
      mode: 'orphaned',
      nodes: Object.values(slots).flat(),
      diagnostics: [...diagnostics, new Error(message)],
    };
  }

  const renderUnknown = experienceScope.renderUnknown();
  // `MissingComponentComponent` (the default `renderUnknown`) does its own
  // console.warn from `ngOnInit`; a custom override may not, so the
  // diagnostic is recorded here regardless of which fallback ends up
  // rendering.
  return {
    mode: 'render',
    component: renderUnknown,
    props: { componentId: id, nodeId: node.nodeId },
    bindable: declaredOnly(renderUnknown, ['componentId', 'nodeId']),
    diagnostics: [
      ...diagnostics,
      new Error(
        `No component registered for id "${id}"${node.nodeId ? ` (nodeId: ${node.nodeId})` : ''}.`
      ),
    ],
  };
}

/**
 * One node's live state. `ref` is null for an orphaned experience template,
 * which renders no view of its own but still owns an injector so its unwrapped
 * children keep resolving its `ExperienceTemplateScope`.
 */
interface Unit {
  readonly node: WritableSignal<PortableRenderNode>;
  readonly resolution: Signal<Resolution>;
  /** Parent for this node's own subtree. Provides its per-node scopes. */
  readonly injector: Injector;
  /** What `injector` was built on. A node that moves under a different parent is rebuilt. */
  readonly parentInjector: Injector;
  ref: ComponentRef<unknown> | null;
  /** What's actually mounted right now — the customer's component, or the error fallback. */
  componentType: Type<unknown> | null;
  /**
   * What `resolution.component` was last attempted, regardless of whether
   * creating it succeeded. Deliberately distinct from `componentType`: after
   * a caught creation failure, `componentType` becomes the error fallback
   * while this stays the customer's (still-broken) class, so the *next* sync
   * sees "same resolution, already attempted" and leaves the fallback in
   * place instead of retrying the same failing `createComponent` call forever.
   */
  attemptedComponentType: Type<unknown> | null;
  /** Reference to the last `resolution.diagnostics` array this unit reported. */
  lastDiagnostics: readonly Error[] | null;
  /**
   * Set once `collect()` catches a throw from reading `unit.resolution()`
   * itself (as opposed to a creation-time throw from `createComponent`).
   * Same "don't retry the same failing thing every sync" rationale as
   * `attemptedComponentType`, but tracked separately: while this stays
   * `true`, `resolution()` is still throwing on every read (Angular's
   * `computed()` caches and rethrows a computation error until its
   * dependencies change again), so there's no `resolution.component` to
   * compare against — `collect()` would otherwise detach and recreate the
   * same error fallback on every single sync.
   */
  resolutionFailed: boolean;
}

/**
 * Creates, reuses, reorders and destroys the views for a list of nodes in one
 * `ViewContainerRef`. Driven by the two structural directives in
 * node-renderer.directive.ts; not exported from the package.
 */
export class NodeRenderEngine {
  private readonly units = new Map<string, Unit>();
  private nodes: readonly PortableRenderNode[] = [];
  private lastConfig: Config | null = null;

  constructor(
    private readonly viewContainerRef: ViewContainerRef,
    private readonly hostInjector: Injector,
    private readonly experienceScope: ExperienceScope
  ) {}

  /**
   * Called synchronously from the directive's input setter — the same point
   * `NgComponentOutlet` creates from in `ngOnChanges`. It has to be synchronous
   * rather than deferred to an effect: a single `detectChanges()` (which is all
   * the test harness and `renderApplication` give us) must produce the full
   * tree.
   */
  setNodes(nodes: readonly PortableRenderNode[]): void {
    this.nodes = nodes;
    this.sync();
  }

  /**
   * Re-syncs if the registry changed under us. Which component a node resolves
   * to depends on `config`, and nothing else the engine reads is structural —
   * design values and content flow through the input bindings, which change
   * detection already tracks.
   */
  checkConfig(): void {
    if (this.experienceScope.config() === this.lastConfig) return;
    this.sync();
  }

  destroy(): void {
    for (const unit of this.units.values()) this.detach(unit);
    this.units.clear();
  }

  private sync(): void {
    this.lastConfig = this.experienceScope.config();

    const live: Unit[] = [];
    const seen = new Set<string>();
    this.collect(this.nodes, this.hostInjector, '', live, seen);

    for (const [key, unit] of this.units) {
      if (seen.has(key)) continue;
      this.detach(unit);
      this.units.delete(key);
    }

    // Views are appended as they are created, so a reordered plan needs a
    // normalizing pass. `move` relocates a live view without re-creating it.
    live.forEach((unit, index) => {
      const view = unit.ref!.hostView;
      if (this.viewContainerRef.indexOf(view) !== index) {
        this.viewContainerRef.move(view, index);
      }
    });
  }

  /**
   * Walks `nodes` in DOM order, appending every unit that owns a view to
   * `live`. Recurses only through orphaned experience templates: ordinary
   * recursion happens through the customer component, which renders its own
   * slots with its own `*cfNodes`.
   */
  private collect(
    nodes: readonly PortableRenderNode[],
    parentInjector: Injector,
    path: string,
    live: Unit[],
    seen: Set<string>
  ): void {
    nodes.forEach((node, index) => {
      // `nodeId` is the stable identity that lets a reordered plan reuse views.
      // Fall back to position when it is absent or duplicated in one plan.
      const key = node.nodeId && !seen.has(node.nodeId) ? node.nodeId : `${path}#${index}`;
      seen.add(key);

      let unit = this.units.get(key);
      // A node whose kind changed needs the other scope class, and one that
      // moved under a different parent needs a re-parented injector. Neither is
      // patchable — rebuild.
      if (
        unit &&
        (unit.parentInjector !== parentInjector ||
          unit.node().registration.kind !== node.registration.kind)
      ) {
        this.detach(unit);
        this.units.delete(key);
        unit = undefined;
      }

      if (unit) {
        unit.node.set(node);
      } else {
        unit = this.createUnit(node, parentInjector);
        this.units.set(key, unit);
      }

      // `resolveNode`/`resolveDesign` are expected to degrade rather than
      // throw (malformed slots, unresolved tokens — see resolve-experience.ts
      // for the equivalent core-level guarding), but nothing stops a future
      // change there, or a customer-supplied `resolveToken` throwing, from
      // taking that guarantee away. This is a *recomputation* on an existing
      // unit — the same failure mode `createView`'s catch handles for brand
      // new ones, just triggered by a later sync instead of first creation.
      const wasResolutionFailing = unit.resolutionFailed;
      let resolution: Resolution;
      try {
        resolution = unit.resolution();
        unit.resolutionFailed = false;
      } catch (error) {
        if (wasResolutionFailing) {
          // Still the same ongoing failure as last sync (Angular's
          // `computed()` caches and rethrows until a dependency changes
          // again) — the fallback is already mounted; don't tear it down
          // and recreate it every sync.
          live.push(unit);
          return;
        }
        unit.resolutionFailed = true;
        const index = unit.ref ? this.viewContainerRef.indexOf(unit.ref.hostView) : -1;
        if (unit.ref) this.detach(unit);
        this.mountErrorFallback(
          unit,
          node,
          error,
          index >= 0 ? index : this.viewContainerRef.length
        );
        live.push(unit);
        return;
      }

      if (wasResolutionFailing) {
        // Recovered. `mountErrorFallback` only updates `componentType`, not
        // `attemptedComponentType` — so the gating below, comparing against
        // the customer's (pre-failure) class, would see "same resolution,
        // already attempted" and leave the stale fallback mounted forever.
        // Force it down so the normal creation path below runs clean.
        this.detach(unit);
        unit.attemptedComponentType = null;
      }

      this.reportDiagnostics(unit, resolution);

      if (resolution.mode === 'orphaned') {
        this.detach(unit);
        this.collect(resolution.nodes, unit.injector, `${key}/`, live, seen);
        return;
      }

      // Gate on `attemptedComponentType`, not `componentType`: a customer
      // component that threw is deliberately re-rendered as the error
      // fallback (a different class than `resolution.component`), and that
      // swap must not itself look like "the resolution changed" on the next
      // sync — that would tear the fallback down and retry the same failing
      // `createComponent` call forever. Only a genuine change in what
      // `resolveNode` resolved to (a registry swap, a node whose id changed)
      // should detach and retry.
      if (unit.attemptedComponentType !== resolution.component) {
        this.detach(unit);
        unit.attemptedComponentType = null;
      }

      if (!unit.ref) {
        unit.attemptedComponentType = resolution.component;
        this.createView(unit, node, resolution);
      }

      live.push(unit);
    });
  }

  /**
   * Reports every diagnostic in a fresh `resolution` computation exactly
   * once. `resolution.diagnostics` is a new array only when `resolveNode`
   * actually re-ran (a reference check, not a deep-equality one) —
   * `collect()` reads `unit.resolution()` on every sync, including syncs
   * where nothing about this node changed, and re-reporting on every read
   * would spam `ExperienceScope.diagnostics` with duplicates of the same
   * event.
   */
  private reportDiagnostics(unit: Unit, resolution: Resolution): void {
    if (resolution.diagnostics === unit.lastDiagnostics) return;
    unit.lastDiagnostics = resolution.diagnostics;
    for (const diagnostic of resolution.diagnostics) {
      this.experienceScope.reportDiagnostic(diagnostic);
    }
  }

  /**
   * Creates the view for a `render`-mode resolution. Wrapped in try/catch: a
   * customer component that throws while Angular constructs and first-checks
   * it (constructor, template evaluation, `ngOnInit`) must not take down its
   * siblings.
   *
   * This covers the SSR path with no separate SSR-specific code needed,
   * unlike the React and Svelte adapters: `@angular/platform-server` runs
   * this exact `createComponent` call, not a parallel server renderer, so a
   * synchronous creation-time throw is caught here identically in SSR and
   * CSR.
   *
   * A *later* throw — one that happens after creation succeeded, on a
   * subsequent sync rather than this one — is a different case, covered by
   * `collect()`'s own try/catch around `unit.resolution()`, not here. That
   * split matters: `resolution.bindable`'s `inputBinding` getters (built by
   * `bindings()` below) also call `unit.resolution()`, and it's tempting to
   * wrap *those* instead — but `resolution`'s only tracked dependencies
   * (`unit.node`, `experienceScope.config()`) are exclusively mutated from
   * inside `collect()` (`unit.node.set(...)`, and `checkConfig()`'s call into
   * `sync()`/`collect()`), so any throw from a genuine dependency change
   * always reaches `collect()`'s own read first — by the time Angular's CD
   * independently re-invokes a binding getter for that unit, the computed's
   * error is already cached and `collect()` has already handled it. A
   * `bindings()`-level catch would be unreachable dead code.
   *
   * What no fix here reaches: a throw inside the *customer* component's own
   * internals on a later change-detection pass (its own template expression,
   * computed, or lifecycle hook unrelated to our bindings) — that never
   * touches adapter code at all. A per-node `ErrorHandler` provider in
   * `unit.injector` doesn't help here either: `ApplicationRef.tick()`
   * resolves `ErrorHandler` once, from the *root* injector, at construction,
   * and never re-resolves it from whichever component's injector actually
   * threw — a per-node override in a child injector is structurally
   * unreachable from that catch. Documented gap; see the README's
   * error-handling section.
   */
  private createView(
    unit: Unit,
    node: PortableRenderNode,
    resolution: Extract<Resolution, { mode: 'render' }>
  ): void {
    try {
      unit.componentType = resolution.component;
      unit.ref = this.viewContainerRef.createComponent(resolution.component, {
        index: this.viewContainerRef.length,
        injector: unit.injector,
        bindings: this.bindings(unit, resolution.bindable),
      });
    } catch (error) {
      this.mountErrorFallback(unit, node, error, this.viewContainerRef.length);
    }
  }

  /**
   * Shared by `createView`'s creation-time catch and
   * `reportPostCreationFailure`'s later-pass catch: reports the diagnostic
   * and mounts the customer's `renderError` override (or the built-in
   * default) at `index`. The caller picks `index` — appending at the current
   * end for a brand-new unit, or the unit's own prior position when
   * replacing an already-mounted view — since this method has no way to
   * know which situation it's in.
   */
  private mountErrorFallback(
    unit: Unit,
    node: PortableRenderNode,
    error: unknown,
    index: number
  ): void {
    const { kind, id } = node.registration;
    const reason = error instanceof Error ? error.message : String(error);
    const message =
      `Component "${id}" (${kind}${node.nodeId ? `, node "${node.nodeId}"` : ''}) threw ` +
      `while rendering: ${reason}. Rendering the error fallback instead of crashing the ` +
      `surrounding tree.`;
    if (typeof console !== 'undefined') {
      console.warn(`[@contentful/experiences-angular] ${message}`);
    }
    this.experienceScope.reportDiagnostic(
      new Error(message, { cause: error instanceof Error ? error : undefined })
    );

    const renderError = this.experienceScope.renderError();
    const errorProps: Record<string, unknown> = {
      componentId: id,
      nodeId: node.nodeId,
      message: reason,
    };
    unit.componentType = renderError;
    unit.ref = this.viewContainerRef.createComponent(renderError, {
      index,
      injector: unit.injector,
      bindings: declaredOnly(renderError, ['componentId', 'nodeId', 'message']).map((key) =>
        inputBinding(key, () => errorProps[key])
      ),
    });
  }

  private createUnit(node: PortableRenderNode, parentInjector: Injector): Unit {
    const nodeSignal = signal(node);
    const design = computed(() => resolveDesign(nodeSignal(), this.experienceScope));
    const resolution = computed(() => resolveNode(nodeSignal(), this.experienceScope, design()));

    // Constructed and connected before `createComponent` runs, so an
    // unregistered node already exposes its payload to whatever renders in its
    // place. The scopes hold *getters*, so later `nodeSignal.set` calls flow
    // through without reconnecting.
    const designScope = new DesignScope();
    designScope.connect(() => design());
    const providers: StaticProvider[] = [{ provide: DesignScope, useValue: designScope }];

    // Never both: a component nested inside an experience template shadows
    // `ComponentScope` and `DesignScope` while leaving `ExperienceTemplateScope`
    // unshadowed, so the element-injector walk-up still reaches the enclosing
    // template's payload.
    if (node.registration.kind === 'experienceTemplate') {
      const templateScope = new ExperienceTemplateScope();
      templateScope.connect(() => toContentfulExperienceTemplate(nodeSignal()));
      providers.push({ provide: ExperienceTemplateScope, useValue: templateScope });
    } else {
      const componentScope = new ComponentScope();
      componentScope.connect(() => toContentfulComponent(nodeSignal()));
      providers.push({ provide: ComponentScope, useValue: componentScope });
    }

    return {
      node: nodeSignal,
      resolution,
      injector: Injector.create({ providers, parent: parentInjector }),
      parentInjector,
      ref: null,
      componentType: null,
      attemptedComponentType: null,
      lastDiagnostics: null,
      resolutionFailed: false,
    };
  }

  /**
   * Change-detection-integrated, unlike a one-shot `setInput` record: each
   * binding re-reads the merged props when the node, the active viewport or a
   * design token changes, and marks the (likely `OnPush`) customer component
   * dirty only when its own value did.
   */
  private bindings(unit: Unit, keys: readonly string[]): Binding[] {
    return keys.map((key) =>
      inputBinding(key, () => {
        const resolution = unit.resolution();
        return resolution.mode === 'render' ? resolution.props[key] : undefined;
      })
    );
  }

  private detach(unit: Unit): void {
    if (!unit.ref) return;
    const index = this.viewContainerRef.indexOf(unit.ref.hostView);
    if (index >= 0) this.viewContainerRef.remove(index);
    else unit.ref.destroy();
    unit.ref = null;
    unit.componentType = null;
  }
}
