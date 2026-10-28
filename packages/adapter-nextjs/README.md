# @contentful/experiences-nextjs

Next.js adapter for Contentful Experiences. This foundation exposes the shared React rendering APIs through explicit entries. Install this package with Next.js 15.5 and React 19:

```sh
npm install @contentful/experiences-nextjs next@^15.5.0 react@^19.0.0 react-dom@^19.0.0
```

The package is ESM and preserves per-file client boundaries. The root entry has no runtime exports; choose a subpath:

| Entry                  | Available APIs                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/server`              | Public React server renderer, registry helpers and types, free Delivery fetch/client functions, resolver, design utilities, attribution helpers, and event builder. |
| `/client`              | Public React client renderer, render-context and design hooks, supplied-payload `useExperiencePlan`, and shared rendering helpers and types. Marked `'use client'`. |
| `/custom-renderer`     | `resolveNodeProps`, `NodeSnapshot`, `ResolvedNode`, `ExperienceNode`, `ExperienceNodeProps`, and `createExperienceNode`.                                            |
| `/tracking-attributes` | `getTrackingAttributes`, `TrackingAttributes`, `TRACKING_SCOPES_ATTRIBUTE`, and `TRACKING_CLICKABLE_ATTRIBUTE`.                                                     |
| `/package.json`        | Package metadata.                                                                                                                                                   |

For server rendering, fetch and resolve a plan using your application-owned registry, then pass it as `experience`:

```tsx
import { fetchExperience, ServerExperienceRenderer } from '@contentful/experiences-nextjs/server';
import { experienceConfig } from './experience-config';

export default async function ExperiencePage() {
  const experience = await fetchExperience(
    {
      spaceId: process.env.CONTENTFUL_SPACE_ID!,
      environmentId: 'master',
      experienceId: 'my-experience',
      locale: 'en-US',
    },
    { accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN! },
    { config: experienceConfig }
  );

  return <ServerExperienceRenderer experience={experience} config={experienceConfig} />;
}
```

In a Client Component, import `ExperienceRenderer` from `@contentful/experiences-nextjs/client` and pass the same `experience` and browser rendering registry. Custom renderers can import the composition primitives from `/custom-renderer` and spread attributes from `/tracking-attributes` onto their rendered elements. See the [React adapter](../adapter-react/README.md) for registration, design props, slots, and supplied-plan rendering contracts.

Normal entries and declarations do not require the optional Live Preview package. The `/server` entry does not load the live Web SDK. The Node SDK is a dependency for subsequent server integration utilities.

## Development

From the workspace root, after installing dependencies:

```sh
npx nx build adapter-nextjs
npx nx test adapter-nextjs
npx nx lint adapter-nextjs
npx nx typecheck adapter-nextjs
npx nx run adapter-nextjs:pack
```

Build and test targets follow the React adapter's tsup/Vitest setup. Lint and typecheck are inferred by the workspace Nx plugins; packing uses `scripts/pack-package.ts`. Package tests check the built exports, client directive, Node ESM imports, declaration compatibility, and server/preview dependency boundaries without network requests or a consumer project.
