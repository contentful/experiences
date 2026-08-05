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

### 🧱 Updated Dependencies

- Updated client to 0.2.0
- Updated design to 0.6.0
- Updated core to 0.6.0

## 0.5.8 (2026-08-04)

### 🧱 Updated Dependencies

- Updated client to 0.1.8
- Updated design to 0.5.6
- Updated core to 0.5.6

## 0.5.7 (2026-08-03)

### 🧱 Updated Dependencies

- Updated client to 0.1.7
- Updated design to 0.5.5
- Updated core to 0.5.5

## 0.5.6 (2026-07-30)

### 🚀 Features

- export host constants [AIS-232] ([#97](https://github.com/contentful/experiences/pull/97), [#93](https://github.com/contentful/experiences/issues/93))

### 🧱 Updated Dependencies

- Updated client to 0.1.6

## 0.5.5 (2026-07-24)

### 🧱 Updated Dependencies

- Updated client to 0.1.5

## 0.5.4 (2026-07-24)

### 🧱 Updated Dependencies

- Updated client to 0.1.4
- Updated design to 0.5.4
- Updated core to 0.5.4

## 0.5.3 (2026-07-21)

### 🩹 Fixes

- render missing-component fallback as element in RSC [AIS-316] ([#79](https://github.com/contentful/experiences/pull/79))

### 🧱 Updated Dependencies

- Updated client to 0.1.3
- Updated design to 0.5.3
- Updated core to 0.5.3

## 0.5.2 (2026-07-20)

### 🩹 Fixes

- rename experiences-core to experiences-sdk-core [AIS-305] ([#76](https://github.com/contentful/experiences/pull/76))

### 🧱 Updated Dependencies

- Updated client to 0.1.2
- Updated design to 0.5.2
- Updated core to 0.5.2

## 0.5.1 (2026-07-17)

### 🚀 Features

- design-token resolution via resolveToken + useDesignValues [AIS-149] ([#53](https://github.com/contentful/experiences/pull/53))

### 🧱 Updated Dependencies

- Updated client to 0.1.1
- Updated design to 0.5.1
- Updated core to 0.5.1

## 0.5.0 (2026-07-17)

### 🚀 Features

- add packages/client with fetchExperience and delivery client [AIS-147] ([#30](https://github.com/contentful/experiences/pull/30), [#27](https://github.com/contentful/experiences/issues/27))

### 🧱 Updated Dependencies

- Updated client to 0.1.0
- Updated design to 0.5.0
- Updated core to 0.5.0

## 0.4.0 (2026-07-08)

### 🚀 Features

- idiomatic adapters — bare components + context hooks ([0365bfb](https://github.com/contentful/experiences/commit/0365bfb))

### 🧱 Updated Dependencies

- Updated design to 0.4.0
- Updated core to 0.4.0

## 0.3.0 (2026-06-24)

### 🚀 Features

- more-robust examples + simple/advanced README split + contentful prop ([#18](https://github.com/contentful/experiences/pull/18))

### 🧱 Updated Dependencies

- Updated design to 0.3.0
- Updated core to 0.3.0

## 0.2.0 (2026-06-24)

### 🧱 Updated Dependencies

- Updated design to 0.2.0
- Updated core to 0.2.0

## 0.1.2 (2026-06-24)

### 🧱 Updated Dependencies

- Updated design to 0.1.2

## 0.1.1 (2026-06-23)

### 🧱 Updated Dependencies

- Updated design to 0.1.1

## 0.1.0 (2026-06-23)

### 🚀 Features

- initial Experiences SDK monorepo with React adapter [] ([#16](https://github.com/contentful/experiences/pull/16))

### 🧱 Updated Dependencies

- Updated design to 0.1.0
- Updated core to 0.1.0