## 0.6.3 (2026-10-18)

### 🧱 Updated Dependencies

- Updated runtime to 0.1.2
- Updated client to 0.9.6
- Updated core to 0.12.5

## 0.6.2 (2026-10-16)

### 🧱 Updated Dependencies

- Updated runtime to 0.1.1
- Updated client to 0.9.5
- Updated core to 0.12.4

## 0.6.1 (2026-10-16)

### 🚀 Features

- ⚠️  **web,runtime:** [NT-4154] queue and flush Analytics events with retry ([#233](https://github.com/contentful/experiences/pull/233))

### ⚠️  Breaking Changes

- **web,runtime:** [NT-4154] queue and flush Analytics events with retry  ([#233](https://github.com/contentful/experiences/pull/233))
  trackView, trackClick, trackHover and trackFlagView
  resolve once the event is queued, not when the request completes.
  * fix(web,runtime): [NT-4154] align queue flush behavior with Optimization
  Address review feedback on the Analytics queue by matching the reviewed
  Optimization behavior (173fac4).
  - Page hide forces a final attempt on both queues after ending active
    interactions. Only Analytics uses the Beacon API.
  - AnalyticsDelivery.flush() joins an attempt already in flight instead of
    returning early, and clearQueue() forgets it. A join starts no new
    request and guarantees nothing about delivery.
  - Web flush() starts the Analytics and Personalization attempts together.
  - Add queuePolicy.offlineMaxEvents (default 100, normalized with
    toPositiveInt) for offline Personalization admission, kept separate
    from the per-handoff payload limit. onOfflineDrop is deprecated and
    inactive in Optimization, so it is not added.
  * fix(web,node,runtime)!: [NT-4154] align submission contracts with Optimization
  Address the second review round by following the Optimization contracts
  at 173fac4 instead of introducing alternatives.
  - trackView, trackClick, trackHover and trackFlagView resolve with no
    result in Web and Node, as in Optimization. A consent-blocked call and
    a failed transport are no longer reported through a boolean, and the
    threshold-reaching Analytics call still awaits its flush.
  - Without a profile, Web warns and drops the event like the stateful
    InsightsQueue. Node keeps throwing EventProfileRequiredError, because
    stateless requests are bound to a profile.
  - forRequest() accepts experienceOptions (ip, plainText, locale) and
    insightsOptions (beacon). They are copied per request, forwarded on
    direct sends and on the handoff preview, and a request locale takes
    precedence over experienceOptions.locale.
  - Both delivery queues require a ResolvedQueueFlushPolicy; the owning
    runtime resolves the policy once.
  - Document the parity rule and the retained differences in AGENTS.md.
  BREAKING CHANGE: the Analytics methods return Promise<void> instead of
  Promise<boolean>, and Web no longer rejects a call made without a profile.
  * fix(web,node,runtime)!: [NT-4154] align trackView, locale and teardown with Optimization
  Address the third review round by following Optimization at 173fac4 for
  behavior, public API and internal design.
  - trackView returns EventEmissionResult in Web and Node, as in
    Optimization: { accepted: true } when consent admits it and
    { accepted: false } when consent blocks it or Web is destroyed. Click,
    hover and flag view keep returning void.
  - In Node, experienceOptions.locale is only the Personalization transport
    and replay locale. request.locale and content fetches use the request
    locale or the runtime default, so the option no longer changes content.
  - PersonalizationDelivery teardown follows ExperienceQueue: flushOnDestroy()
    captures the teardown identity and calls the common flush(), which owns
    joining, teardown gating and the attempt; attempt completion does the
    teardown cleanup. Web's destroy() invokes and handles that promise, as
    CoreStateful.destroy() does. The separate destroy path is removed.
  - Remove the teardown item from the retained differences in AGENTS.md.
  BREAKING CHANGE: trackView returns EventEmissionResult instead of void, and
  in Node experienceOptions.locale no longer changes request.locale.
  * fix(web,runtime): [NT-4154] port Optimization teardown identity, acceptance and Analytics lifecycle
  Address the fourth review round by porting the Optimization structures at
  173fac4 rather than adding special cases.
  - Profile continuation is local to each sendQueuedBatches() drain, as in
    ExperienceQueue. A teardown drain starts from the captured current
    identity and follows only its own responses. The delivery-wide
    continuation field is removed. Fixes a teardown request being sent under
    a stale profile after a newer direct response changed the profile.
  - Request acceptance separates live requests from teardown-authorized
    deliveries (isLive / isDestroyDrain / isAccepted). A direct request
    carries no teardown delivery, so its late success and late failure are
    both discarded after destroy. Fixes a pending direct page() rejecting
    after destroy instead of resolving { accepted: true }.
  - AnalyticsDelivery reads an owner-provided getResetToken and exposes
    clearQueuedEvents / clearPeriodicFlushTimer, as InsightsQueue does. Web
    owns the token and the teardown: destroy() starts the final flushes,
    then ends the lifetime and cancels the queue timer and retry, in
    CoreStateful.destroy()'s order. The queue's own destroy() is removed.
  - Sent Analytics events are removed by the batch snapshot; the parallel
    bookkeeping map is removed."
  M	AGENTS.md
  M	ARCHITECTURE.md
  M	README.md
  M	packages/node/README.md
  M	packages/node/src/contentful-experiences.test.ts
  M	packages/node/src/contentful-experiences.ts
  M	packages/node/src/index.ts
  A	packages/runtime/src/analytics-delivery.test.ts
  A	packages/runtime/src/analytics-delivery.ts
  M	packages/runtime/src/index.ts
  A	packages/runtime/src/lib/number/index.ts
  A	packages/runtime/src/lib/number/number.test.ts
  A	packages/runtime/src/lib/number/number.ts
  A	packages/runtime/src/lib/queue/QueueFlushRuntime.test.ts
  A	packages/runtime/src/lib/queue/QueueFlushRuntime.ts
  A	packages/runtime/src/lib/queue/flushPolicy.test.ts
  A	packages/runtime/src/lib/queue/flushPolicy.ts
  A	packages/runtime/src/lib/queue/index.ts
  A	packages/runtime/src/lib/queue/queuePolicy.test.ts
  A	packages/runtime/src/lib/queue/queuePolicy.ts
  M	packages/runtime/src/personalization-delivery.test.ts
  M	packages/runtime/src/personalization-delivery.ts
  D	packages/runtime/src/personalization-flush.test.ts
  D	packages/runtime/src/personalization-flush.ts
  M	packages/runtime/src/runtime-event-methods.test.ts
  M	packages/runtime/src/runtime-event-methods.ts
  M	packages/web/README.md
  A	packages/web/src/contentful-experiences.analytics-queue.test.ts
  M	packages/web/src/contentful-experiences.delivery.test.ts
  A	packages/web/src/contentful-experiences.queue-parity.test.ts
  M	packages/web/src/contentful-experiences.test.ts
  M	packages/web/src/contentful-experiences.tracking.test.ts
  M	packages/web/src/contentful-experiences.ts
  A	packages/web/src/lib/beacon.ts
  A	packages/web/src/lib/visibility.ts
  M	packages/web/src/paired-handoff.integration.test.ts

### 🧱 Updated Dependencies

- Updated runtime to 0.1.0

## 0.6.0 (2026-10-14)

### 🚀 Features

- ⚠️  **web,node:** add consent gating and persistence [NT-4151] ([#229](https://github.com/contentful/experiences/pull/229))
- [NT-4319] add paired Experiences runtime handoff ([#230](https://github.com/contentful/experiences/pull/230))

### ⚠️  Breaking Changes

- **web,node:** add consent gating and persistence [NT-4151]  ([#229](https://github.com/contentful/experiences/pull/229))
  browserContext.getConsent is removed in favor of
  consent(). Events are gated until consent is granted, so callers that sent
  non-allow-listed events without consent stop sending them. On Node,
  eventConsent changes from annotating events to gating them; it is kept as a
  deprecated alias for consent.events.
  * fix: gate pre-built events on consent [NT-4151]
  Caller-built events passed in fetchExperience({ personalization: { events } })
  bypassed the consent gate because they are already built rather than sent
  through an event method.
  - Web and Node: filter those events by consent before the request. The profile
    id still travels.
  - Map wire event types to their methods in one place so the rules match a
    direct call, and fail closed for types the SDK never emits.
  - Export the consent types from the Web and Node entry points.
  - Cover interaction tracking under denied consent.
  They are gated but not stamped: XDA's embedded event schema has no consent
  field.
  * feat(examples): add consent demo panel to the Next.js example [NT-4151]
  A client panel that creates the Web runtime so consent gating can be tried
  in a browser: accept, reject, and events-only choices, fired events,
  blocked-event log, and the profile in memory next to the stored one.
  * feat(examples): add consent demo panel to SvelteKit and Angular [NT-4151]
  Port the Next.js consent panel so all three examples show consent gating.
  Add the Analytics events (view, click, hover, flag view) to the panel, and
  reuse SPACE_ID, ENVIRONMENT_ID and CDA_TOKEN instead of new variables.
  - SvelteKit: layout server load returns the credentials; the panel creates
    the Web runtime on mount.
  - Angular: server.ts passes the credentials on every request and
    ConsentStore relays them through TransferState; the panel creates the
    runtime after the first render.
  - Next.js: the server layout passes the credentials as props.
  * docs: describe consent gating in AGENTS.md [NT-4151]
  Add a consent paragraph next to the event-method description, and correct the
  fetch-personalization note: Node and Web now filter caller-built events by
  consent before the request.
  * fix(web): share the Optimization SDK's consent storage contract [NT-4151]
  Both SDKs use the key __ctfl_opt_consent__, but Experiences wrote a JSON object
  there while the Optimization SDK writes accepted/denied and keeps persistence
  consent under __ctfl_opt_persistence_consent__. Each SDK misread the other's
  value, and Experiences cleared an Optimization value when it failed JSON
  parsing.
  Use the Optimization encoding and both keys, including its rule that accepted
  event consent with no persistence key counts as accepted persistence. A value
  that is not recognized is treated as undecided and left untouched.
  The JSON format never shipped, so there is nothing to migrate.
  * fix(web): resolve startup consent defaults like the Optimization SDK [NT-4151]
  Experiences applied configured defaults only to axes without a stored decision,
  so a returning visitor could start with different consent than in the
  Optimization SDK under the same configuration.
  Configured defaults now take precedence over stored values, and
  defaults.consent is the default for persistence consent when
  defaults.persistenceConsent is not set. An axis left unset keeps its stored
  value. When the effective persistence consent is not granted, the stored
  profile is no longer used, but it is not deleted.
  Defaults are still not written to storage; only consent() is. The Optimization
  SDK writes its effective consent through to storage at startup, so there a
  configured default is later indistinguishable from a visitor's own decision.
  That difference is intentional here and is called out in the Web README.
  * fix(web): gate and stamp server-prepared handoff events [NT-4151]
  The paired handoff (#230) lets a Node server prepare a Personalization batch that
  the browser queues through hydrateAndTrackCurrentPage. That path sent the batch
  with no consent check, and kept the isConsentGiven value the server stamped, so
  a server could send events the visitor had not allowed and the transmitted flag
  could disagree with the browser decision.
  Check the batch against the browser's consent before it is queued. A prepared
  batch is identify and track events followed by one page and is rejected if
  partial, so it is admitted whole or not at all; every blocked event is reported
  to onEventBlocked. A refused batch falls back to the browser's own page event,
  which goes through the ordinary gate.
  Stamp each admitted event with the browser's event consent using withEventConsent,
  so the flag matches the decision that admitted it. Undecided stamps false.
  Existing prepared-batch tests assert the exact batch that is sent. Their fixtures
  now match the opted-in browser they run as, and the paired integration test
  documents that the browser's flag replaces the server's.
  Caller-built fetchExperience events are gated but not stamped: XDA's embedded
  event schema has no consent field.
  * fix(examples): adapt the consent panels to the paired runtime [NT-4151]
  The runtime no longer takes a resolverConfig at construction (#230 supplies it per
  fetch), so drop it from the panels, which never fetch.
  Only one Web SDK may be live per JavaScript runtime, so destroy the instance when
  the panel unmounts. Without this a remount, such as React StrictMode or a hot
  reload, would try to construct a second one and throw.
  * fix(web): make super() the first statement of the Web constructor [NT-4151]
  Constructing the Web SDK inside a Next.js client component threw
  "Must call super constructor in derived class before accessing 'this'", so the
  SDK could not be used from Next.js at all.
  The constructor took the singleton lock before super() and wrapped super() in a
  try. When Next (SWC) lowers the class's private and arrow-function fields it
  hoists `var _this = this` to the top of the constructor, ahead of super(), which
  throws. Node, jsdom and an esbuild browser bundle all construct it fine, so no
  existing test could see it; it reproduced on origin/main with no consent code.
  Call super() first and take the lock right after it. The base class validates its
  configuration there, so a failed construction still never holds the lock, and a
  failed second attempt still cannot release the first instance's lock. Tests cover
  both, and the replacement-after-destroy case.
  * fix(web): drop queued events when event consent is withdrawn [NT-4151]
  The paired runtime (#230) gave Web an in-memory offline queue. Events are checked
  against consent when they are accepted, so ones queued while the visitor had
  consented were still sent after they withdrew it: when the connection returned,
  or when destroy() drained the queue. The Optimization SDK purges its queues on
  consent(false).
  Add PersonalizationDelivery.clearQueue(), which empties the queue and cancels the
  scheduled retry without resetting the delivery, and call it when consent() is
  given events: false. A persistence-only change or a grant leaves the queue alone.
  A request already on the wire cannot be recalled.
  * fix(web): ignore responses that complete after event consent is withdrawn [NT-4151]
  Clearing the queue and its retry timer left the delivery token valid, and the
  profile revision unchanged. A request sent while both permissions were granted
  could therefore complete after consent({ events: false }), replace the live
  profile and, with persistence still granted, write it to LocalStorage.
  Rotate the delivery token when the queue is cleared, as the Optimization SDK
  rotates its reset token, so earlier requests can no longer publish delivery state
  or a queued profile. Bump the profile revision through a new
  LocalStore.invalidateInFlight() so a direct event's response is stale too. It
  changes neither the live profile nor the stored copy, and persistence stays an
  independent decision. HTTP already sent is not recalled.
  * fix(web): forget handoff acceptance when withdrawal discards its queued page [NT-4151]
  Clearing the queue on withdrawal left the cached handoff delivery and the
  current-page tracker intact. After an offline admission, a withdrawal and a new
  grant, retrying the same route returned the cached { accepted: true } although
  the accepted batch had been discarded and no request was ever sent, while
  trackCurrentPage() returned { accepted: false } for the route it thought was done.
  The page event was lost.
  Clear the handoff initialization and reset the page tracker when event consent is
  withdrawn, as the Optimization SDK does, so a later permitted attempt for the same
  route is sent. This also forgets routes already sent, so one can be sent again
  after a withdrawal and a new grant; a test pins that choice.
  * fix(web): restart timed interaction sessions across consent boundaries [NT-4151]
  Active view and hover observers keep their own clocks, so gating only at send
  time was not enough. A hover that began without event consent had its initial event
  blocked, and granting consent just before mouseleave then reported the roughly
  second spent before the grant as its duration.
  Run each detector only while its method is permitted, and start or stop them when
  consent changes, as the Optimization SDK reconciles its detectors. A detector that
  stops drops any measurement in progress, and one that starts is given the elements
  already observed and measures from that moment. Nothing is attached for an
  interaction that is not permitted, so a denied gesture never reaches the gate and
  is no longer reported to onEventBlocked; a manual call still is.
  Views and hovers are covered in both directions, with a withdrawal and a regrant,
  and with a narrower allow-list. A persistence-only change leaves a running
  interaction alone.
  * fix(node): keep a permitted page when an optional initial event is blocked [NT-4151]
  prepareRequestHandoff() rejected the whole preparation when any event in the batch
  was not admitted. With the default allow-list, consent: false and an initial
  track, nothing was previewed or replayed even though the page is permitted.
  The batch only has to end in one page, and the initial identify and track inputs
  are optional, so dropping one still leaves a valid batch. The earlier comment
  saying it would leave a batch the browser rejects was wrong for preparation.
  Check each initial input on its own and build the batch from those that are
  admitted, reporting the others to onEventBlocked. The page is checked separately
  and is required: without a permitted page nothing is prepared. Web keeps admitting
  an already prepared batch whole, since it is replayed exactly as the server
  previewed it.
  * fix(web): apply Optimization's storage effects to startup consent defaults [NT-4151]
  The precedence of configured defaults matched the Optimization SDK, but their storage
  effects did not. With a stored acceptance and a stored profile, constructing the SDK
  with defaults.persistenceConsent: false left both in storage, and recreating it
  without the default restored the acceptance and the old profile. Startup grants were
  not written to the shared consent keys at all.
  Resolve the effective consent first, write it to the shared keys, and then reconcile
  the profile with it: restore it when persistence is granted, and remove the stored
  copy when persistence is denied. A visitor who has not decided, with no defaults,
  writes nothing, and an undecided persistence still leaves a stored profile alone so a
  later grant can restore it.
  Two behaviours change on purpose, and both were previously documented as the
  opposite. A configured default becomes the stored decision, so removing it does not
  return the visitor to an earlier choice. A default that denies persistence deletes
  the stored profile. The tests that asserted the old behaviour now assert this.
  * docs(web): drop the "no consent gating" limitation [NT-4151]
  The limitations list still said the Web SDK has no consent gating, which this
  change adds. Remove it, and note that withdrawing event consent discards the
  in-memory offline queue.
  * feat(web): add the identity cookie helpers [NT-4151]
  Port the Optimization SDK's cookie helpers: read, write and delete a cookie, with
  domain, path, SameSite, Secure and expiry. Deletion takes the same attributes as
  the write, so a cookie is removed in the scope it was set in. Calls are no-ops where
  there is no document.
  Nothing uses them yet; the identity cookie lifecycle builds on them. The tests are
  ported from the Optimization SDK, plus exact-name matching, SameSite and Secure.
  * feat(web): store the anonymous id and manage the identity cookie [NT-4151]
  Add the identity cookie lifecycle's building blocks, ported from the Optimization
  SDK so both SDKs read and write the same cookie and keys.
  - Constants for the legacy cookie (ntaid) and the current and legacy anonymous id
    storage keys, pinned to the Optimization values.
  - LocalStore.anonymousId, which reads the legacy key ahead of the current one and
    removes it when read, as the Optimization SDK does.
  - IdentityCookie, which decides the identity to keep (profile, then adopted handoff
    id, then the stored id), writes and clears the cookie in one scope with a 365 day
    default expiry, and adopts an identity the browser already holds, migrating a
    legacy cookie. It writes nothing when the cookie already matches the stored id, so
    starting the SDK does not push the expiry out.
  It does not read consent; whether to write is the caller's decision. Nothing calls
  it yet.
  * feat(web)!: keep the identity cookie in step with persistence consent [NT-4151]
  The Web SDK kept the profile in LocalStorage only, which a server cannot read, so a
  server rendering the next request could not recognise a visitor the browser had
  identified. Write the identity cookie (ctfl-opt-aid) as the Optimization SDK does, so
  both can read each other's and the existing Node contract (forRequest({ profile }))
  has something to read.
  Writing is gated on persistence consent. The identity is a complete profile's id, then
  an identity adopted from a handoff, then the id already stored, so a visitor keeps
  their continuity while the profile is absent and a profileless static or public handoff
  cannot erase it. It follows profile responses, XDA profile ids, and handoff state.
  - At startup, and when persistence is granted later, adopt an identity the browser
    already holds, migrating a legacy ntaid cookie. A cookie for a different visitor than
    the profile held resets that profile first. An id adopted this way is what the next
    request is sent under.
  - When persistence is withdrawn, or a default denies it, remove the cookie and stored id
    and keep the in-memory profile. Event consent is independent.
  - reset() clears the identity. destroy() does not, so approved continuity survives a
    teardown. Responses invalidated by a withdrawal or reset cannot recreate it.
  - A cookie option sets domain, path, SameSite, Secure and expiry (365 days by default),
    and a deletion always uses the scope the cookie was written with.
  BREAKING CHANGE: the Web SDK now writes the ctfl-opt-aid cookie and a stored anonymous id
  when persistence consent is granted, where it wrote neither before. The existing test
  suites that construct the SDK now clear the identity cookies between tests, because
  destroy() correctly leaves them.
  * feat(examples): add a framework-neutral Node example for the identity cookie [NT-4151]
  The Node SDK takes a profile and consent from the host and reports canPersistProfile,
  and never touches HTTP. Show the host side: read the ctfl-opt-aid cookie from the request,
  supply it through forRequest({ profile, consent }), and use canPersistProfile to write or
  expire the response cookie in the scope it was written in. It uses only node:http, so it
  fits any framework, and it needs no adapter or middleware.
  Server-side consent comes from the application. The cookie being present is not taken as
  consent, so a visitor who sent it without being granted persistence has it expired.
  A regression test drives the same functions through the whole sequence: the Web SDK
  persists an identity, the next server request carries it, Node reuses the profile, and the
  returned handoff continues it in a new browser runtime. It also covers withholding,
  withdrawal in the original scope, and a later grant.
  Also refresh package-lock.json: it adds the new workspace, and the
  @contentful/experiences-web entries for the Next.js, SvelteKit and Angular examples, whose
  package.json files gained that dependency in earlier commits without the lockfile following.
  * docs: document the identity cookie lifecycle [NT-4151]
  The Web README and AGENTS.md said the SDK writes no anonymous-id cookie and that
  persistence consent gates LocalStorage only. Replace that with the lifecycle: what the cookie
  holds, adoption at startup and on a later grant, withdrawal, reset() versus destroy(), and
  the cookie option. Point the Node README at the example, and state that the cookie's
  presence is not server-side consent.
  Add a case for the claim that a profileless static or public handoff cannot erase an
  identity held only in storage, as for a returning visitor.
  * refactor(web): apply a handoff profile only when a private request states it [NT-4151]
  * fix(web): use one effective-identity lookup for handoff adoption and fetches [NT-4151]
  * fix(web): clear the legacy stored anonymous id with the current one [NT-4151]
  * fix(examples): persist the paired handoff's continuation id in the Node cookie [NT-4151]
  * fix(examples): accept the Web cookie option in the Node identity helper [NT-4151]
  * fix(examples): parse the Cookie header the way Optimization's server does [NT-4151]
  * fix(web): resolve startup consent before loading the stored profile [NT-4151]
  * refactor: validate a prepared batch once and queue the validated type [NT-4151]
  * refactor(web): reconcile a server cookie in Optimization's compare, reset, persist order [NT-4151]
  * fix(web): synchronize the effective identity after cookie reconciliation [NT-4151]
  * fix(examples): decode the identity cookie value the way Optimization's server does [NT-4151]
  * fix(web): reconcile the captured cookie after syncing the profile at startup [NT-4151]"
  M	AGENTS.md
  M	ARCHITECTURE.md
  M	README.md
  M	examples/angular/README.md
  M	examples/angular/package.json
  M	examples/angular/src/app/app.component.ts
  A	examples/angular/src/app/components/consent-panel.component.ts
  A	examples/angular/src/app/consent-store.ts
  A	examples/angular/src/app/lib/consent-config.ts
  M	examples/angular/src/server.ts
  M	examples/nextjs/README.md
  M	examples/nextjs/app/layout.tsx
  A	examples/nextjs/components/ConsentPanel.tsx
  M	examples/nextjs/next.config.mjs
  M	examples/nextjs/package.json
  A	examples/node/.env.example
  A	examples/node/README.md
  A	examples/node/identity-cookie.ts
  A	examples/node/package.json
  A	examples/node/server.ts
  A	examples/node/tsconfig.json
  M	examples/sveltekit/README.md
  M	examples/sveltekit/package.json
  A	examples/sveltekit/src/lib/components/ConsentPanel.svelte
  A	examples/sveltekit/src/routes/+layout.server.ts
  M	examples/sveltekit/src/routes/+layout.svelte
  M	examples/sveltekit/vite.config.ts
  M	package-lock.json
  M	packages/node/README.md
  M	packages/node/src/contentful-experiences.test.ts
  M	packages/node/src/contentful-experiences.ts
  M	packages/node/src/index.ts
  A	packages/runtime/src/consent.ts
  M	packages/runtime/src/constants.test.ts
  M	packages/runtime/src/constants.ts
  M	packages/runtime/src/index.ts
  M	packages/runtime/src/personalization-delivery.test.ts
  M	packages/runtime/src/personalization-delivery.ts
  M	packages/runtime/src/runtime-event-methods.test.ts
  M	packages/runtime/src/runtime-event-methods.ts
  M	packages/web/README.md
  M	packages/web/src/contentful-experiences.current-page.test.ts
  M	packages/web/src/contentful-experiences.delivery.test.ts
  M	packages/web/src/contentful-experiences.handoff.test.ts
  A	packages/web/src/contentful-experiences.identity.test.ts
  A	packages/web/src/contentful-experiences.prepared-consent.test.ts
  M	packages/web/src/contentful-experiences.test.ts
  M	packages/web/src/contentful-experiences.tracking.test.ts
  M	packages/web/src/contentful-experiences.ts
  A	packages/web/src/handoff-continuity.test.ts
  A	packages/web/src/handoff-continuity.ts
  A	packages/web/src/identity-cookie.test.ts
  A	packages/web/src/identity-cookie.ts
  M	packages/web/src/index.ts
  M	packages/web/src/interaction-tracking.ts
  A	packages/web/src/lib/cookies.test.ts
  A	packages/web/src/lib/cookies.ts
  M	packages/web/src/paired-handoff.integration.test.ts
  M	packages/web/src/storage/local-store.test.ts
  M	packages/web/src/storage/local-store.ts
  A	packages/web/src/test-fixtures/consent.ts
  A	packages/web/src/web-singleton.test.ts

### 🧱 Updated Dependencies

- Updated runtime to 0.0.3
- Updated client to 0.9.4
- Updated core to 0.12.3

## 0.5.3 (2026-10-12)

### 🚀 Features

- [NT-4312] keep a raw payload's source map and let callers override it ([#222](https://github.com/contentful/experiences/pull/222))

### 🧱 Updated Dependencies

- Updated runtime to 0.0.2
- Updated client to 0.9.3
- Updated core to 0.12.2

## 0.5.2 (2026-10-09)

### 🚀 Features

- **runtime:** extract shared runtime from client ([#228](https://github.com/contentful/experiences/pull/228))

### 🧱 Updated Dependencies

- Updated runtime to 0.0.1
- Updated client to 0.9.2
- Updated core to 0.12.1

## 0.5.1 (2026-10-08)

### 🧱 Updated Dependencies

- Updated client to 0.9.1

## 0.5.0 (2026-10-08)

### 🚀 Features

- ⚠️  remove sdk viewport surface [SPA-5275] ([#220](https://github.com/contentful/experiences/pull/220))

### ⚠️  Breaking Changes

- remove sdk viewport surface [SPA-5275]  ([#220](https://github.com/contentful/experiences/pull/220))
  The SDK no longer exposes viewport definitions, viewport-aware design-value resolution, or active-viewport hooks. Use CSS media queries or application-owned matchMedia integration for responsive behavior. Delivered design property values are now flat and require no migration."
  M	AGENTS.md
  M	ARCHITECTURE.md
  M	CONTRIBUTING.md
  M	README.md
  M	catalog-info.yaml
  M	examples/angular/README.md
  M	examples/angular/src/app/components/heading.component.ts
  D	examples/angular/src/app/lib/detect-viewport.ts
  M	examples/angular/src/app/lib/experience-config.ts
  M	examples/angular/src/app/lib/experience-route-data.ts
  M	examples/angular/src/app/pages/experience-page.component.ts
  M	examples/angular/src/server.ts
  M	examples/nextjs/README.md
  M	examples/nextjs/app/[slug]/page.tsx
  M	examples/nextjs/components/Heading.tsx
  M	examples/nextjs/components/LivePreviewExperience.tsx
  M	examples/nextjs/components/Section.tsx
  D	examples/nextjs/lib/detect-viewport.ts
  M	examples/nextjs/lib/experience-config.tsx
  M	examples/scripts/bootstrap-example.ts
  M	examples/scripts/fixture/experience.ts
  M	examples/scripts/fixture/types.ts
  M	examples/sveltekit/README.md
  M	examples/sveltekit/src/lib/components/Heading.svelte
  D	examples/sveltekit/src/lib/detect-viewport.ts
  M	examples/sveltekit/src/lib/experience-config.ts
  M	examples/sveltekit/src/routes/[slug]/+page.server.ts
  M	examples/sveltekit/src/routes/[slug]/+page.svelte
  M	examples/sveltekit/vite.config.ts
  M	package-lock.json
  M	packages/adapter-angular/README.md
  M	packages/adapter-angular/src/client-experience-renderer.component.ts
  M	packages/adapter-angular/src/context.ts
  M	packages/adapter-angular/src/debug-experience.test.ts
  M	packages/adapter-angular/src/debug-panel-coverage.ssr.test.ts
  M	packages/adapter-angular/src/debug-panel-coverage.test.ts
  M	packages/adapter-angular/src/dom-parity.test.ts
  M	packages/adapter-angular/src/experience-defaults.ts
  M	packages/adapter-angular/src/experience-scope.ts
  M	packages/adapter-angular/src/index.ts
  D	packages/adapter-angular/src/inject-active-viewport.ts
  M	packages/adapter-angular/src/inject-design-values.ts
  M	packages/adapter-angular/src/inject-experience-plan.ts
  M	packages/adapter-angular/src/live-preview-experience.ssr.test.ts
  M	packages/adapter-angular/src/live-preview-experience.test.ts
  M	packages/adapter-angular/src/node-render-engine.test.ts
  M	packages/adapter-angular/src/node-render-engine.ts
  M	packages/adapter-angular/src/node-scopes.ts
  M	packages/adapter-angular/src/nodes-renderer.ssr.test.ts
  M	packages/adapter-angular/src/server-experience-renderer.component.ts
  M	packages/adapter-angular/src/server-renderer.test.ts
  M	packages/adapter-angular/src/test-fixtures/render-harness.ts
  M	packages/adapter-angular/src/types.ts
  M	packages/adapter-react/README.md
  M	packages/adapter-react/src/client-renderer.tsx
  M	packages/adapter-react/src/context.tsx
  M	packages/adapter-react/src/debug-experience.test.tsx
  M	packages/adapter-react/src/debug-experience.tsx
  M	packages/adapter-react/src/debug-panel-coverage.test.tsx
  M	packages/adapter-react/src/index.ts
  M	packages/adapter-react/src/nodes-renderer.ssr.test.tsx
  M	packages/adapter-react/src/nodes-renderer.test.tsx
  M	packages/adapter-react/src/nodes-renderer.tsx
  M	packages/adapter-react/src/server-renderer.test.tsx
  M	packages/adapter-react/src/server-renderer.tsx
  M	packages/adapter-react/src/types.ts
  D	packages/adapter-react/src/use-active-viewport.ts
  M	packages/adapter-react/src/use-design-values.tsx
  M	packages/adapter-react/src/use-experience-plan.test.tsx
  M	packages/adapter-react/src/use-experience-plan.ts
  M	packages/adapter-react/src/use-live-preview-experience.test.tsx
  M	packages/adapter-react/src/use-live-preview.test.tsx
  M	packages/adapter-svelte/README.md
  M	packages/adapter-svelte/src/ClientExperienceRenderer.svelte
  M	packages/adapter-svelte/src/DebugExperience.svelte
  M	packages/adapter-svelte/src/DebugExperience.test.ts
  M	packages/adapter-svelte/src/NodeRenderer.svelte
  M	packages/adapter-svelte/src/NodeRenderer.test.ts
  M	packages/adapter-svelte/src/NodesRenderer.svelte
  M	packages/adapter-svelte/src/ServerExperienceRenderer.svelte
  M	packages/adapter-svelte/src/component-props.ts
  M	packages/adapter-svelte/src/context.ts
  M	packages/adapter-svelte/src/debug-panel-coverage.ssr.test.ts
  M	packages/adapter-svelte/src/debug-panel-coverage.test.ts
  M	packages/adapter-svelte/src/get-design-values.ts
  M	packages/adapter-svelte/src/index.ts
  M	packages/adapter-svelte/src/nodes-renderer.ssr.test.ts
  M	packages/adapter-svelte/src/server-renderer.test.ts
  M	packages/adapter-svelte/src/types.ts
  D	packages/adapter-svelte/src/use-active-viewport.svelte.ts
  M	packages/adapter-svelte/src/use-experience-plan.test.ts
  M	packages/adapter-svelte/src/use-live-preview-experience.test.ts
  M	packages/adapter-svelte/src/use-live-preview.test.ts
  M	packages/client/src/contentful-experiences.test.ts
  M	packages/client/src/contentful-experiences.ts
  M	packages/client/src/fetch-experience.test.ts
  M	packages/client/src/fetch-experience.ts
  M	packages/core/README.md
  A	packages/core/src/design-properties.test.ts
  A	packages/core/src/design-properties.ts
  M	packages/core/src/index.ts
  M	packages/core/src/resolve-experience.test.ts
  M	packages/core/src/resolve-experience.ts
  M	packages/core/src/types.ts
  D	packages/core/src/viewport.test.ts
  D	packages/core/src/viewport.ts
  M	packages/design/README.md
  M	packages/design/package.json
  M	packages/design/src/index.ts
  D	packages/design/src/media-query-matchers.ts
  D	packages/design/src/select-resolved-design.ts
  D	packages/design/src/viewport.test.ts
  D	packages/design/src/viewport.ts
  M	packages/live-preview/README.md
  M	packages/live-preview/src/experience-payload.ts
  M	packages/live-preview/src/fetch-preview-session.test.ts
  M	packages/live-preview/src/fetch-preview-session.ts
  M	packages/live-preview/src/live-preview-client.test.ts
  M	packages/node/README.md
  M	packages/node/src/contentful-experiences.test.ts
  M	packages/node/src/contentful-experiences.ts
  M	packages/web/README.md
  M	packages/web/src/contentful-experiences.test.ts

### 🧱 Updated Dependencies

- Updated client to 0.9.0
- Updated core to 0.12.0

## 0.4.0 (2026-10-06)

### 🧱 Updated Dependencies

- Updated client to 0.8.0
- Updated core to 0.11.0

## 0.3.1 (2026-10-01)

### 🚀 Features

- persist web personalization profile ID ([#213](https://github.com/contentful/experiences/pull/213))

### 🧱 Updated Dependencies

- Updated client to 0.7.1
- Updated core to 0.10.1

## 0.3.0 (2026-09-30)

### 🚀 Features

- ⚠️  add event-triggering methods to runtimes ([#209](https://github.com/contentful/experiences/pull/209))

### ⚠️  Breaking Changes

- add event-triggering methods to runtimes  ([#209](https://github.com/contentful/experiences/pull/209))

### 🧱 Updated Dependencies

- Updated client to 0.7.0

## 0.2.0 (2026-09-30)

### 🚀 Features

- ⚠️  add XDA personalization extensions ([#211](https://github.com/contentful/experiences/pull/211))

### ⚠️  Breaking Changes

- add XDA personalization extensions  ([#211](https://github.com/contentful/experiences/pull/211))

### 🧱 Updated Dependencies

- Updated client to 0.6.0
- Updated core to 0.10.0

## 0.1.2 (2026-09-29)

### 🧱 Updated Dependencies

- Updated client to 0.5.2
- Updated core to 0.9.2

## 0.1.1 (2026-09-29)

### 🚀 Features

- add Web SDK runtime ([#208](https://github.com/contentful/experiences/pull/208))

### 🧱 Updated Dependencies

- Updated client to 0.5.1
- Updated core to 0.9.1

## 0.1.0 (2026-09-28)

### 🚀 Features

- ⚠️  add request-scoped Node SDK ([#207](https://github.com/contentful/experiences/pull/207))

### ⚠️  Breaking Changes

- add request-scoped Node SDK  ([#207](https://github.com/contentful/experiences/pull/207))
  ContentfulExperiencesConfig now requires eventBuilder.channel."
  M	.husky/pre-commit
  M	AGENTS.md
  M	ARCHITECTURE.md
  M	README.md
  M	package-lock.json
  M	packages/client/README.md
  M	packages/client/src/contentful-experiences.test.ts
  M	packages/client/src/contentful-experiences.ts
  A	packages/node/README.md
  A	packages/node/package.json
  A	packages/node/project.json
  A	packages/node/src/contentful-experiences.test.ts
  A	packages/node/src/contentful-experiences.ts
  A	packages/node/src/index.ts
  A	packages/node/src/sdk-info.ts
  A	packages/node/tsconfig.json
  A	packages/node/tsconfig.lib.json
  A	packages/node/tsup.config.ts
  A	packages/node/vitest.config.ts

### 🧱 Updated Dependencies

- Updated client to 0.5.0
- Updated core to 0.9.0