# Experiences SDK internal mocks

This private npm workspace provides MSW handlers for the Personalization/Profile and Analytics/Insights APIs, plus explicitly invoked Contentful space maintenance tools. It does not serve XDA Experience Delivery responses or run a standalone HTTP server.

The `src/experience/data` responses are intentionally synthetic Personalization seed fixtures. They are maintained with the handlers and must satisfy the injected response schema. A space export at `src/contentful/data/space/ctfl-space-data.json` is an external source mirror: review it before committing, and refresh it from Contentful rather than editing it into a test scenario. The export and `src/contentful-generated.d.ts` are absent on a fresh checkout. Neither is needed to import handlers, typecheck, lint, or run unit tests.

## Use in tests

Add `"mocks": "0.0.0"` as a consuming workspace's development dependency. The root export does not load the test-only `loggerMock` module. Import that module explicitly through `mocks/loggerMock` inside a test when needed; its module-level spies require test globals. The source helper supports both Vitest and Rstest globals without importing either runner.

```ts
import {
  BatchExperienceEventArray,
  ExperienceEventArray,
  ExperienceResponse,
} from '@contentful/optimization-api-client/api-schemas';
import { experienceApiHandlers, insightsApiHandlers } from 'mocks';
import { setupServer } from 'msw/node';

const server = setupServer(
  ...experienceApiHandlers.getHandlers({
    batchExperienceEventArray: BatchExperienceEventArray,
    experienceEventArray: ExperienceEventArray,
    experienceResponse: ExperienceResponse,
  }),
  ...insightsApiHandlers.getHandlers()
);
```

Supply the schemas from the actual consuming Optimization API client. The handlers retain their existing injected parsing, preflight, and reset behavior. They do not import that client's schemas themselves.

## Contentful maintenance

Copy `.contentfulrc.example.json` to the ignored `.contentfulrc.json` in this directory and fill in the target space, environment, and tokens. `managementToken` is a Content Management API personal access token for CLI management operations. Use only the management token for this workflow: `--include-drafts` makes the exporter use the CMA. Remove any `deliveryToken` field from an existing local config before importing; the CLI import parser rejects that export-only field. Keep tokens out of commits. The commands explicitly select `./src/contentful/data/space/ctfl-space-data.json`, matching the type generator. Before exporting, configure the source space/environment; before importing, change the ignored configuration to the intended destination space/environment and an authorized management token. The destination must already exist and have ExO enabled.

For the delivery credential, copy `.env.example` to the ignored `.env` in this directory and set `CDA_TOKEN`, matching the repository's existing environment-variable naming. Keep this token in one place; space/environment settings and the management token remain in `.contentfulrc.json`. Optimization's excluded `fetchEntries.ts` needed a delivery token, and future reference-implementation delivery tooling will need one, but none of the retained mocks commands consumes `CDA_TOKEN`. This template provides credential storage only; delivery fetching and consumer environment loading remain future work. The import parser rejects `deliveryToken` in both CLI 3.10.4 and 4.0.11; this is not an upgrade regression.

Run the following from the repository root, or run the unprefixed package script inside `lib/mocks`:

| Root command                                | Action                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run mocks:clean`                       | Remove only package build, coverage, and cache output.                                          |
| `npm run mocks:config:ctfl:list`            | List local Contentful CLI configuration; avoid printing it in routine CI logs.                  |
| `npm run mocks:fetch:ctfl:space`            | Export supported space data, including drafts, archived content, ExO/variants, and asset files. |
| `npm run mocks:fetch:ctfl:experiences`      | Run the experience-fetch placeholder; prints a notice and makes no requests or writes.          |
| `npm run mocks:fetch:ctfl`                  | Run space export, then the experience-fetch placeholder.                                        |
| `npm run mocks:generate:ctfl:types`         | Generate and distribute declarations from an existing space export.                             |
| `npm run mocks:upload:ctfl:space`           | Require `y` at the inline shell prompt before running the confirmed import command.             |
| `npm run mocks:upload:ctfl:space:confirmed` | Import the JSON and local asset files without a prompt; invoke only when explicitly authorized. |
| `npm run mocks:typecheck`                   | Typecheck the package.                                                                          |
| `npm run mocks:lint`                        | Lint the package.                                                                               |
| `npm run mocks:test:unit`                   | Run package-scoped Vitest; an empty run provides no behavior validation.                        |

The package pins `contentful-cli@4.0.11`; the lockfile resolves its export/import engines to `8.5.1` / `10.5.5`. Node 22.12 or later is required by the resolved CLI dependency tree. Export creates `src/contentful/data/space` before invoking the CLI. The resulting portable bundle is that entire directory: `ctfl-space-data.json` plus asset files stored beneath their source host/path. Keep those files together when moving the export to another checkout or machine. Import uses `--upload-assets` with that directory, including for embargoed assets.

Export enables `--include-drafts`, `--include-archived`, `--include-experience-orchestration`, `--include-exo-variants`, and `--download-assets`. Standard supported collections and active Releases use the exporter's enabled defaults; do not configure query filters or skip flags when a complete supported export is intended. `--include-exo-variants` is passed on the command line: CLI 4.0.11 forwards that flag, but its parser rejects the undeclared camelCase config-file key `includeExoVariants`. Import enables ExO and automatically imports nested variants present in the file.

This covers the tool's supported data, not every CMA resource or a lossless clone. ExO support covers design tokens, components, templates, data assemblies, fragments, experiences, and nested optimization variants. Variant IDs are regenerated on import, and repeated imports can duplicate variants; source-ID references may need attention. Space memberships and webhook credentials are not exported, custom UI extensions need separate setup, and archived/legacy Releases are not covered. Source and destination feature entitlements and permissions must allow the requested resources. Review export warnings and import errors: some unsupported or inaccessible collections can be skipped while other content succeeds. See the [export documentation](https://github.com/contentful/contentful-export/blob/v8.5.1/README.md) and [ExO import details](https://github.com/contentful/contentful-import/blob/v10.5.5/docs/exo-import.md).

Export and import are never prerequisites of install, typecheck, lint, or tests. Do not run import simply to populate local fixtures.

## XDA placeholders

`scripts/fetchExperiences.ts` marks where future experience fixture fetching belongs. `src/contentful/data/experiences` contains only `.keep` until that workflow is implemented. `src/contentful-handlers.ts` is the home for future XDA mock handlers; its `getHandlers()` currently returns an empty array and is exported from both `mocks` and `mocks/contentful-handlers`. These stubs do not define the acquisition strategy or serve responses.

## Generate content-model declarations

Export the intended space first. `generate:ctfl:types` runs `generateTypeDefinition.ts` followed by `copyGeneratedTypeDefinition.ts`, as in Optimization. The generator uses the locally installed `cf-content-types-generator` with `-X` and `-r`, combines its sorted generated files and imports into `src/contentful-generated.d.ts`, and removes its temporary output. The scripts retain Optimization's error handling; generation and copying are sequential, not transactional.

The copy script discovers reference implementation directories under `implementations`, exactly as in Optimization. It copies the generated declaration into each implementation's `src` directory when present, or its root otherwise. It does not target `examples`. The copy command requires the upcoming `implementations` directory to exist; until then it retains Optimization's missing-directory error rather than redirecting output. These copies are generated outputs and are overwritten on regeneration. Consumers must declare the type dependencies referenced by the generated declaration, including `contentful`, themselves. No declarations are generated or distributed during installation or ordinary validation.
