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
         identitySetCookie({ canPersistProfile, ... })  ──►  Set-Cookie
         prepareRequestHandoff()  ──►  handoff carrying the same identity
browser: Web SDK hydrates the handoff  ──►  the identity continues
```

The Node SDK never touches HTTP. It takes the profile and consent from you and answers one
question: `canPersistProfile`, whether you may keep the identity. Everything about cookies
lives in [`identity-cookie.ts`](./identity-cookie.ts), which is host code, not SDK API.

## Consent is yours

Server-side consent has to come from your application: your own consent record, a session, a
consent management platform token. **Neither the identity cookie being present nor anything in
the browser's storage is server-side consent**, so a visitor who sent the cookie but has not
been granted persistence gets it expired, not kept alive. `server.ts` reads a cookie of its
own (`app-personalization-consent`) to show where that decision belongs; replace it.

## Cookie settings

`identitySetCookie` takes the same settings as the Web SDK's `cookie` option: domain, path,
SameSite, Secure and expiry (365 days by default). Configure both sides identically. A cookie is
deleted in the scope it was written in, so a mismatch leaves the old one behind.

## Run it

```sh
cp .env.example .env   # SPACE_ID, ENVIRONMENT_ID, CDA_TOKEN
npm run start          # http://localhost:4100
```

Send `Cookie: ctfl-opt-aid=<id>; app-personalization-consent=granted` to see the identity reused
and the handoff returned. Without the consent cookie the identity is expired.

## Tested

[`paired-handoff.integration.test.ts`](../../packages/web/src/paired-handoff.integration.test.ts)
drives these same functions through the whole sequence: the Web SDK persists an identity, the
next server request carries it, Node reuses the profile, and the handoff continues it in a new
browser runtime. It also covers withholding, withdrawal and a later grant.
