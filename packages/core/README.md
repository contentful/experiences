# @contentful/experiences-sdk-core

> ⚠️ **Internal package.** You don't install this directly — the framework adapter (e.g. [`@contentful/experiences-react`](../adapter-react/)) re-exports everything you need.

Dependency-free, runtime-neutral primitives shared across all framework
adapters. This package has no runtime dependencies.

## What lives here

- **Types** — `PortableRenderPlan`, `PortableRenderNode`, `PortableRegistration`, `ExperiencePayload`, `ExperienceNode`, the discriminated `DesignPropValue` union (`ManualDesignValue` / `DesignToken`), `ExperienceContext`, `ResolveContext`.
- **`resolveExperience(payload, config, opts)`** — single async entry that walks an XDA payload, classifies content vs. design properties, resolves design values and tokens, captures slots, runs any component-declared `resolveData` hooks in parallel, and emits a runtime-neutral `PortableRenderPlan` ready for any framework adapter to render. Every node in the payload becomes a `PortableRenderNode`; `registration.kind` records whether the adapter should resolve its id against `config.components` or `config.experienceTemplates`. A coded Experience Template is an ordinary node — `payload.sys.experienceTemplate` is never read.
- **Diagnostics and design support** — `createDebugLogger`, `resolveDesignProperties`, and `applyTokenResolver`.

Delivery transport belongs to Client and event construction belongs to Runtime,
keeping this package usable in any runtime without pulling in a delivery client
or framework.

## Delivery diagnostics

`resolveExperience` projects recognized `payload.errors` into the optional
`plan.deliveryDiagnostics: readonly ExperienceDeliveryDiagnostic[]`. Each fresh
record contains only readonly string `fieldPath` and `message`; input order is
preserved, and `originalError`, extra fields, and input references are omitted.
Missing, non-array, or unrecognized errors leave the field absent. The same
normalization serves raw resolve calls and the existing Client/Runtime/leaf fetch
paths, including destinations; Core imports no generated Delivery types.

These are upstream field-resolution diagnostics, distinct from the existing
local `plan.diagnostics: Error[]`. They preserve renderable content and serialize
as ordinary records. The projection is intentionally partial: absence never
certifies personalization success or the absence of all upstream errors.
Upstream strings may contain private information. Prefer a generic visitor
warning/count, inspect fields explicitly for diagnosis, and exclude them from
public bootstrap/handoff payloads and logs. The whitelist is not a privacy filter.

## Why a separate package?

Future Angular, Svelte, Vue, SwiftUI, and Compose adapters consume the same plan. Sharing core means each adapter has zero plan-building or prop-classification logic to duplicate — the seam is the `PortableRenderPlan` contract.

See [`../../AGENTS.md`](../../AGENTS.md) for the full architecture and design decisions.

## License

MIT. See the repository [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE) for full attribution.
