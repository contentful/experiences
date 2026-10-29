# Contributing to the Contentful Experiences SDK

Thank you for your interest in contributing! This SDK renders Contentful Experience Orchestration (ExO) payloads against your own design-system components. Contributions from the community are welcome and appreciated.

> ⚠️ This project is **alpha** and actively published to npm. Public APIs are unstable and will change. If you're building something on top of the SDK, expect breaking changes between commits.

## 🤝 How to contribute

There are several ways to help:

- **Report bugs** — Open a [bug report](https://github.com/contentful/experiences/issues/new?template=bug_report.md). Please only file bugs that affect other users of the project. For issues that might be specific to your setup or contain sensitive information, [visit our support center](https://support.contentful.com/hc/en-us) first.
- **Suggest features** — Share ideas by opening a [feature request](https://github.com/contentful/experiences/issues/new?template=feature_request.md).
- **Submit a pull request** — For docs and small fixes, open a PR directly. For larger changes, please open a feature request first so we can discuss the approach before you invest time in it.

## 📋 Before you start

1. Read the [README](./README.md) and [`AGENTS.md`](./AGENTS.md) — the latter is the operating manual, covering architecture, package boundaries, and the design decisions behind them.
2. Browse existing [issues](https://github.com/contentful/experiences/issues) and [pull requests](https://github.com/contentful/experiences/pulls) to avoid duplicating work.
3. Review our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## 🛠️ Development setup

### Prerequisites

- Node.js >= 22.12
- npm (the repo uses npm workspaces — don't substitute another package manager)

### About Nx

This is an [Nx](https://nx.dev/) monorepo. Nx gives you caching and task orchestration across packages, so `npm run build`, `npm test`, etc. only re-run work that actually changed. A few helpful commands:

```sh
npx nx graph                          # visualize package dependencies
npx nx run-many -t test --projects=adapter-react   # run one package's tests
npx nx show project adapter-react     # see a project's available targets
```

### Setup steps

1. **Fork and clone**

   ```sh
   git clone https://github.com/<your-username>/experiences.git
   cd experiences
   ```

2. **Install dependencies** (installs the whole workspace)

   ```sh
   npm install
   ```

3. **Build all packages**

   ```sh
   npm run build
   ```

4. **Run the tests**

   ```sh
   npm test
   ```

### Running an example app

The `examples/` directory has Next.js, SvelteKit, Angular, and Astro apps that render live XDA payloads — the fastest way to see a change end to end. They read the demo Experience that [`examples/scripts`](./examples/scripts) seeds into your space; run its bootstrap once first.

```sh
cd examples/nextjs
cp .env.example .env.local   # fill in SPACE_ID + CDA_TOKEN
npm run dev                  # http://localhost:3000/<experience-id>
```

`examples/sveltekit`, `examples/angular`, and `examples/astro` mirror it, registering the same components against the same payload. `examples/node` is a framework-neutral server that shows the identity cookie handoff between the Web SDK and the Node SDK. Each has its own README for the setup.

## 🏗️ Repository layout

```
packages/
├── core/            # @contentful/experiences-sdk-core   — runtime-neutral types + resolveExperience
├── design/          # @contentful/experiences-design — CSS-property helpers for adapter `toCss` utilities
├── client/          # @contentful/experiences-client — shared runtime + delivery integration
├── node/            # @contentful/experiences-node — request-scoped Node runtime
├── web/             # @contentful/experiences-web — stateful browser runtime
├── live-preview/    # @contentful/experiences-live-preview (optional customer-facing Preview Session source for any framework)
├── adapter-react/   # @contentful/experiences-react  — React renderer (customer-facing)
├── adapter-svelte/  # @contentful/experiences-svelte — Svelte renderer (customer-facing)
└── adapter-angular/ # @contentful/experiences-angular — Angular renderer (customer-facing)
examples/            # Example apps (customer-facing)
├── nextjs/          # Next.js 15 example app
├── sveltekit/       # SvelteKit 2 example app
├── angular/         # Angular 20 + @angular/ssr example app
├── astro/           # Astro 7 custom-renderer example app
├── node/            # node:http identity-cookie example (no renderer)
└── scripts/         # One-time bootstrap that seeds the demo Experience
implementations/     # Reference implementations (maintainer-facing)
├── node-sdk/        # Express/EJS on the packed Node SDK
├── web-sdk/         # Vanilla browser app on the packed Web SDK UMD build
└── node-sdk+web-sdk/ # Express/EJS SSR handing off to the Web SDK in the browser
```

Package boundaries matter — see the "Conventions" section of [`AGENTS.md`](./AGENTS.md) before moving code between packages. In short: `core` stays free of framework and delivery-client dependencies, and only `client` may import `@contentful/experience-delivery`.

## Example apps vs. reference implementations

The repo has two kinds of runnable apps. They look alike but serve different audiences, so keep them apart.

|                        | `examples/` — example apps                                                                | `implementations/` — reference implementations                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Audience**           | Customers integrating the SDK                                                             | SDK maintainers validating SDK behavior                                                                                                   |
| **Purpose**            | Show how to integrate the SDK in a given framework; the "clone + bootstrap + run" surface | Exercise the packages as they will be published, modeled on Optimization's reference implementations                                      |
| **SDK dependency**     | Workspace packages by symlink (npm workspaces)                                            | Locally packed tarballs from `pkgs/`; outside npm workspaces                                                                              |
| **Nx and root checks** | Ignored by Nx (`.nxignore`); run from each app's directory                                | Nx projects tagged `scope:implementation`; excluded from root `build`/`test`/`lint`/`typecheck`, prepared and checked by the CI Build job |
| **Linked from**        | README and package READMEs                                                                | This file, `AGENTS.md`, and maintainer docs only                                                                                          |

Use an example app to see a change render end to end, or when the change affects how customers integrate. Keep the four framework apps at parity with one another. Use a reference implementation to check that a change survives packing and installation, or to validate runtime behavior (profiles, consent, events) outside a framework adapter. Customer-facing docs, including package READMEs that ship to npm, link only to `examples/`.

### Local npm artifacts

Build and pack the SDK packages for use by standalone reference implementations:

```sh
npm run build:pkgs                   # all publishable packages under packages/*
npm run pack:pkgs                    # same pipeline; reuses valid Nx build caches
npx nx run node:pack                 # optional: only Node and its local dependencies
```

`build:pkgs` is the counterpart to Optimization's suite-wide build-and-pack
workflow. The per-project `node:pack` command is an additional Nx convenience:
it prepares only Core, Client, Runtime, and Node, using the same pack tasks and
archive format as the suite-wide command. It does not install or start the Node
reference implementation.

Nx builds dependencies first and runs the existing release-artifact checks for
Runtime, Node, and Web before packing them. Packing is uncached and writes to the
ignored `pkgs/` directory: each package has its npm-generated versioned filename
and a stable alias such as `contentful-experiences-node-local.tgz`. Each task
replaces only its own archives; older versioned files can remain in `pkgs/`.
The stable alias is replaced only after a complete archive passes entry-point
checks; failures stop the command.

The helper runs `npm pack` against each package's publication files and checks
that its exported entry points are included. It preserves package manifests,
including dependency ranges, scripts, and devDependencies, so local artifacts
exercise the same metadata as publication. Lifecycle scripts are disabled during
packing; Nx performs the required builds explicitly. These commands do not change
versions, publish to a registry, or install a reference implementation.

Run the packaging helper's checks with `npx nx test package-tools` and
`npx nx lint package-tools`. They also participate in the root test/lint commands.

### Running reference implementations

After SDK changes, refresh all standalone reference implementations together:

```sh
npm run implementation:install
```

This runs each implementation's existing `setup` target: build and pack its SDK
dependency chain, reinstall its local packages, and build browser assets where
applicable. It preserves existing app-local `.env` files and does not start apps.
Stop running reference apps with their scoped `serve:stop` targets before this
dependency refresh, then relaunch them with `serve` or `dev`. Focused per-app
`setup` targets remain available. The CI Build job prepares all implementations
and runs their lint/typecheck targets after the SDK build.

The [standalone Node reference implementation](./implementations/node-sdk/README.md)
uses these artifacts with its own dependencies and `.env`. Prepare it with
`npx nx run implementation-node-sdk:setup`, then run
`npx nx run implementation-node-sdk:dev`. Root aggregate checks exclude
implementations; their README documents the explicit Nx commands.

The [standalone Web reference implementation](./implementations/web-sdk/README.md)
uses the packed Web UMD distribution with browser-owned state and direct live
delivery. Run `npx nx run implementation-web-sdk:setup`, then
`npx nx run implementation-web-sdk:dev`. Its README covers local environment
configuration, consent, interaction tracking, and scoped validation commands.

The [standalone Node + Web reference implementation](./implementations/node-sdk+web-sdk/README.md)
renders initial Experience content through Express/EJS, adopts final server profile
state in the browser, and supports Web SDK navigation and interactions. Run
`npx nx run implementation-node-sdk-web-sdk:setup`, then
`npx nx run implementation-node-sdk-web-sdk:dev`. Its README distinguishes consumer
integration from demo UI and optional browser-attempt diagnostics.

Root PM2 shortcuts match Optimization: `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`. The `all` commands affect
every process in the selected PM2 home. Use the implementation's scoped stop
target when managing only one reference app.

## ✅ Submitting changes

1. **Create a branch**

   ```sh
   git checkout -b feat/your-feature
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes**, adding or updating tests alongside the source (`src/*.test.ts` next to the code).

3. **Run the checks locally** — the same ones CI runs:

   ```sh
   npm run lint
   npm run typecheck
   npm test
   npm run format:check
   ```

4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint):

   ```sh
   git commit -m "feat: add design-token resolver hook"
   ```

   > `feat:` and `fix:` trigger a version bump on release; `chore:` does not. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.

5. **Push and open a pull request** against `main`, filling out the PR template.

## Code style

- **Formatting** — Prettier, enforced by a pre-commit hook.
- **Linting** — ESLint flat config (`eslint.config.mjs`).
- **Tests** — Vitest, living next to the source they cover.

## Pre-commit hooks

[Husky](https://typicode.github.io/husky/) runs on every commit:

- **`pre-commit`** — `lint-staged` formats and lints staged `.ts`/`.tsx` files (Prettier + ESLint `--fix`).
- **`commit-msg`** — commitlint validates the message against the Conventional Commits spec.

## CI/CD

CI runs on every push and PR via `.github/workflows/main.yaml`, which orchestrates:

| Job         | When                                 | What it does                                                                              |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Build**   | All pushes and PRs                   | `npm ci` → `npm run build`, caches `packages/*/dist`                                      |
| **Check**   | After Build                          | lint → typecheck → format check → tests                                                   |
| **Release** | Push to `main` (after Build + Check) | `scripts/release.ts`: version → rebuild → verify → changelog/tag/GitHub release → publish |

## Releases

Releases are automated with [Nx Release](https://nx.dev/features/manage-releases) driven by conventional-commit history. Maintainers don't cut releases by hand — merging a `feat:`/`fix:` commit to `main` is what drives the version bump, changelog, and publish.

`scripts/release.ts` runs the steps in this order:

1. `releaseVersion` writes new versions to disk. Nothing is committed or tagged yet.
2. Every package is rebuilt without the Nx cache. Built packages embed their own version (event `context.library`, `X-Contentful-User-Agent`), and the cached build-job output still carries the previous one.
3. `verify-release-artifact` checks each built version against `package.json`.
4. `releaseChangelog` writes changelogs, commits, tags, pushes, and creates the GitHub Releases.
5. `releasePublish` publishes to GitHub Packages.

The prerelease workflow runs the same script with `--specifier prerelease --preid dev --tag dev`. `npx tsx scripts/release.ts --dry-run` previews a release locally without writing anything.

### Recovering a failed release

- **Failed in steps 1–3** (versioning, rebuild, verification): nothing was committed, tagged, pushed, or published. Fix the cause on `main` and the next push releases normally.
- **Failed in step 4** (changelog, tag, or push): check whether the `chore(release): publish` commit and `<project>@<version>` tags reached `origin`. If they did not, nothing is published and the next push retries. If they did, continue as for step 5.
- **Failed in step 5** (publish): the release commit, tags, and GitHub Releases exist, but some packages are missing from the registry. **Do not re-run the release job.** It checks out the commit before the release commit and would version again. Instead, check out the release commit (`git checkout <project>@<version>`), then run `npm ci`, `npm run build`, `npx nx run-many -t verify-release-artifact`, and `npx nx release publish` with a package-write token in `~/.npmrc` (see the `Setup npmrc file` step in `release.yaml`). `nx release publish` skips versions that already exist in the registry, so it is safe to repeat.

## Support & questions

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use GitHub issues for bugs and feature requests specific to this SDK.

## License

By contributing, you agree that your contributions are licensed under the MIT License. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
