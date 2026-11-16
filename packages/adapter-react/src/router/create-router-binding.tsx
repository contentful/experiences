'use client';

import type { CurrentPageOptions } from '@contentful/experiences-web';
import {
  createExperiences,
  type CreateExperiencesOptions,
} from '../experience/create-experiences.js';
import {
  buildAutoPagePayload,
  buildRouterPagePayload,
  type AutoPagePayloadOptions,
  type RouterProviderProps,
  type RouterRootProps,
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
  options: CreateExperiencesOptions,
  useRouteContext: () => TRouteContext,
  useRedirect?: () => NonNullable<CreateExperiencesOptions['onRedirect']>
) {
  const bound = createExperiences(options);

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
  }: RouterRootProps<TRouteContext>) {
    const inputs = usePageInputs({ pagePayload, getPagePayload });
    return <bound.ExperiencesRoot {...props} {...inputs} />;
  }

  function ExperiencesProvider({
    pagePayload,
    getPagePayload,
    ...props
  }: RouterProviderProps<TRouteContext>) {
    const inputs = usePageInputs({ pagePayload, getPagePayload });
    return <bound.ExperiencesProvider {...props} {...inputs} />;
  }

  function Experience(props: Parameters<typeof bound.Experience>[0]) {
    const onRedirect = useRedirect?.();
    return (
      <bound.Experience
        {...props}
        onRedirect={props.onRedirect ?? options.onRedirect ?? onRedirect}
      />
    );
  }

  function useManagedExperience(managedOptions: Parameters<typeof bound.useManagedExperience>[0]) {
    const onRedirect = useRedirect?.();
    return bound.useManagedExperience({
      ...managedOptions,
      onRedirect: managedOptions.onRedirect ?? options.onRedirect ?? onRedirect,
    });
  }

  return { ...bound, Experience, useManagedExperience, ExperiencesRoot, ExperiencesProvider };
}
