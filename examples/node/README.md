# Node example: the identity cookie

A framework-neutral server that carries a visitor's identity between the browser and the
Node SDK. It uses only `node:http`, so every line of host code here maps onto whatever your
framework calls a request, a response and a header.

## What it shows

The Web SDK writes an identity cookie (`ctfl-opt-aid`) when the visitor has granted
persistence. A server can read it to recognise that visitor on the next request.

```
browser: Web SDK persists the identity  ──►  ctfl-opt-aid cookie
                                                   │  sent with the next request
server:  readIdentity(cookie)                      ▼
         forRequest({ profile, consent })  ──►  Node SDK reuses the profile
         page()  ──►  sends the event and adopts the response profile
         identitySetCookie({ isPreview, canPersistProfile, ... })  ──►  Set-Cookie
browser: sends the identity cookie with the next request  ──►  the identity continues
```

The Node SDK never touches HTTP. It takes the profile and consent from you and answers one
question: `canPersistProfile`, whether you may keep the identity. Everything about cookies
lives in [`identity-cookie.ts`](./identity-cookie.ts), which is host code, not SDK API.

The server uses one process-wide SDK and a facade per request. After `request.page()`
completes, `request.profile?.id` supplies the identity for both the cookie and the JSON
response. A `finally` block destroys the request facade, including when sending fails.

## Consent is yours

Server-side consent has to come from your application: your own consent record, a session, a
consent management platform token. **Neither the identity cookie being present nor anything in
the browser's storage is server-side consent**, so a visitor who sent the cookie but has not
been granted persistence gets it expired, not kept alive. `server.ts` reads a cookie of its
own (`app-personalization-consent`) to show where that decision belongs; replace it.

The default event allowlist permits `page` even without event consent. Withholding
persistence consent still prevents the returned identity from being saved in a cookie.

Pass both `request.isPreview` and `request.canPersistProfile` to `identitySetCookie`.
In Session preview, `canPersistProfile` is false, but the helper skips both writing and
expiring the cookie so the visitor's existing identity remains untouched. Outside preview,
withheld persistence consent still expires an existing cookie.

## Cookie settings

`identitySetCookie` takes the Web SDK's `cookie` option as it is: `domain`, `path`, a lowercase
`sameSite`, `secure` and `expires` in days (365 by default). Share one settings object between
both sides. A cookie is
deleted in the scope it was written in, so a mismatch leaves the old one behind.

## Run it

```sh
cp .env.example .env   # SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run start          # http://localhost:4100
```

Send `Cookie: ctfl-opt-aid=<id>; app-personalization-consent=granted` to see the identity reused
and returned as `{ "identity": "<id>" }`. Without the consent cookie the identity cookie is expired.

## Tested

Run `npm run typecheck` to check this example against the installed Node SDK.
The SDK's [request tests](../../packages/node/src/contentful-experiences.test.ts) cover
direct page events, request-local profiles, and consent. The Web SDK's
[identity-cookie tests](../../packages/web/src/identity-cookie.test.ts) cover browser cookie
persistence, withdrawal, and legacy-cookie migration.
