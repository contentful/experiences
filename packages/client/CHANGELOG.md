## 0.3.10 (2026-08-27)

### 🧱 Updated Dependencies

- Updated core to 0.7.10

## 0.3.9 (2026-08-26)

### 🧱 Updated Dependencies

- Updated core to 0.7.9

## 0.3.8 (2026-08-24)

### 🧱 Updated Dependencies

- Updated core to 0.7.8

## 0.3.7 (2026-08-21)

### 🧱 Updated Dependencies

- Updated core to 0.7.7

## 0.3.6 (2026-08-20)

### 🧱 Updated Dependencies

- Updated core to 0.7.6

## 0.3.5 (2026-08-12)

### 🧱 Updated Dependencies

- Updated core to 0.7.5

## 0.3.4 (2026-08-11)

### 🚀 Features

- stop sending the alpha-feature header manually ([#131](https://github.com/contentful/experiences/pull/131))

### 🧱 Updated Dependencies

- Updated core to 0.7.4

## 0.3.3 (2026-08-11)

### 🩹 Fixes

- **deps:** update dependency @contentful/experience-delivery to v1.0.0-dev.7 ([#130](https://github.com/contentful/experiences/pull/130))

### 🧱 Updated Dependencies

- Updated core to 0.7.3

## 0.3.2 (2026-08-10)

### 🧱 Updated Dependencies

- Updated core to 0.7.2

## 0.3.1 (2026-08-07)

### 🚀 Features

- server-side design pre-resolution against a fallback viewport [AIS-386] ([#119](https://github.com/contentful/experiences/pull/119))

### 🧱 Updated Dependencies

- Updated core to 0.7.1

## 0.3.0 (2026-08-07)

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

### 🧱 Updated Dependencies

- Updated core to 0.7.0

## 0.2.1 (2026-08-06)

### 🧱 Updated Dependencies

- Updated core to 0.6.1

## 0.2.0 (2026-08-05)

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

### 🧱 Updated Dependencies

- Updated core to 0.6.0

## 0.1.8 (2026-08-04)

### 🧱 Updated Dependencies

- Updated core to 0.5.6

## 0.1.7 (2026-08-03)

### 🧱 Updated Dependencies

- Updated core to 0.5.5

## 0.1.6 (2026-07-30)

### 🚀 Features

- export host constants [AIS-232] ([#97](https://github.com/contentful/experiences/pull/97), [#93](https://github.com/contentful/experiences/issues/93))

## 0.1.5 (2026-07-24)

### 🚀 Features

- add preview toggle to fetchExperience with dual-token client options [AIS-233] ([#93](https://github.com/contentful/experiences/pull/93))

## 0.1.4 (2026-07-24)

### 🧱 Updated Dependencies

- Updated core to 0.5.4

## 0.1.3 (2026-07-21)

### 🩹 Fixes

- render missing-component fallback as element in RSC [AIS-316] ([#79](https://github.com/contentful/experiences/pull/79))

### 🧱 Updated Dependencies

- Updated core to 0.5.3

## 0.1.2 (2026-07-20)

### 🩹 Fixes

- rename experiences-core to experiences-sdk-core [AIS-305] ([#76](https://github.com/contentful/experiences/pull/76))

### 🧱 Updated Dependencies

- Updated core to 0.5.2

## 0.1.1 (2026-07-17)

### 🧱 Updated Dependencies

- Updated core to 0.5.1

## 0.1.0 (2026-07-17)

### 🚀 Features

- add packages/client with fetchExperience and delivery client [AIS-147] ([#30](https://github.com/contentful/experiences/pull/30), [#27](https://github.com/contentful/experiences/issues/27))

### 🧱 Updated Dependencies

- Updated core to 0.5.0