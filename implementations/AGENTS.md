# Reference implementations

Use Optimization's corresponding reference implementation as the example. Keep
SDK operations in the public runtime and justify every departure from that example.

Standalone apps: [Node](./node-sdk/README.md), [Web](./web-sdk/README.md), and
[Node + Web](./node-sdk+web-sdk/README.md). Root `npm run implementation:install`
prepares all three through their existing Nx setup targets; stop running apps with
their scoped lifecycle targets before refreshing dependencies.

For server-side personalization, send the page event directly to establish the
SDK-owned visitor profile. Build the identify event with the SDK event builder
and include it in `request.fetchExperience()` personalization options so XDA can
select content for the identified visitor. Fetch each Experience once per app
request; do not send identify independently or add an initialization content fetch.
These choices compensate for current XDA behavior. Follow the Node reference's
[workaround removal criteria](./node-sdk/README.md#current-xda-limitations-and-workaround-removal)
when XDA/client support changes instead of treating the flow as a permanent API requirement.

## Optional Preview Sessions

Use conditional Node/Web `livePreview` initialization from the installed optional
package. Branch on `isPreview` before visitor work; destroy Node request facades
in `finally`. Web uses `fetchExperience()` then `subscribeToPreview()` for updates
and `states.preview` for status; hybrid retains SSR plans/DOM without a startup
refetch or profile handoff. Release subscriptions on route
replacement/final exit, retaining them for BFCache. Preview content must not write
identity cookies. Keep `.env` intact and browser config explicitly allowlisted.
Build and host both read app-local `LIVE_PREVIEW_ENABLED` from `.env`; preserve
tarball setup and pack the existing optional preview artifact without rebuilding it.
See each app README and [Runtime limits](../packages/runtime/README.md#shared-limitations).

All reference implementations use the same hard-coded default Experience IDs:

- `3fLAdFb3BYAuImRhcW8k4t` — Coded Experience
- `4WzbgzPQHa9Tr2ffbOU8p7` — Composed Experience
- `7u2eP09B4BIBToH8UwSHck` — Personalized Composed Experience

An implementation-local override is optional; configuring IDs must not be required
to use the reference data. Keep implementations standalone rather than adding a
shared runtime configuration dependency. Profile IDs are distinct: they must come
from Experience API/XDA responses and remain SDK-managed, with no manual entry.

## Content typing

Use the SDK's types for render-plan structure and generated content types for source
content fields. These describe different parts of the integration and should be
combined rather than duplicating the source content model in handwritten interfaces.

`npm run mocks:generate:ctfl:types` generates CDA declarations from the space export
and copies `contentful-generated.d.ts` into implementation source directories. Do
not hand-edit those files. The installed generator requires Node 24+. Consumers
using its declarations must declare the referenced type dependencies locally;
workspace dependencies must not mask a missing implementation dependency.

### Determine the binding contract from configuration

Bindings are maintained in the admin interface and may change. Do not treat a
particular field mapping or source content type as a permanent convention. Determine
the contract from the space configuration and confirm the delivered shape:

1. Inspect `lib/mocks/src/contentful/data/space/ctfl-space-data.json` for the intended
   space/environment. If it no longer reflects admin configuration, obtain a fresh
   export through the existing maintenance workflow. Do not hand-edit the export
   or change admin bindings as part of implementation work.
2. Locate the Experience and follow its slots to the rendered fragments. Inspect
   their component/template references and relevant `optimizationVariants`, since
   variants can bind different entries or values.
3. Follow each `contentBindings.sys.urn` to its data assembly. Inspect the supplied
   parameters, including entry resource links and literal values; follow parameter
   references rather than assuming every value comes directly from an entry.
4. Read the data assembly's parameter constraints, resolver queries, and `return`
   mappings. Trace `$parameters`, `$resolvers`, `$from`, and selection paths to
   determine source fields, aliases, wrappers, and projections. Follow nested
   data-assembly resolvers where present.
5. For bound entries, look up `entries[].sys.contentType.sys.id` and the corresponding
   `contentTypes` definition. Cross-check allowed content types and query type
   conditions, then locate the matching generated declarations. Obtain field value
   types from the generated entry type's `fields`, not directly from
   `EntryFieldTypes` schema markers. Consider all allowed source types, not only
   the currently selected entry.
6. Follow component/template `contentProperties` and composed `componentTree`
   mappings to the final coded nodes. A data assembly's output names may be mapped
   again before they become renderer-facing properties.
7. Confirm the result through the public SDK's fetched plan: inspect each node's
   registration, `props.content`, and nested slots. Use configuration to establish
   allowed shapes and delivered data to confirm actual representation; one response
   does not establish every variant, collection, or nullable case. Investigate
   differences instead of forcing the response into an assumed type.

Generated CDA types cover source fields, not the entire transformed binding output.
A binding-output type can derive its value types from those generated fields while
expressing the determined property names, wrappers, transformations, optionality,
and nullability. Keep this tracing work outside the application's runtime: the
reference must not read the management export to render content.

### Current SDK limitation and intended support

`PortableRenderPlan` types nodes, registrations, slots, and metadata, but
`PortableRenderNode.props.content` and `ResolveContext.content` remain
`Record<string, unknown>`. The SDK currently cannot carry a consumer's generated
or derived content types through fetch/resolve results and resolver inputs.
Adapter `defineComponent<Props>` registrations type presentation props and resolver
outputs; they do not specialize the incoming content. Do not describe a plan type
or a passing application typecheck as proof that all content fields are typed.

We intend to address this deficiency in a future SDK update by allowing consumers
to supply content types per component and Experience Template registration and
preserving those types through plans, nested slots, fetch/resolve APIs, and
resolver inputs. Existing consumers must retain the default unknown-valued
behavior. Source content types, bound content properties, and final presentation
props must remain distinct. The public API for this support is not yet available.

Future generation tooling could derive binding-output types and registration maps
from source schemas and configured bindings, reducing manual mapping. Do not build
a custom generator or duplicate SDK typing infrastructure inside a reference
implementation to compensate for the current limitation.

The Node reference's EJS templates are not checked by TypeScript. Typing data in
the server does not check property accesses in those templates, and supplying a
type argument or assertion does not validate live content against admin
configuration. Preserve the agreed rendering approach; adding template tooling or
runtime validation requires separate scope. Exercise consumer-supplied typing in
reference implementations when the SDK supports it and the rendering path can
demonstrate the intended compile-time guarantees.
