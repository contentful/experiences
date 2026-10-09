## 0.6.2 (2026-10-09)

### 🧱 Updated Dependencies

- Updated client to 0.9.2
- Updated core to 0.12.1

## 0.6.1 (2026-10-08)

### 🧱 Updated Dependencies

- Updated client to 0.9.1

## 0.6.0 (2026-10-08)

### 🚀 Features

- ⚠️  remove sdk viewport surface [SPA-5275] ([#220](https://github.com/contentful/experiences/pull/220))

### ⚠️  Breaking Changes

- remove sdk viewport surface [SPA-5275]  ([#220](https://github.com/contentful/experiences/pull/220))
  The SDK no longer exposes viewport definitions, viewport-aware design-value resolution, or active-viewport hooks. Use CSS media queries or application-owned matchMedia integration for responsive behavior. Delivered design property values are now flat and require no migration."
  M	AGENTS.md
  M	ARCHITECTURE.md
  M	CONTRIBUTING.md
  M	README.md
  M	catalog-info.yaml
  M	examples/angular/README.md
  M	examples/angular/src/app/components/heading.component.ts
  D	examples/angular/src/app/lib/detect-viewport.ts
  M	examples/angular/src/app/lib/experience-config.ts
  M	examples/angular/src/app/lib/experience-route-data.ts
  M	examples/angular/src/app/pages/experience-page.component.ts
  M	examples/angular/src/server.ts
  M	examples/nextjs/README.md
  M	examples/nextjs/app/[slug]/page.tsx
  M	examples/nextjs/components/Heading.tsx
  M	examples/nextjs/components/LivePreviewExperience.tsx
  M	examples/nextjs/components/Section.tsx
  D	examples/nextjs/lib/detect-viewport.ts
  M	examples/nextjs/lib/experience-config.tsx
  M	examples/scripts/bootstrap-example.ts
  M	examples/scripts/fixture/experience.ts
  M	examples/scripts/fixture/types.ts
  M	examples/sveltekit/README.md
  M	examples/sveltekit/src/lib/components/Heading.svelte
  D	examples/sveltekit/src/lib/detect-viewport.ts
  M	examples/sveltekit/src/lib/experience-config.ts
  M	examples/sveltekit/src/routes/[slug]/+page.server.ts
  M	examples/sveltekit/src/routes/[slug]/+page.svelte
  M	examples/sveltekit/vite.config.ts
  M	package-lock.json
  M	packages/adapter-angular/README.md
  M	packages/adapter-angular/src/client-experience-renderer.component.ts
  M	packages/adapter-angular/src/context.ts
  M	packages/adapter-angular/src/debug-experience.test.ts
  M	packages/adapter-angular/src/debug-panel-coverage.ssr.test.ts
  M	packages/adapter-angular/src/debug-panel-coverage.test.ts
  M	packages/adapter-angular/src/dom-parity.test.ts
  M	packages/adapter-angular/src/experience-defaults.ts
  M	packages/adapter-angular/src/experience-scope.ts
  M	packages/adapter-angular/src/index.ts
  D	packages/adapter-angular/src/inject-active-viewport.ts
  M	packages/adapter-angular/src/inject-design-values.ts
  M	packages/adapter-angular/src/inject-experience-plan.ts
  M	packages/adapter-angular/src/live-preview-experience.ssr.test.ts
  M	packages/adapter-angular/src/live-preview-experience.test.ts
  M	packages/adapter-angular/src/node-render-engine.test.ts
  M	packages/adapter-angular/src/node-render-engine.ts
  M	packages/adapter-angular/src/node-scopes.ts
  M	packages/adapter-angular/src/nodes-renderer.ssr.test.ts
  M	packages/adapter-angular/src/server-experience-renderer.component.ts
  M	packages/adapter-angular/src/server-renderer.test.ts
  M	packages/adapter-angular/src/test-fixtures/render-harness.ts
  M	packages/adapter-angular/src/types.ts
  M	packages/adapter-react/README.md
  M	packages/adapter-react/src/client-renderer.tsx
  M	packages/adapter-react/src/context.tsx
  M	packages/adapter-react/src/debug-experience.test.tsx
  M	packages/adapter-react/src/debug-experience.tsx
  M	packages/adapter-react/src/debug-panel-coverage.test.tsx
  M	packages/adapter-react/src/index.ts
  M	packages/adapter-react/src/nodes-renderer.ssr.test.tsx
  M	packages/adapter-react/src/nodes-renderer.test.tsx
  M	packages/adapter-react/src/nodes-renderer.tsx
  M	packages/adapter-react/src/server-renderer.test.tsx
  M	packages/adapter-react/src/server-renderer.tsx
  M	packages/adapter-react/src/types.ts
  D	packages/adapter-react/src/use-active-viewport.ts
  M	packages/adapter-react/src/use-design-values.tsx
  M	packages/adapter-react/src/use-experience-plan.test.tsx
  M	packages/adapter-react/src/use-experience-plan.ts
  M	packages/adapter-react/src/use-live-preview-experience.test.tsx
  M	packages/adapter-react/src/use-live-preview.test.tsx
  M	packages/adapter-svelte/README.md
  M	packages/adapter-svelte/src/ClientExperienceRenderer.svelte
  M	packages/adapter-svelte/src/DebugExperience.svelte
  M	packages/adapter-svelte/src/DebugExperience.test.ts
  M	packages/adapter-svelte/src/NodeRenderer.svelte
  M	packages/adapter-svelte/src/NodeRenderer.test.ts
  M	packages/adapter-svelte/src/NodesRenderer.svelte
  M	packages/adapter-svelte/src/ServerExperienceRenderer.svelte
  M	packages/adapter-svelte/src/component-props.ts
  M	packages/adapter-svelte/src/context.ts
  M	packages/adapter-svelte/src/debug-panel-coverage.ssr.test.ts
  M	packages/adapter-svelte/src/debug-panel-coverage.test.ts
  M	packages/adapter-svelte/src/get-design-values.ts
  M	packages/adapter-svelte/src/index.ts
  M	packages/adapter-svelte/src/nodes-renderer.ssr.test.ts
  M	packages/adapter-svelte/src/server-renderer.test.ts
  M	packages/adapter-svelte/src/types.ts
  D	packages/adapter-svelte/src/use-active-viewport.svelte.ts
  M	packages/adapter-svelte/src/use-experience-plan.test.ts
  M	packages/adapter-svelte/src/use-live-preview-experience.test.ts
  M	packages/adapter-svelte/src/use-live-preview.test.ts
  M	packages/client/src/contentful-experiences.test.ts
  M	packages/client/src/contentful-experiences.ts
  M	packages/client/src/fetch-experience.test.ts
  M	packages/client/src/fetch-experience.ts
  M	packages/core/README.md
  A	packages/core/src/design-properties.test.ts
  A	packages/core/src/design-properties.ts
  M	packages/core/src/index.ts
  M	packages/core/src/resolve-experience.test.ts
  M	packages/core/src/resolve-experience.ts
  M	packages/core/src/types.ts
  D	packages/core/src/viewport.test.ts
  D	packages/core/src/viewport.ts
  M	packages/design/README.md
  M	packages/design/package.json
  M	packages/design/src/index.ts
  D	packages/design/src/media-query-matchers.ts
  D	packages/design/src/select-resolved-design.ts
  D	packages/design/src/viewport.test.ts
  D	packages/design/src/viewport.ts
  M	packages/live-preview/README.md
  M	packages/live-preview/src/experience-payload.ts
  M	packages/live-preview/src/fetch-preview-session.test.ts
  M	packages/live-preview/src/fetch-preview-session.ts
  M	packages/live-preview/src/live-preview-client.test.ts
  M	packages/node/README.md
  M	packages/node/src/contentful-experiences.test.ts
  M	packages/node/src/contentful-experiences.ts
  M	packages/web/README.md
  M	packages/web/src/contentful-experiences.test.ts

### 🧱 Updated Dependencies

- Updated client to 0.9.0
- Updated core to 0.12.0

## 0.5.0 (2026-10-06)

### 🧱 Updated Dependencies

- Updated client to 0.8.0
- Updated core to 0.11.0

## 0.4.1 (2026-10-01)

### 🧱 Updated Dependencies

- Updated client to 0.7.1
- Updated core to 0.10.1

## 0.4.0 (2026-09-30)

### 🧱 Updated Dependencies

- Updated client to 0.7.0

## 0.3.0 (2026-09-30)

### 🧱 Updated Dependencies

- Updated client to 0.6.0
- Updated core to 0.10.0

## 0.2.2 (2026-09-29)

### 🧱 Updated Dependencies

- Updated client to 0.5.2
- Updated core to 0.9.2

## 0.2.1 (2026-09-29)

### 🧱 Updated Dependencies

- Updated client to 0.5.1
- Updated core to 0.9.1

## 0.2.0 (2026-09-28)

### 🧱 Updated Dependencies

- Updated client to 0.5.0
- Updated core to 0.9.0

## 0.1.9 (2026-09-28)

### 🧱 Updated Dependencies

- Updated client to 0.4.9
- Updated core to 0.8.7

## 0.1.8 (2026-09-22)

### 🧱 Updated Dependencies

- Updated client to 0.4.8

## 0.1.7 (2026-09-22)

### 🧱 Updated Dependencies

- Updated client to 0.4.7
- Updated core to 0.8.6

## 0.1.6 (2026-09-22)

### 🩹 Fixes

- **live-preview:** accept payloads without viewports [SPA-5272] ([6db6fa7](https://github.com/contentful/experiences/commit/6db6fa7))

### 🧱 Updated Dependencies

- Updated client to 0.4.6
- Updated core to 0.8.5

## 0.1.5 (2026-09-22)

### 🚀 Features

- **live-preview:** expose connection errors [SPA-5151] ([#198](https://github.com/contentful/experiences/pull/198))

## 0.1.4 (2026-09-21)

### 🧱 Updated Dependencies

- Updated client to 0.4.5
- Updated core to 0.8.4

## 0.1.3 (2026-09-21)

### 🧱 Updated Dependencies

- Updated client to 0.4.4

## 0.1.2 (2026-09-18)

### 🚀 Features

- **live-preview:** support resource resolution [SPA-5369] ([#193](https://github.com/contentful/experiences/pull/193))

## 0.1.1 (2026-09-11)

### 🚀 Features

- **live-preview:** expose preview status helper [SPA-5289] ([#170](https://github.com/contentful/experiences/pull/170))

### 🧱 Updated Dependencies

- Updated core to 0.8.3

## 0.1.0 (2026-09-10)

### 🚀 Features

- **live-preview:** add live preview client [SPA-5151] ([#157](https://github.com/contentful/experiences/pull/157))

### 🧱 Updated Dependencies

- Updated core to 0.8.2