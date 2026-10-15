# Experiences Node SDK reference implementation

This standalone Express/EJS implementation consumes `@contentful/experiences-node`
from locally built npm tarballs. It has its own dependencies, configuration, and
tooling, outside the root npm workspaces. The current scaffold imports the Node
SDK and serves `GET /health`; Experience fetching, visitor scenarios, and rendered
content are not yet implemented. It makes no Contentful requests.

## Prerequisites

- Node.js 22.13 or later; validation uses Node 24.15 and npm 12.0.2.
- The repository's root dependencies installed with `npm ci`.

## Setup

Run from the repository root:

```sh
npx nx run implementation-node-sdk:setup
```

Nx builds, checks, and packs the Node SDK's local dependency chain, then installs
this app's dependencies and prepares the local environment file. Installation uses npm with
workspace participation, lifecycle scripts, and package-lock generation disabled.
It removes only this app's `node_modules` before installing, so rebuilt tarballs
are refreshed even when their names and versions are unchanged. This follows
Optimization's fresh local-artifact install workflow using npm and Nx.

Setup creates `.env` from `.env.example` only when the file is missing. Populate
this implementation's `.env` with `SPACE_ID`, `ENVIRONMENT_ID`, and `CDA_TOKEN`.
Workers may gather these values from `lib/mocks/.contentfulrc.json` and
`lib/mocks/.env` during setup. The app and its launch commands use only the local
`.env`; they never read those source files. Do not copy the management token.
Keep real credentials out of `.env.example` and Git.

After SDK changes, refresh the installed artifacts:

```sh
npx nx run implementation-node-sdk:install
```

Existing `.env` values are preserved. Direct third-party dependencies are pinned;
transitive registry dependencies are resolved on each install, so this development
workflow does not provide lockfile-level reproducibility. npm may generate installation metadata inside `node_modules`; no lockfile is committed for this app.

## Running locally

```sh
npx nx run implementation-node-sdk:dev         # foreground; Ctrl-C stops it
npx nx run implementation-node-sdk:serve       # PM2 background process
npx nx run implementation-node-sdk:status
npx nx run implementation-node-sdk:logs -- --lines 20 --nostream
npx nx run implementation-node-sdk:restart
npx nx run implementation-node-sdk:serve:stop  # deletes only this app's process
```

The default health URL is `http://localhost:3100/health`. Set `PORT` in the local
`.env` to change it. Both launch paths load that same file. The server binds to
loopback. PM2 uses the name `experiences-node-sdk-app`. Run only one checkout with
that process name at a time. Stop deletes that named process; PM2 reports an error
if it is already absent. Status, logs, and stop use the installed PM2 CLI directly.

These commands use the app's local tools. No mock server or E2E tooling is started
or installed. Running from the app directory is also supported, for example
`npm run dev` or `npm run typecheck`.

The repository also provides `npm run pm2:list`, `npm run pm2:logs`,
`npm run pm2:stop:all`, and `npm run pm2:delete:all`, matching Optimization.
These operate on the selected PM2 home; the `all` commands affect every process
there. Use `implementation-node-sdk:serve:stop` to stop only this app.

## Validation and cleanup

```sh
npx nx run implementation-node-sdk:typecheck
npx nx run implementation-node-sdk:lint
npx nx run implementation-node-sdk:clean
```

The app uses ordinary package scripts for its local tools, with Nx coordinating
them. There are no implementation-owned runner or verification scripts. Isolation
is demonstrated by installing and running a copy outside the repository.

`clean` removes only `dist` and `coverage`; it preserves `.env`, dependencies, and
processes. Root build/test/lint/typecheck commands exclude implementations, so a
root-only install does not require this app to be set up. Use Nx selection for
implementation-wide work:

```sh
npx nx run-many -t setup --projects=tag:scope:implementation
npx nx run-many -t typecheck,lint --projects=tag:scope:implementation
```

## Troubleshooting

- Missing installation or an outdated archive: run the root `setup` command.
- Missing local `.env`: copy `.env.example`, then populate the local settings.
- A port conflict: choose another `PORT`; do not stop unrelated processes.
- For a copy outside the repository, preserve the relative archive layout:
  `implementations/node-sdk` and `pkgs` under a common directory. Install with
  `npm install --workspaces=false --package-lock=false --ignore-scripts` inside the
  copied app, then use its local npm scripts. Nx and root dependencies are not
  required to run or check that configured copy.

## Related

- [Node SDK](../../packages/node/README.md)
- [Local package artifacts](../../README.md#local-npm-artifacts)
