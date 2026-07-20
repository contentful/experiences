# @contentful/experiences-sdk-core

> ⚠️ **Internal package.** Customers do not install this directly. The framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports everything customers need.

Runtime-neutral primitives shared across all framework adapters.

## What lives here

- **Types** — `PortableRenderPlan`, `PortableRenderNode`, `PortableTemplate`, `ExperiencePayload`, `ExperienceNode`, the discriminated `DesignPropValue` union (`ManualDesignValue` / `DesignToken` / `ValuesByViewport`), `ViewportDef`, `ExperienceContext`, `ResolveContext`.
- **`resolveExperience(payload, config, opts)`** — single async entry that walks an XDA payload, classifies content vs. design properties, captures slots, runs any component-declared `resolveData` hooks in parallel, and emits a runtime-neutral `PortableRenderPlan` ready for any framework adapter to render.

## Why a separate package?

Future Angular, Svelte, Vue, SwiftUI, and Compose adapters consume the same plan. Sharing core means each adapter has zero plan-building or prop-classification logic to duplicate — the seam is the `PortableRenderPlan` contract.

See [`../../AGENTS.md`](../../AGENTS.md) for the full architecture and design decisions.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
