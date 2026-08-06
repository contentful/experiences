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