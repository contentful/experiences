# Independent per-package versioning with Nx Release

- **Date:** 2026-08-25
- **Status:** Accepted — in effect since [`ab6e215`](https://github.com/contentful/experiences/commit/ab6e21597e1b5c304802595d9d0d87c9faf88370) (2026-07-17), amended by [`9dc5c2f`](https://github.com/contentful/experiences/commit/9dc5c2f16096769b4563d506a6f82a9cf6bd75c5) (2026-08-24)

> This record was written on 2026-08-25 by reading `nx.json`, the release
> workflows, and the commit history. It documents a decision the workspace had
> already made rather than a new one. Where the commits do not state a
> rationale, this record says what is true and stops rather than inventing one.

## Context

`packages/` holds six libraries that ship on very different clocks. At the time
of writing their versions were `core` 0.7.8, `design` 0.7.8, `client` 0.3.8,
`adapter-react` 0.7.9, `adapter-svelte` 0.5.9, and `adapter-angular` 0.0.3 — a
spread from a package on its third patch to packages nearing 0.8. A customer
installs exactly one of the six — the framework adapter for their stack; the
three non-adapter packages are workspace-internal.

The whole suite is pre-1.0 and explicitly unstable, which the README states up
front. During that phase the SDK needs a way to ship breaking changes
continuously without the version number claiming stability it does not have, and
a way to publish work-in-progress builds that consumers can opt into without
those builds reaching anyone who installed `latest`.

`ab6e215` ("keep nx release, add prerelease flow for dev branch") is the commit
where this configuration was settled. Its subject records that Nx Release was
re-affirmed rather than newly adopted; the commit does not name what it was
weighed against, and this record does not guess.

## Decision

Release is driven entirely by `nx release`, configured in `nx.json#release`:

1. **Independent versions.** `projects: ["packages/*"]` with
   `projectsRelationship: "independent"`. Each package gets its own version,
   changelog (`{projectRoot}/CHANGELOG.md`), git tag, and GitHub Release. Tags
   follow `releaseTag.pattern` `{projectName}@{version}` — the Nx project name,
   not the npm name, so the tag for `@contentful/experiences-design` is
   `design@0.7.8`.

2. **Versions derived from commit messages.** `version.conventionalCommits: true`.
   A package bumps when a `feat:` or `fix:` commit touched its directory.
   `.husky/commit-msg` + `commitlint.config.js` gate the message format locally.

3. **Bumps capped below 1.0.** `version.adjustSemverBumpsForZeroMajorVersion: true`
   applies zero-major semantics while packages are on 0.x: `feat!` /
   `BREAKING CHANGE:` produce a minor bump, `feat:` a patch bump. No commit type
   can push a package to `1.0.0`.

4. **Internal dependency ranges rewritten on release.**
   `version.updateDependents: "auto"` with
   `version.preserveMatchingDependencyRanges: false`. When `core` bumps, every
   package that depends on it is bumped too and its manifest is rewritten to the
   new exact version. This is why `packages/design/package.json` reads
   `"@contentful/experiences-sdk-core": "0.7.8"` rather than a caret range —
   those pins are generated, not hand-maintained.

5. **Two publish channels, one config.** `main` runs
   `npx nx release --yes` (`.github/workflows/release.yaml`) and publishes to the
   `latest` dist-tag. `dev` runs
   `npx nx release --specifier prerelease --preid dev --skip-publish` followed by
   `npx nx release publish --tag dev` (`.github/workflows/prerelease.yaml`),
   producing `X.Y.Z-dev.N` on the `dev` dist-tag. `releaseTag.strictPreid: true`
   makes the stable computation on `main` skip preid-suffixed tags, so a dev tag
   cannot influence a stable version.

`9dc5c2f` amended the shape of item 5 rather than the decision: Nx 23 removed the
flat `releaseTagPattern` / `releaseTagPatternStrictPreid` keys, so the same two
settings moved into the nested `releaseTag` object. That migration commit is a
`fix:` because the removed keys had broken `nx release` in CI after the Nx
v22 → v23 bump.

## Consequences

**A single misconfigured package fails the whole release.** `nx release` iterates
every project matched by `packages/*` in one run. A package with no prior tag has
no baseline to compute from, so a newly added package must be seeded with a
`<projectName>@0.0.0` tag on `main` before it merges. AGENTS.md carries the
procedure and the recovery steps under "Bootstrapping a new package for release".

**Version bumps fan out.** Because `updateDependents` is `auto`, a `fix:` in
`core` releases new versions of `design`, `client`, and all three adapters. The
changelogs of the dependent packages will contain release entries with no
behavioural change of their own.

**The published artifact must come from the project root.** The release job
restores `packages/*/dist` from the build cache and does not rebuild after
`nx release` bumps the version. Any build tool that emits its own
`dist/package.json` would therefore publish the pre-bump version. This is the
stated reason `packages/adapter-angular` builds with `ngc` rather than
`ng-packagr` — see the comment at the top of
`packages/adapter-angular/tsconfig.lib.json`.

**`dev` is not mergeable into `main`.** Both branches accumulate their own
CHANGELOG entries, so merging `dev` would import prerelease history into `main`'s
changelogs. Work that should ship on both lands on each independently. The
header comment in `.github/workflows/prerelease.yaml` states this.

**Removing the 0.x cap is a deliberate, separate step.** Shipping 1.0.0 means
deleting `adjustSemverBumpsForZeroMajorVersion` from `nx.json`; until then, no
commit can produce a 1.x version by accident.

**Config keys track the Nx major.** The release config is Nx-version-specific
(`9dc5c2f` is the evidence). An Nx major bump should be treated as touching the
release path, and `npx nx release --dry-run` is the cheap check.

## References

- `nx.json` — `release` block
- `.github/workflows/release.yaml`, `.github/workflows/prerelease.yaml`
- `ab6e215` — configuration settled, prerelease channel added
- `9dc5c2f` — `releaseTag` migration for Nx 23
- `packages/adapter-angular/tsconfig.lib.json` — publish-from-root constraint
- [AGENTS.md](../../AGENTS.md) — "Cut a release", "Bootstrapping a new package for release"
