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