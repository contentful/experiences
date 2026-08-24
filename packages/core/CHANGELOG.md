## 0.7.8 (2026-08-24)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.7.7 (2026-08-21)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.7.6 (2026-08-20)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.7.5 (2026-08-12)

### 🩹 Fixes

- **core,adapters:** render Experience Templates as ordinary nodes [AIS-413] ([#133](https://github.com/contentful/experiences/pull/133))

## 0.7.4 (2026-08-11)

### 🚀 Features

- stop sending the alpha-feature header manually ([#131](https://github.com/contentful/experiences/pull/131))

## 0.7.3 (2026-08-11)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.7.2 (2026-08-10)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.7.1 (2026-08-07)

### 🚀 Features

- server-side design pre-resolution against a fallback viewport [AIS-386] ([#119](https://github.com/contentful/experiences/pull/119))

## 0.7.0 (2026-08-07)

### 🩹 Fixes

- ⚠️  bump @contentful/experience-delivery to 1.0.0-dev.6 + migrate to renamed API [AIS-339] ([#120](https://github.com/contentful/experiences/pull/120))

### ⚠️  Breaking Changes

- bump @contentful/experience-delivery to 1.0.0-dev.6 + migrate to renamed API [AIS-339]  ([#120](https://github.com/contentful/experiences/pull/120))
  the public API uses the component / experienceTemplate vocabulary.
  - `registration.componentTypeId` -> `registration.componentId`
  - `plan.template` -> `plan.experienceTemplate`
  - `PortableTemplate` -> `PortableExperienceTemplate` (`templateId` ->
    `experienceTemplateId`)
  - `Config.templates` -> `Config.experienceTemplates`; `Templates` ->
    `ExperienceTemplates`
  - `defineTemplate` -> `defineExperienceTemplate`; `TemplateConfig` ->
    `ExperienceTemplateConfig`; `TemplateRegistration` ->
    `ExperienceTemplateRegistration`; `normalizeTemplateRegistration` ->
    `normalizeExperienceTemplateRegistration`
  - `useContentfulTemplate()` / `getContentfulTemplate()` ->
    `useContentfulExperienceTemplate()` / `getContentfulExperienceTemplate()`;
    `ContentfulTemplate` -> `ContentfulExperienceTemplate`
  - `MissingComponentProps.componentTypeId` -> `componentId`
  - Core payload types: `ComponentTypeNode`/`ComponentTypeRef` ->
    `ComponentNode`/`ComponentRef`; `TemplateNode`/`TemplateRef` ->
    `ExperienceTemplateNode`/`ExperienceTemplateRef`
  `packages/core` stays zero-dep, so its payload types are hand-mirrored from the
  delivery package rather than imported; each carries a doc comment naming its
  upstream counterpart, and `client:typecheck` catches drift when the delivery SDK
  regenerates. Documented in AGENTS.md.
  `examples/scripts/` is intentionally unchanged: it targets the management SDK
  (`contentful-management`), which has its own entity-type surface, and adopting it
  would require changing that dependency. The seed script therefore still
  provisions the shapes that SDK produces.
  Verified: build, typecheck, and 157 tests pass across all five packages.
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  * docs: describe current state only in comments and docs
  Drop ticket ids, tracker links, and before/after narrative from doc comments and
  prose so they explain what the code does now rather than how it got here.
  - `alpha-feature.ts`: state what the header selects and why it is required,
    without the two-shapes-in-transition framing or the removal timeline.
  - `core/src/types.ts`: keep each type's upstream counterpart in
    `@contentful/experience-delivery` (load-bearing for maintenance) but drop the
    "formerly known as" and old-link-type asides.
  - README: replace the rename migration table with a description of the
    alpha-feature header and when a caller needs to send it.
  - AGENTS.md: reframe the rationale entries that opened on prior designs to state
    the current design and its reason.
  - Drop stale option-shape asides ("was nested under ...") and a test name that
    described superseded behaviour.
  Generated CHANGELOG.md files are untouched — they are release history.
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  * feat!: migrate bootstrap fixture script to component/experienceTemplate entities
  contentful-management@12.14.0 exposes the renamed ExO entities (Component,
  ExperienceTemplate) alongside the deprecated ComponentType/Template ones. Adopt
  the renamed shapes throughout examples/scripts so a freshly bootstrapped demo
  Experience uses the same entity vocabulary the delivery-consuming packages now
  read.
  - Bump contentful-management to ^12.14.0 (existing dependency, version only —
    no new packages).
  - fixture/component-types.ts -> fixture/components.ts: ComponentTypeFixture ->
    ComponentFixture.
  - fixture/templates.ts -> fixture/experience-templates.ts:
    TemplateFixture -> ExperienceTemplateFixture, TemplateTreeNode ->
    ExperienceTemplateTreeNode.
  - fixture/types.ts, fixture/experience.ts: ExperienceFixture.templateId ->
    experienceTemplateId; node nodeType 'InlineFragment' ->
    'InlineExperienceFragment' with componentTypeId -> componentId, matching
    contentful-management's InlineExperienceFragmentNode.
  - fixture/data-assemblies.ts: dataAssemblyComponentTypeLinks ->
    dataAssemblyComponentLinks (componentTypeId -> componentId).
  - bootstrap-example.ts: cma.componentType -> cma.component,
    cma.template -> cma.experienceTemplate; sys.type 'ComponentType' ->
    'Component', 'Template' -> 'ExperienceTemplate'; resource-link types
    Contentful:ComponentType -> Contentful:Component and Contentful:Template ->
    Contentful:ExperienceTemplate; URN segments components/ and
    experienceTemplates/; seedComponentType -> seedComponent, seedTemplate ->
    seedExperienceTemplate, linkDataAssembliesToComponentTypes ->
    linkDataAssembliesToComponents.
  The metadata.annotations.Template composed/coded-implementation marker is
  unrelated to this rename (identical shape in 12.10.0 and 12.14.0) and is left
  untouched.
  Verified: examples/scripts typechecks clean; the main workspace's build,
  typecheck, and 157 tests are unaffected.
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

## 0.6.1 (2026-08-06)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.6.0 (2026-08-05)

### 🚀 Features

- ⚠️  replace isPreview with top-level debug mode [AIS-243] ([#98](https://github.com/contentful/experiences/pull/98))

### ⚠️  Breaking Changes

- replace isPreview with top-level debug mode [AIS-243]  ([#98](https://github.com/contentful/experiences/pull/98))
  `isPreview` is removed from the render context and the nested
  `context` option is gone. Pass `metadata` and `debug` as top-level options on
  `fetchExperience`/`resolveExperience` and as props on the renderers.
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  * refactor: derive metadata once in sveltekit apps
  Extract a single `metadata` object in the loaders and thread it through
  both fetchExperience and the renderer, instead of duplicating the
  `{ slug }` literal in +page.svelte. Addresses PR review feedback.
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  * refactor: mount DebugExperience above the tree and aggregate resolveData timing
  Move the auto-mounted <DebugExperience> panel above the rendered tree in
  both React and Svelte renderers (client + server) so the debug dump is
  visible without scrolling past the experience. Update the doc comments
  and README to match.
  Replace per-node resolveData timing lines with a single aggregate span
  over the whole fan-out — keeps the timing signal without emitting a log
  line per node, which gets noisy on large trees.
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

## 0.5.6 (2026-08-04)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.5.5 (2026-08-03)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.5.4 (2026-07-24)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.5.3 (2026-07-21)

### 🩹 Fixes

- render missing-component fallback as element in RSC [AIS-316] ([#79](https://github.com/contentful/experiences/pull/79))

## 0.5.2 (2026-07-20)

### 🩹 Fixes

- rename experiences-core to experiences-sdk-core [AIS-305] ([#76](https://github.com/contentful/experiences/pull/76))

## 0.5.1 (2026-07-17)

### 🚀 Features

- design-token resolution via resolveToken + useDesignValues [AIS-149] ([#53](https://github.com/contentful/experiences/pull/53))

## 0.5.0 (2026-07-17)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.4.0 (2026-07-08)

### 🚀 Features

- idiomatic adapters — bare components + context hooks ([0365bfb](https://github.com/contentful/experiences/commit/0365bfb))

## 0.3.0 (2026-06-24)

### 🚀 Features

- more-robust examples + simple/advanced README split + contentful prop ([#18](https://github.com/contentful/experiences/pull/18))

## 0.2.0 (2026-06-24)

This was a version bump only for core to align it with other projects, there were no code changes.

## 0.1.0 (2026-06-23)

### 🚀 Features

- initial Experiences SDK monorepo with React adapter [] ([#16](https://github.com/contentful/experiences/pull/16))