# Internal mocks package

This private workspace owns Personalization/Profile and Analytics/Insights MSW handlers and explicit Contentful space maintenance tools. It does not own an HTTP mock server, entry fixtures, or XDA Experience Delivery responses.

XDA tooling currently consists only of placeholders: `scripts/fetchExperiences.ts`, `src/contentful-handlers.ts`, and `src/contentful/data/experiences/.keep`. The fetch command is a no-op with a notice; `getHandlers()` returns an empty array. Keep acquisition strategy and actual request handling deferred until explicitly requested. `fetch:ctfl` runs space export followed by the experience-fetch stub, matching Optimization's command composition.

## Source ownership

- `src/experience/data/*.json` are intentionally synthetic seed responses. Keep them minimal and valid against the consuming client's injected schema. Preserve the new versus identified visitor behavior required by the handlers.
- `src/contentful/data/space/ctfl-space-data.json`, when present, is a Contentful export. Treat it as an external source mirror. Refresh through `fetch:ctfl:space` and review before committing; do not hand-edit it into a scenario.
- `src/contentful-generated.d.ts` and reference implementation copies are generated from that export. Change the source or generator and regenerate. Do not copy declarations from another repository.
- `.contentfulrc.json` contains the shared space/environment settings and management token; `.env` holds `CDA_TOKEN` for future delivery consumers. Both are ignored. Never commit them or print secrets in checks. Do not duplicate settings across them. No retained mocks command consumes `CDA_TOKEN`; adding its example does not authorize implementing deferred delivery fetching.

## Commands and safety

Run root `npm run mocks:<script>` shortcuts or `npm run <script>` inside this package. Typecheck, lint, and unit-test commands must work without an export or credentials. An empty Vitest run does not validate handler behavior.

Keep Contentful CLI calls directly in package scripts. Preserve the npm substitutions, inline output-directory creation, and explicit full-supported-data flags for the upgraded CLI. Export includes drafts, archived content, ExO variants, and downloaded assets; import enables ExO and uploads those local assets. The shared config uses only a management token; `deliveryToken` is not accepted by the import command. The CLI owns configuration and argument validation; do not add TypeScript/JavaScript wrappers, configuration preflight checks, or terminal-only restrictions around those calls. Retain the existing inline shell confirmation for `upload:ctfl:space`: only an answer of `y` invokes `upload:ctfl:space:confirmed`. The explicit confirmed command directly invokes the CLI without that prompt. Run either import only when the user has authorized a Contentful space mutation. Do not run export/import as part of routine validation.

Reuse Optimization's source implementation and package commands wherever compatible, applying the repository's standard Prettier formatting without package-specific overrides. Keep other necessary differences limited to npm/Nx integration, the omitted entry/XDA features, synthetic seed data, demonstrated compatibility requirements, and the explicitly requested CLI upgrade/export-import coverage. Do not rewrite equivalent logic, rename helpers, remove harmless compatibility code, or add validation/staging/rollback infrastructure.

`generate:ctfl:types` runs Optimization's generation and copy scripts in sequence. The generator uses the local `cf-content-types-generator` executable; the copy script discovers reference implementation directories under `implementations` and copies into `src` when present or the implementation root otherwise. Do not target `examples`. Preserve the source behavior when the upcoming `implementations` directory is absent; do not introduce a fallback destination. There is no configurable target registry. Preserve the source scripts' error handling and generated-output lifecycle.
