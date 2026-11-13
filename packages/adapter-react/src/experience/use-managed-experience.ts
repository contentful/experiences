'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
import type {
  DestinationRedirectResult,
  FetchExperienceOptions,
  FetchResolveOptions,
} from '@contentful/experiences-web';
import { RuntimeContext } from '../runtime/context.js';
import { useRequestContext } from '../runtime/request-context.js';
import { useObservableState } from '../runtime/use-experiences-state.js';
import type { Config } from '../registry/types.js';
import type { SuppliedExperienceProps } from './experience.js';
import { SourceController, type ManagedExperienceSnapshot } from './source-controller.js';

export interface ExperienceNotifications {
  /** Current usable presentation, after React commits it. */
  readonly onExperienceResolved?: (
    result: ManagedExperienceResult & { readonly data: PortableRenderPlan }
  ) => void;
  readonly onRedirect?: (
    redirect: DestinationRedirectResult['redirect'],
    result: ManagedExperienceResult
  ) => void;
  /** Current error, including errors alongside retained usable content. */
  readonly onExperienceError?: (error: Error, result: ManagedExperienceResult) => void;
}

export type ManagedExperienceOptions = FetchExperienceOptions &
  ExperienceNotifications & {
    readonly config: Config;
    readonly initialPlan?: PortableRenderPlan;
    /** Terminal error for this descriptor; binds preview without a startup refetch. */
    readonly initialError?: Error;
    readonly resolveOptions?: Omit<FetchResolveOptions, 'config'>;
  };

export interface ManagedExperienceResult extends ManagedExperienceSnapshot {
  refresh(): Promise<void>;
  retry(): Promise<void>;
}

const noRefresh = async (): Promise<void> => {};

/** Shared commit notifications; callback replacement and StrictMode do not repeat a presentation. */
function useExperienceNotifications(
  result: ManagedExperienceResult,
  { onExperienceResolved, onExperienceError, onRedirect }: ExperienceNotifications,
  isCurrent: () => boolean
): void {
  const reported = useRef<{
    data?: PortableRenderPlan;
    error?: Error;
    redirect?: DestinationRedirectResult['redirect'];
  }>({});
  useEffect(() => {
    if (!isCurrent()) return;
    const { data, error, redirect } = result;
    const changedData = data !== undefined && reported.current.data !== data;
    const changedError = error !== undefined && reported.current.error !== error;
    const changedRedirect = redirect !== undefined && reported.current.redirect !== redirect;
    reported.current = { data, error, redirect };
    if (changedRedirect) onRedirect?.(redirect, result);
    if (changedData) onExperienceResolved?.({ ...result, data });
    // A resolution callback can synchronously unmount or supersede this owner.
    if (changedError && isCurrent()) onExperienceError?.(error, result);
  });
}

/** Resolve managed content after commit, preserving an application-supplied initial plan. */
export function useManagedExperience(options: ManagedExperienceOptions): ManagedExperienceResult {
  return useExperienceSource(options);
}

/** Internal source selection keeps one controller and renderer mounted across mode changes. */
export function useExperienceSource(
  options: ManagedExperienceOptions | SuppliedExperienceProps
): ManagedExperienceResult {
  const context = useContext(RuntimeContext);
  const managed = options.experienceId !== undefined || options.destinationId !== undefined;
  if (managed && !context)
    throw new Error('Experiences hooks require an ExperiencesRoot or ExperiencesProvider.');
  const requestContext = useRequestContext();
  const locale = useObservableState(managed ? context?.sdk.states.locale : undefined);
  const suppliedData = managed ? undefined : (options.experience ?? undefined);
  const suppliedStatus = suppliedData ? 'success' : 'idle';
  const [controller] = useState(
    () =>
      new SourceController(
        managed ? options.initialPlan : suppliedData,
        managed ? options.initialError : undefined
      )
  );
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());

  useEffect(() => {
    controller.setSnapshotListener(setSnapshot);
    return () => {
      controller.setSnapshotListener(undefined);
      controller.disconnect();
    };
  }, [controller]);

  // Deliberately passive: ancestor activation and route guards install during layout.
  // The controller compares effective values, so fresh equivalent objects do not refetch.
  useEffect(() => {
    if (options.experienceId === undefined && options.destinationId === undefined) {
      controller.updateSupplied(suppliedData);
      return;
    }
    const { config, initialPlan, initialError, resolveOptions } = options;
    // Select the transport fields once; presentation props never enter SDK descriptors.
    const request: FetchExperienceOptions =
      options.experienceId !== undefined
        ? {
            experienceId: options.experienceId,
            locale: options.locale,
            parameters: options.parameters,
            personalization: options.personalization,
            extensions: options.extensions,
          }
        : options.nodeId !== undefined
          ? {
              destinationId: options.destinationId!,
              nodeId: options.nodeId,
              locale: options.locale,
              personalization: options.personalization,
            }
          : {
              destinationId: options.destinationId!,
              path: options.path!,
              locale: options.locale,
              personalization: options.personalization,
            };
    const liveSdk = context?.isLive ? context.sdk : undefined;
    const previewRequest = liveSdk?.isPreview === true;
    controller.updateOptions({
      seedRequest: request,
      effectiveLocale: request.locale ?? locale,
      request:
        request.experienceId !== undefined
          ? {
              ...request,
              locale: request.locale ?? (previewRequest ? undefined : locale),
              extensions: previewRequest
                ? request.extensions
                : { ...request.extensions, sourceMap: request.extensions?.sourceMap ?? {} },
            }
          : { ...request, locale: request.locale ?? (previewRequest ? undefined : locale) },
      resolve: { ...resolveOptions, config },
      initialPlan,
      initialError,
      requestContext,
      sdk: liveSdk,
    });
  });

  const presentation: ManagedExperienceSnapshot =
    !managed &&
    (snapshot.data !== suppliedData ||
      snapshot.error !== undefined ||
      snapshot.status !== suppliedStatus)
      ? {
          status: suppliedStatus,
          data: suppliedData,
          error: undefined,
        }
      : snapshot;
  const result = {
    ...presentation,
    refresh: managed ? controller.refresh : noRefresh,
    retry: managed ? controller.retry : noRefresh,
  };
  useExperienceNotifications(result, options, () => controller.isCurrentSnapshot(presentation));
  return result;
}
