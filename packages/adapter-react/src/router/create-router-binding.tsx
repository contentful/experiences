'use client';

import type { CurrentPageOptions } from '@contentful/experiences-web';
import {
  createReactExperiences,
  type CreateReactExperiencesOptions,
} from '../experience/create-react-experiences.js';
import {
  buildAutoPagePayload,
  buildRouterPagePayload,
  type AutoPagePayloadOptions,
  type RouterExperiencesProviderProps,
  type RouterExperiencesRootProps,
} from './page-payload.js';

export interface RouterPageContext {
  readonly hash: string;
  readonly pathname: string;
  readonly routeKey: string;
  readonly search: string;
  readonly url: string;
}

/** Router hooks supply context; the existing owner sequence constructs and admits events. */
export function createRouterBinding<TRouteContext extends RouterPageContext>(
  options: CreateReactExperiencesOptions,
  useRouteContext: () => TRouteContext
) {
  const bound = createReactExperiences(options);

  function usePageInputs(payloadOptions: AutoPagePayloadOptions<TRouteContext>) {
    const context = useRouteContext();
    const { routeKey } = context;
    // The owner reads the latest callback only when an emission is eligible.
    const buildPagePayload: CurrentPageOptions['buildPayload'] = ({ isInitialEmission }) =>
      buildAutoPagePayload(buildRouterPagePayload(context), payloadOptions, {
        context,
        routeKey,
        isInitialEmission,
      });
    return { routeKey, buildPagePayload };
  }

  function ExperiencesRoot({
    pagePayload,
    getPagePayload,
    ...props
  }: RouterExperiencesRootProps<TRouteContext>) {
    const inputs = usePageInputs({ pagePayload, getPagePayload });
    return <bound.ExperiencesRoot {...props} {...inputs} />;
  }

  function ExperiencesProvider({
    pagePayload,
    getPagePayload,
    ...props
  }: RouterExperiencesProviderProps<TRouteContext>) {
    const inputs = usePageInputs({ pagePayload, getPagePayload });
    return <bound.ExperiencesProvider {...props} {...inputs} />;
  }

  return { ...bound, ExperiencesRoot, ExperiencesProvider };
}
